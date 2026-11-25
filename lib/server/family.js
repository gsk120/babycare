import { todayInKorea, weekdays } from "../../app/model.js";
import { RequestError } from "./http.js";
import { parseInventory, parseProfile, parseRecord } from "./validate.js";

export async function familyForUser(db, userId) {
  const { rows: [family] } = await db.query(
    "select id, name from babycare.families where owner_user_id = $1",
    [userId],
  );
  if (!family) throw new RequestError(403, "이 계정은 아직 가족으로 등록되지 않았어요.");
  return family;
}

export async function readFamily(db, family) {
  const { rows: [child] } = await db.query(
    "select name as child, birth_date::text as birth, stage from babycare.child_profiles where family_id = $1",
    [family.id],
  );
  const { rows: [plan] } = await db.query(
    "select weekday_mask, menu_count, total_meals from babycare.recommendation_settings where family_id = $1",
    [family.id],
  );
  const { rows: inventory } = await db.query(
    "select id, name, available, quantity::float8 as quantity, unit from babycare.inventory_items where family_id = $1 order by updated_at desc, name",
    [family.id],
  );
  const { rows: records } = await db.query(
    `select id, case kind when 'cook' then '조리' else '식사' end as kind,
            occurred_on::text as date, dish_name as recipe, feedback as notes, used_ingredients as usage
       from babycare.care_records
      where family_id = $1
      order by occurred_on desc, created_at desc, id`,
    [family.id],
  );
  const { rows: [batch] } = await db.query(
    `select id, recommendation_date::text as date, menu_count as "menuCount", total_meals as meals
       from babycare.recommendation_batches
      where family_id = $1 and recommendation_date <= $2
      order by recommendation_date desc limit 1`,
    [family.id, todayInKorea()],
  );

  let recommendation = null;
  if (batch) {
    const { rows } = await db.query(
      `select i.id, d.name, i.meals, i.ingredients, i.instructions as steps, i.reason,
              coalesce((
                select jsonb_agg(jsonb_build_object('book', p.title, 'page', s.page) order by p.title, s.page)
                from babycare.recommendation_sources as s
                join babycare.reference_pdfs as p on p.id = s.pdf_id
                where s.item_id = i.id
              ), '[]'::jsonb) as sources
         from babycare.recommendation_items as i
         join babycare.recommendation_batches as b on b.id = i.batch_id
         join babycare.dish_catalog as d on d.id = i.dish_id
        where i.batch_id = $1 and b.family_id = $2
        order by i.position`,
      [batch.id, family.id],
    );
    recommendation = { date: batch.date, menuCount: batch.menuCount, meals: batch.meals, recipes: rows };
  }

  return {
    family: { name: family.name },
    profile: {
      child: child?.child ?? "",
      birth: child?.birth ?? "",
      stage: child?.stage ?? "초기",
      days: weekdays.filter((_, index) => (plan?.weekday_mask ?? 0) & (1 << index)),
      menuCount: plan?.menu_count ?? 1,
      meals: plan?.total_meals ?? 1,
    },
    inventory,
    records,
    recommendation,
  };
}

async function saveProfile(db, familyId, payload) {
  const { child, birth, stage, mask, menuCount, meals } = parseProfile(payload);
  await db.query(
    `insert into babycare.child_profiles (family_id, name, birth_date, stage) values ($1,$2,$3,$4)
       on conflict (family_id) do update
       set name = excluded.name, birth_date = excluded.birth_date, stage = excluded.stage, updated_at = now()`,
    [familyId, child, birth, stage],
  );
  await db.query(
    `insert into babycare.recommendation_settings (family_id, weekday_mask, menu_count, total_meals) values ($1,$2,$3,$4)
       on conflict (family_id) do update
       set weekday_mask = excluded.weekday_mask, menu_count = excluded.menu_count,
           total_meals = excluded.total_meals, updated_at = now()`,
    [familyId, mask, menuCount, meals],
  );
}

async function saveInventory(db, familyId, payload) {
  const { id, name, available, quantity, unit } = parseInventory(payload);
  try {
    if (!id) {
      await db.query(
        "insert into babycare.inventory_items (family_id, name, available, quantity, unit) values ($1,$2,$3,$4,$5)",
        [familyId, name, available, quantity, unit],
      );
      return;
    }
    const result = await db.query(
      `update babycare.inventory_items set name = $2, available = $3, quantity = $4, unit = $5, updated_at = now()
        where family_id = $1 and id = $6`,
      [familyId, name, available, quantity, unit, id],
    );
    if (!result.rowCount) throw new RequestError(404, "수정할 재료를 찾을 수 없어요.");
  } catch (error) {
    if (error.code === "23505") throw new RequestError(409, "이미 등록된 재료예요.");
    throw error;
  }
}

async function saveRecord(db, familyId, payload) {
  const entry = parseRecord(payload);
  const result = await db.query(
    `insert into babycare.care_records (id, family_id, kind, occurred_on, dish_name, feedback, used_ingredients)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb)
       on conflict (id) do nothing returning id`,
    [entry.id, familyId, entry.kind, entry.date, entry.recipe, entry.notes, JSON.stringify(entry.usage)],
  );
  if (!result.rowCount || !entry.usage.length) return;
  await db.query(
    `with used as (
        select name, unit, sum(quantity) as quantity
        from jsonb_to_recordset($2::jsonb) as item(name text, unit text, quantity numeric)
        group by name, unit
      )
      update babycare.inventory_items as inv
         set quantity = greatest(0, inv.quantity - used.quantity),
             available = inv.quantity > used.quantity,
             updated_at = now()
        from used
       where inv.family_id = $1 and inv.name = used.name and inv.unit = used.unit
         and inv.available and inv.quantity is not null`,
    [familyId, JSON.stringify(entry.usage)],
  );
}

export async function writeFamily(db, familyId, action, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new RequestError(400, "입력한 내용을 확인해 주세요.");
  switch (action) {
    case "profile": return saveProfile(db, familyId, payload);
    case "inventory": return saveInventory(db, familyId, payload);
    case "record": return saveRecord(db, familyId, payload);
    default: throw new RequestError(400, "요청한 기능을 확인해 주세요.");
  }
}
