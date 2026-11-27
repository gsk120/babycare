import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cookingStepTitle } from "../cooking-steps.js";
import { RequestError } from "./http.js";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionPattern = /^[0-9a-f]{64}$/;
const bucket = "babycare-recipe-images";
const imageDownloadLifetime = 3600;
const imagePath = (version, step) => `cooking/${version}/${step}.webp`;
const clean = (value) => value.normalize("NFC").trim().replace(/\s+/gu, " ");

function requireId(value) {
  if (typeof value !== "string" || !idPattern.test(value)) throw new RequestError(400, "레시피 작업 ID를 확인해 주세요.");
}

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.BABYCARE_STORAGE_SECRET_KEY?.trim();
  if (!url || !key) throw new RequestError(503, "서버에 조리 이미지 Storage 설정이 필요해요.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(bucket);
}

export async function imageSchemaAvailable(db) {
  const { rows: [row] } = await db.query("select to_regclass('babycare.recipe_step_images') is not null as available");
  return row.available;
}

export async function registerRecipeImages(db, batchId, stage = null) {
  const { rows } = await db.query(
    `select i.id, d.name, i.meals, i.ingredients, i.instructions as steps
       from babycare.recommendation_items i join babycare.dish_catalog d on d.id = i.dish_id
      where i.batch_id = $1 and i.image_version is null`, [batchId]);
  if (!rows.length) return;

  const entries = rows.map(({ id, name, meals, ingredients, steps }) => {
    const normalizedIngredients = ingredients.map(({ name: ingredient, quantity, unit }) =>
      [clean(ingredient), quantity, clean(unit)]);
    const recipe = { stage, name: clean(name), meals, ingredients: normalizedIngredients, steps: steps.map(clean) };
    const sortedIngredients = normalizedIngredients.map((ingredient) => JSON.stringify(ingredient)).sort();
    const version = createHash("sha256").update(JSON.stringify([1, { ...recipe, ingredients: sortedIngredients }])).digest("hex");
    return { id, version, recipe };
  });

  const raw = JSON.stringify(entries);
  await db.query(
    `insert into babycare.recipe_image_sets (version, recipe)
       select distinct on (version) version, recipe
         from jsonb_to_recordset($1::jsonb) as entry(version text, recipe jsonb)
        order by version on conflict (version) do nothing`, [raw]);
  const steps = entries.flatMap(({ version, recipe }) => recipe.steps.map((description, index) => {
    const title = cookingStepTitle(description);
    return { version, step: index + 1, title, alt: `${recipe.name} 조리 단계 ${index + 1}, ${title}` };
  }));
  await db.query(
    `insert into babycare.recipe_step_images (version, step, title, alt)
       select distinct on (version, step) version, step, title, alt
         from jsonb_to_recordset($1::jsonb) as entry(version text, step smallint, title text, alt text)
        order by version, step on conflict (version, step) do nothing`, [JSON.stringify(steps)]);
  await db.query(
    `update babycare.recommendation_items i set image_version = entry.version
       from jsonb_to_recordset($1::jsonb) as entry(id uuid, version text)
      where i.id = entry.id and i.image_version is null`, [raw]);
}

export async function prepareRecipeImages(db, familyId, batchId) {
  requireId(familyId);
  if (batchId != null) requireId(batchId);
  if (!await imageSchemaAvailable(db)) throw new RequestError(503, "조리 이미지 DB 마이그레이션을 먼저 실행해 주세요.");
  const { rows: [batch] } = await db.query(
    `select id from babycare.recommendation_batches
      where family_id = $1 and ($2::uuid is null or id = $2)
      order by recommendation_date desc limit 1`, [familyId, batchId ?? null]);
  if (!batch) return { batchId: null };
  await registerRecipeImages(db, batch.id);
  return { batchId: batch.id };
}

export async function claimRecipeImage(db, batchId) {
  requireId(batchId);
  const files = storage();
  const leaseId = randomUUID();
  const { rows: [task] } = await db.query(
    `with candidate as (
       select img.version, img.step from babycare.recipe_step_images img
        where (img.status in ('pending', 'failed') or (img.status = 'processing' and img.lease_until <= now()))
          and exists (select 1 from babycare.recommendation_items i where i.batch_id = $1 and i.image_version = img.version)
        order by img.version, img.step
        limit 1 for update skip locked
     )
     update babycare.recipe_step_images img
        set status = 'processing', lease_id = $2, lease_until = now() + interval '10 minutes'
       from candidate, babycare.recipe_image_sets images
      where img.version = candidate.version and img.step = candidate.step and images.version = img.version
      returning img.version, img.step, images.recipe`, [batchId, leaseId]);
  if (!task) return { task: null };

  try {
    const path = imagePath(task.version, task.step);
    const { data: exists } = await files.exists(path);
    if (exists) {
      await finishRecipeImage(db, { ...task, leaseId }, true, false);
      return { recovered: true };
    }
    const { data, error } = await files.createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    return { task: { ...task, leaseId, uploadUrl: data.signedUrl } };
  } catch {
    await finishRecipeImage(db, { ...task, leaseId }, false);
    throw new RequestError(503, "조리 이미지 업로드를 준비하지 못했어요. Storage 버킷과 서버 키를 확인해 주세요.");
  }
}

export async function finishRecipeImage(db, { version, step, leaseId }, succeeded, verifyFile = true) {
  if (typeof version !== "string" || !versionPattern.test(version) ||
      !Number.isInteger(step) || step < 1 || step > 30) throw new RequestError(400, "조리 이미지 단계를 확인해 주세요.");
  requireId(leaseId);
  const path = imagePath(version, step);
  if (succeeded && verifyFile) {
    const { data: exists } = await storage().exists(path);
    if (!exists) throw new RequestError(409, "Storage에서 업로드된 이미지를 찾을 수 없어요.");
  }
  const { rowCount } = await db.query(
    `update babycare.recipe_step_images
        set status = $4, object_path = $5, lease_id = null, lease_until = null
      where version = $1 and step = $2 and lease_id = $3 and lease_until > now()`,
    [version, step, leaseId, succeeded ? "ready" : "failed", succeeded ? path : null]);
  if (!rowCount) throw new RequestError(409, "조리 이미지 작업 시간이 끝났거나 이미 처리됐어요.");
  return { status: succeeded ? "ready" : "failed" };
}

export async function readRecipeImages(db, familyId, itemId) {
  requireId(itemId);
  if (!await imageSchemaAvailable(db)) return { steps: [] };
  const { rows } = await db.query(
    `select img.step, img.title, img.alt,
            case when img.status = 'processing' and img.lease_until <= now() then 'failed' else img.status end as status,
            img.object_path as path
       from babycare.recommendation_items i
       join babycare.recommendation_batches b on b.id = i.batch_id
       left join babycare.recipe_step_images img on img.version = i.image_version
      where i.id = $1 and b.family_id = $2
      order by img.step`, [itemId, familyId]);
  if (!rows.length) throw new RequestError(404, "레시피를 찾을 수 없어요.");
  const ready = rows.filter(({ path }) => path);
  let urls = new Map();
  if (ready.length && process.env.BABYCARE_STORAGE_SECRET_KEY?.trim()) {
    try {
      const { data } = await storage().createSignedUrls(ready.map(({ path }) => path), imageDownloadLifetime);
      urls = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
    } catch {
      // The recipe instructions are still available if Storage cannot sign a file.
    }
  }
  return { expiresIn: imageDownloadLifetime,
    steps: rows.filter((row) => row.step !== null).map(({ path, ...step }) => ({ ...step, url: urls.get(path) ?? null })) };
}
