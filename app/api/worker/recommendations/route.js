import { todayInKorea } from "../../../model.js";
import { getPool, transaction } from "../../../../lib/server/database.js";
import { errorResponse, json, readJson } from "../../../../lib/server/http.js";
import { authorizeWorker, readWorkerJob, saveWorkerRecommendation } from "../../../../lib/server/worker.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    authorizeWorker(request);
    const familyId = new URL(request.url).searchParams.get("familyId");
    return json(await readWorkerJob(await getPool(), familyId, todayInKorea()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    authorizeWorker(request);
    const payload = await readJson(request);
    const result = await transaction(await getPool(), (client) => saveWorkerRecommendation(client, payload, todayInKorea()));
    return json(result, result.status === "saved" ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
