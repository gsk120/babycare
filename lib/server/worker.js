import { createHash, timingSafeEqual } from "node:crypto";
import { monthsOld } from "../../app/model.js";
import { validateRecommendation } from "../recommendation.js";
import { RequestError } from "./http.js";
import { imageSchemaAvailable, registerRecipeImages } from "./recipe-images.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (value) => createHash("sha256").update(value).digest();
const digest = (value) => hash(JSON.stringify(value)).toString("hex");

export function authorizeWorker(request) {
  const token = process.env.BABYCARE_WORKER_TOKEN?.trim();
  if (!token) throw new RequestError(503, "워커 인증 설정이 필요해요.");
  if (!timingSafeEqual(hash(request.headers.get("authorization") ?? ""), hash(`Bearer ${token}`))) {
    throw new RequestError(401, "워커 인증에 실패했어요.");
  }
}

function requireFamilyId(familyId) {
  if (typeof familyId !== "string" || !uuid.test(familyId)) throw new RequestError(400, "가족 ID를 확인해 주세요.");
}

async function existingBatch(db, familyId, date) {
  const { rows: [batch] } = await db.query(
    `select id, recommendation_date::text as date, menu_count as "menuCount", total_meals as "totalMeals"
       from babycare.recommendation_batches
      where family_id = $1 and recommendation_date = $2`,
    [familyId, date],
  );
  return batch;
}

async function familyContext(db, familyId, date) {
  const { rows: [row] } = await db.query(
    `select c.birth_date::text as birth, c.stage, s.menu_count as "menuCount", s.total_meals as "totalMeals",
            to_jsonb(s)->>'cooking_environment' as "cookingEnvironment",
            (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'available', i.available,
                        'quantity', i.quantity, 'unit', i.unit) order by i.id), '[]')
               from babycare.inventory_items i where i.family_id = f.id) as inventory,
            (select coalesce(jsonb_agg(jsonb_build_object('date', r.occurred_on, 'kind', r.kind,
                        'dish', r.dish_name, 'notes', r.feedback) order by r.occurred_on, r.created_at, r.id), '[]')
               from babycare.care_records r where r.family_id = f.id and r.feedback is not null
                and r.occurred_on <= $2) as feedback
       from babycare.families f
       left join babycare.child_profiles c on c.family_id = f.id
       left join babycare.recommendation_settings s on s.family_id = f.id
      where f.id = $1`,
    [familyId, date],
  );
  if (!row) throw new RequestError(404, "가족을 찾을 수 없어요.");
  if (!row.birth || !row.stage || !Number.isInteger(row.menuCount) || row.menuCount < 1 || row.menuCount > 30 ||
      !Number.isInteger(row.totalMeals) || row.totalMeals < row.menuCount || row.totalMeals > 99) {
    throw new RequestError(409, "가족의 아이 프로필과 추천 설정을 먼저 등록해 주세요.");
  }
  const input = { date, ageMonths: monthsOld(row.birth, date), stage: row.stage,
    menuCount: row.menuCount, totalMeals: row.totalMeals, inventory: row.inventory,
    ...(row.cookingEnvironment && { cookingEnvironment: row.cookingEnvironment }) };
  const feedbackDigest = digest([1, row.feedback]);
  return {
    input,
    snapshot: digest([familyId, input, feedbackDigest]),
    feedbackDigest,
    feedback: row.feedback,
  };
}

export async function readWorkerJob(db, familyId, date) {
  requireFamilyId(familyId);
  const batch = await existingBatch(db, familyId, date);
  if (batch) return { status: "already_saved", batch };
  return { status: "ready", ...await familyContext(db, familyId, date) };
}

export async function saveWorkerRecommendation(db, payload, today) {
  const { familyId, date, snapshot } = payload;
  requireFamilyId(familyId);
  if (date !== today) throw new RequestError(409, "한국 시간 기준 날짜가 바뀌었어요. 추천을 다시 실행해 주세요.");
  const existing = await existingBatch(db, familyId, date);
  if (existing) return { status: "already_saved", batch: existing };
  const context = await familyContext(db, familyId, date);
  if (snapshot !== context.snapshot) throw new RequestError(409, "가족 데이터가 바뀌었어요. 추천을 다시 실행해 주세요.");

  let recipes;
  try { recipes = validateRecommendation(payload, context.input); }
  catch (error) { throw new RequestError(400, error.message); }

  const { menuCount, totalMeals } = context.input;
  const { rows: [batch] } = await db.query(
    `insert into babycare.recommendation_batches (family_id, recommendation_date, menu_count, total_meals)
     values ($1, $2, $3, $4) on conflict (family_id, recommendation_date) do nothing
     returning id, recommendation_date::text as date, menu_count as "menuCount", total_meals as "totalMeals"`,
    [familyId, date, menuCount, totalMeals],
  );
  if (!batch) return { status: "already_saved", batch: await existingBatch(db, familyId, date) };

  const names = recipes.map(({ name }) => name).sort();
  await db.query(
    `insert into babycare.dish_catalog (name) select unnest($1::text[]) on conflict (name) do nothing`,
    [names],
  );
  const entries = recipes.map((recipe, index) => ({ ...recipe, position: index + 1 }));
  const { rowCount } = await db.query(
    `with entries as (
       select * from jsonb_to_recordset($2::jsonb)
         as r(name text, position integer, meals integer, ingredients jsonb, steps text[], reason text, sources jsonb)
     )
     insert into babycare.recommendation_items (batch_id, dish_id, position, meals, ingredients, instructions, reason, sources)
     select $1, d.id, r.position, r.meals, r.ingredients, r.steps, r.reason, r.sources
       from entries r join babycare.dish_catalog d on d.name = r.name`,
    [batch.id, JSON.stringify(entries)],
  );
  if (rowCount !== recipes.length) throw new RequestError(409, "메뉴가 변경됐어요. 추천을 다시 실행해 주세요.");
  if (await imageSchemaAvailable(db)) await registerRecipeImages(db, batch.id, context.input.stage);
  return { status: "saved", batch };
}
