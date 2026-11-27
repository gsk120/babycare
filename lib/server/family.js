import { todayInKorea, weekdays } from "../../app/model.js";
import { RequestError } from "./http.js";
import { parseInventory, parseProfile, parseRecord } from "./validate.js";

const recommendationRecipe = `jsonb_build_object(
    'id', i.id, 'name', d.name, 'meals', i.meals, 'ingredients', i.ingredients,
    'steps', i.instructions, 'reason', i.reason, 'sources', i.sources
  )`;
const recommendationRecipes = `coalesce((
  select jsonb_agg(${recommendationRecipe} order by i.position)
  from babycare.recommendation_items i
  join babycare.dish_catalog d on d.id = i.dish_id
  where i.batch_id = b.id
), '[]'::jsonb)`;
const historyPageSize = 10;
const recommendationUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function familyForUser(db, userId) {
  const { rows: [family] } = await db.query(
    "select id, name from babycare.families where owner_user_id = $1",
    [userId],
  );
  if (!family) throw new RequestError(403, "이 계정은 아직 가족으로 등록되지 않았어요.");
  return family;
}

export async function readFamily(db, userId) {
  const { rows: [snapshot] } = await db.query(
    `select f.name,
            c.name as child, c.birth_date::text as birth, c.stage,
            s.weekday_mask, s.menu_count, s.total_meals, to_jsonb(s)->>'cooking_environment' as cooking_environment,
            coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', inv.id, 'name', inv.name, 'available', inv.available,
                'quantity', inv.quantity::float8, 'unit', inv.unit
              ) order by inv.updated_at desc, inv.name)
              from babycare.inventory_items inv where inv.family_id = f.id
            ), '[]'::jsonb) as inventory,
            coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', r.id, 'kind', case r.kind when 'cook' then '조리' else '식사' end,
                'date', r.occurred_on::text, 'recipe', r.dish_name, 'notes', r.feedback, 'usage', r.used_ingredients
              ) order by r.occurred_on desc, r.created_at desc, r.id)
              from babycare.care_records r where r.family_id = f.id
            ), '[]'::jsonb) as records,
            case when b.id is not null then jsonb_build_object(
              'date', b.recommendation_date::text, 'menuCount', b.menu_count, 'meals', b.total_meals,
              'recipes', ${recommendationRecipes}
            ) end as recommendation
       from babycare.families f
       left join babycare.child_profiles c on c.family_id = f.id
       left join babycare.recommendation_settings s on s.family_id = f.id
       left join lateral (
         select id, recommendation_date, menu_count, total_meals from babycare.recommendation_batches
          where family_id = f.id and recommendation_date <= $2
          order by recommendation_date desc limit 1
       ) b on true
      where f.owner_user_id = $1`,
    [userId, todayInKorea()],
  );
  if (!snapshot) throw new RequestError(403, "이 계정은 아직 가족으로 등록되지 않았어요.");

  return {
    family: { name: snapshot.name },
    profile: {
      child: snapshot.child ?? "",
      birth: snapshot.birth ?? "",
      stage: snapshot.stage ?? "초기",
      days: weekdays.filter((_, index) => (snapshot.weekday_mask ?? 0) & (1 << index)),
      menuCount: snapshot.menu_count ?? 1,
      meals: snapshot.total_meals ?? 1,
      cookingEnvironment: snapshot.cooking_environment ?? "",
    },
    inventory: snapshot.inventory,
    records: snapshot.records,
    recommendation: snapshot.recommendation,
  };
}

export async function readRecommendationHistory(db, userId, before = null) {
  const today = todayInKorea();
  if (before !== null) {
    const parsed = new Date(before + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(before) || before < "0001-01-01" ||
        Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== before) {
      throw new RequestError(400, "추천 날짜를 확인해 주세요.");
    }
  }
  const cutoff = before && before < today ? before : today;
  const { rows: [result] } = await db.query(
    `select coalesce((
       select jsonb_agg(to_jsonb(page) order by page.date desc)
       from (
         select id, recommendation_date::text as date, menu_count as "menuCount", total_meals as meals
         from babycare.recommendation_batches
         where family_id = f.id and recommendation_date < $2
         order by recommendation_date desc limit $3
       ) page
     ), '[]'::jsonb) as batches
     from babycare.families f where f.owner_user_id = $1`, [userId, cutoff, historyPageSize + 1]);
  if (!result) throw new RequestError(403, "이 계정은 아직 가족으로 등록되지 않았어요.");
  const batches = result.batches.slice(0, historyPageSize);
  return { batches, nextBefore: result.batches.length > historyPageSize ? batches.at(-1).date : null };
}

export async function readPastRecommendation(db, userId, batchId) {
  if (typeof batchId !== "string" || !recommendationUuid.test(batchId)) throw new RequestError(400, "추천 묶음을 확인해 주세요.");
  const { rows: [result] } = await db.query(
    `select ${recommendationRecipes} as recipes
       from babycare.recommendation_batches b
       join babycare.families f on f.id = b.family_id
      where f.owner_user_id = $1 and b.id = $2 and b.recommendation_date < $3`, [userId, batchId, todayInKorea()]);
  if (!result) throw new RequestError(404, "지난 추천을 찾을 수 없어요.");
  return result;
}

export async function readPastRecipe(db, userId, itemId) {
  if (typeof itemId !== "string" || !recommendationUuid.test(itemId)) throw new RequestError(400, "추천 메뉴를 확인해 주세요.");
  const { rows: [result] } = await db.query(
    `select ${recommendationRecipe} as recipe
       from babycare.recommendation_items i
       join babycare.dish_catalog d on d.id = i.dish_id
       join babycare.recommendation_batches b on b.id = i.batch_id
       join babycare.families f on f.id = b.family_id
      where f.owner_user_id = $1 and i.id = $2 and b.recommendation_date < $3`, [userId, itemId, todayInKorea()]);
  if (!result) throw new RequestError(404, "지난 추천 메뉴를 찾을 수 없어요.");
  return result;
}

function readSearchCursor(cursor, terms) {
  if (cursor === null) return [null, null, null, null];
  try {
    if (cursor.length > 8192 || !/^[\w-]+$/.test(cursor)) throw new Error();
    const [query, rank, day, position, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (query === terms.join(" ") && Number.isInteger(rank) && rank >= 0 && rank <= 4 &&
        Number.isInteger(day) && Math.abs(day) < 2 ** 31 && Number.isInteger(position) && position > 0 &&
        position < 2 ** 31 && typeof id === "string" && recommendationUuid.test(id)) {
      return [rank, day, position, id];
    }
  } catch {}
  throw new RequestError(400, "검색 결과를 처음부터 다시 확인해 주세요.");
}

export async function searchPastRecipes(db, userId, input, cursor = null) {
  const query = input.normalize("NFKC").trim().toLowerCase();
  if (!query || input.length > 100 || query.includes("\0")) throw new RequestError(400, "검색어를 확인해 주세요.");
  const terms = query.split(/\s+/u);
  const exactTitle = terms.join("");
  const { rows: [result] } = await db.query(
    `with family as (select id from babycare.families where owner_user_id = $1),
     terms as (select distinct unnest($3::text[]) as term)
     select coalesce((
       select jsonb_agg(to_jsonb(page) order by page.rank, page.day, page.position, page.id)
       from (
         select i.id, d.name, b.recommendation_date::text as date, i.position,
                date '2000-01-01' - b.recommendation_date as day, rank.value as rank,
                matches.ingredients as "matchedIngredients"
         from babycare.recommendation_batches b
         join babycare.recommendation_items i on i.batch_id = b.id
         join babycare.dish_catalog d on d.id = i.dish_id
         cross join lateral (
           select regexp_replace(lower(normalize(d.name, NFKC)), '[[:space:]]+', '', 'g') as key
         ) title
         cross join lateral (
           with ingredients as (
             select item->>'name' as name, ord,
                    regexp_replace(lower(normalize(item->>'name', NFKC)), '[[:space:]]+', '', 'g') as key
             from jsonb_array_elements(i.ingredients) with ordinality as ingredient(item, ord)
           )
           select bool_and(strpos(title.key, term) > 0 or exists (
                    select 1 from ingredients where strpos(key, term) > 0
                  )) as all_terms,
                  bool_and(strpos(title.key, term) > 0) as in_title,
                  bool_and(exists (select 1 from ingredients where key = term)) as exact_ingredients,
                  array(select name from ingredients where exists (
                    select 1 from terms where strpos(key, term) > 0
                  ) order by ord) as ingredients
           from terms
         ) matches
         cross join lateral (select case
           when title.key = $4 then 0
           when char_length($4) = 1 and matches.exact_ingredients then 1
           when matches.in_title then 2
           when matches.exact_ingredients then 3
           else 4 end as value) rank
         where b.family_id = family.id and b.recommendation_date < $2 and matches.all_terms
           and ($5::integer is null or (rank.value, date '2000-01-01' - b.recommendation_date, i.position, i.id)
             > ($5::integer, $6::integer, $7::integer, $8::uuid))
         order by rank, day, i.position, i.id limit $9
       ) page
     ), '[]'::jsonb) as matches from family`,
    [userId, todayInKorea(), terms, exactTitle, ...readSearchCursor(cursor, terms), historyPageSize + 1],
  );
  if (!result) throw new RequestError(403, "이 계정은 아직 가족으로 등록되지 않았어요.");
  const matches = result.matches.slice(0, historyPageSize);
  let nextCursor = null;
  if (result.matches.length > historyPageSize) {
    const { rank, day, position, id } = matches.at(-1);
    nextCursor = Buffer.from(JSON.stringify([terms.join(" "), rank, day, position, id])).toString("base64url");
  }
  return {
    recipes: matches.map(({ id, name, date, matchedIngredients }) => ({ id, name, date, matchedIngredients })),
    nextCursor,
  };
}

async function saveProfile(db, familyId, payload) {
  const { child, birth, stage, mask, menuCount, meals, cookingEnvironment } = parseProfile(payload);
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
  if (cookingEnvironment !== undefined) {
    try {
      await db.query("update babycare.recommendation_settings set cooking_environment = $2 where family_id = $1",
        [familyId, cookingEnvironment]);
    } catch (error) {
      if (error.code === "42703") throw new RequestError(503, "조리 환경 DB 설정을 적용한 뒤 저장해 주세요.");
      throw error;
    }
  }
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
