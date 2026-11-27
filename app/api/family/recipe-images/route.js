import { getAuth, verifiedUser } from "../../../../lib/server/auth.js";
import { getPool } from "../../../../lib/server/database.js";
import { familyForUser } from "../../../../lib/server/family.js";
import { errorResponse, json } from "../../../../lib/server/http.js";
import { readRecipeImages } from "../../../../lib/server/recipe-images.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await verifiedUser(await getAuth(request));
    const pool = await getPool();
    const family = await familyForUser(pool, user.id);
    const itemId = request.nextUrl.searchParams.get("itemId");
    return json(await readRecipeImages(pool, family.id, itemId));
  } catch (error) {
    return errorResponse(error);
  }
}
