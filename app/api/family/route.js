import { getAuth, verifiedUser } from "../../../lib/server/auth.js";
import { getPool, transaction } from "../../../lib/server/database.js";
import { familyForUser, readFamily, writeFamily } from "../../../lib/server/family.js";
import { errorResponse, json, readJson, requireSameOrigin } from "../../../lib/server/http.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await verifiedUser(await getAuth(request));
    return json(await readFamily(await getPool(), user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    requireSameOrigin(request);
    const user = await verifiedUser(await getAuth(request));
    const { action, payload } = await readJson(request);
    const result = await transaction(await getPool(), async (client) => {
      const family = await familyForUser(client, user.id);
      await writeFamily(client, family.id, action, payload);
      return readFamily(client, user.id);
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
