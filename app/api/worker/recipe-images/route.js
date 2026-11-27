import { getPool, transaction } from "../../../../lib/server/database.js";
import { errorResponse, json, readJson, RequestError } from "../../../../lib/server/http.js";
import { claimRecipeImage, finishRecipeImage, prepareRecipeImages } from "../../../../lib/server/recipe-images.js";
import { authorizeWorker } from "../../../../lib/server/worker.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    authorizeWorker(request);
    const payload = await readJson(request);
    const pool = await getPool();
    switch (payload.action) {
      case "prepare":
        return json(await transaction(pool, (client) => prepareRecipeImages(client, payload.familyId, payload.batchId)));
      case "claim":
        return json(await claimRecipeImage(pool, payload.batchId));
      case "complete":
        return json(await finishRecipeImage(pool, payload, true));
      case "fail":
        return json(await finishRecipeImage(pool, payload, false));
      default:
        throw new RequestError(400, "조리 이미지 작업을 확인해 주세요.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
