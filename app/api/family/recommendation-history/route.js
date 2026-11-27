import { getAuth, verifiedUser } from "../../../../lib/server/auth.js";
import { getPool } from "../../../../lib/server/database.js";
import { readPastRecipe, readPastRecommendation, readRecommendationHistory, searchPastRecipes } from "../../../../lib/server/family.js";
import { errorResponse, json } from "../../../../lib/server/http.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await verifiedUser(await getAuth(request));
    const pool = await getPool();
    const query = request.nextUrl.searchParams;
    const search = query.get("q");
    const itemId = query.get("itemId");
    const batchId = query.get("batchId");
    if (search !== null) return json(await searchPastRecipes(pool, user.id, search, query.get("cursor")));
    if (itemId !== null) return json(await readPastRecipe(pool, user.id, itemId));
    if (batchId !== null) return json(await readPastRecommendation(pool, user.id, batchId));
    return json(await readRecommendationHistory(pool, user.id, query.get("before")));
  } catch (error) {
    return errorResponse(error);
  }
}
