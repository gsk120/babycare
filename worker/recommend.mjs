import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { maxFamilyInstructions, validateRecommendation } from "../lib/recommendation.js";
import { workerApi, workerRequest } from "./api.js";
import { familyInstructionsFor, generateRecommendation } from "./codex.js";
import { processRecipeImages } from "./recipe-images.js";

const execute = promisify(execFile);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceId = (source) => JSON.stringify([source?.sourceKey, source?.page]);

async function localFamilyInstructions(job, origin, familyId) {
  const directory = join(appRoot, ".babycare", "family-prompts");
  const key = createHash("sha256").update(JSON.stringify([origin, familyId.toLowerCase()])).digest("hex");
  const file = join(directory, key + ".json");
  try {
    const cached = JSON.parse(await readFile(file, "utf8"));
    if (cached?.feedbackDigest === job.feedbackDigest && typeof cached.instructions === "string" &&
        cached.instructions.trim() && cached.instructions.length <= maxFamilyInstructions) return cached.instructions;
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }

  const instructions = await familyInstructionsFor(job);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, randomUUID() + ".tmp");
  try {
    await writeFile(temporary, JSON.stringify({ feedbackDigest: job.feedbackDigest, instructions }), { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return instructions;
}

async function search(input, familyInstructions) {
  const root = resolve(appRoot, process.env.BABYCARE_CHROMA_DIR || ".chroma/babycare-reference");
  const localPython = join(root, "venv", "bin", "python");
  const python = process.env.BABYCARE_WORKER_PYTHON || (existsSync(localPython) ? localPython : "python3");
  try {
    const run = execute(python, [join(appRoot, "worker", "search.py"), root], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    run.child.stdin.on("error", () => {});
    run.child.stdin.end(JSON.stringify({ ...input, familyInstructions }));
    return JSON.parse((await run).stdout);
  } catch {
    throw new Error("로컬 Chroma 검색에 실패했어요. Python 의존성과 인덱스 경로를 확인해 주세요.");
  }
}

async function renderSavedRecipeImages(familyId, batch) {
  try {
    const { generated, recovered } = await processRecipeImages(familyId, batch.id);
    if (generated || recovered) console.error(`조리 이미지 ${generated + recovered}장을 저장했어요.`);
  } catch (error) {
    console.error(`추천은 저장됐어요. 조리 이미지는 ./babycare images 명령으로 다시 시도할 수 있어요. ${error.message}`);
  }
}

async function main() {
  const { values } = parseArgs({ options: { family: { type: "string" }, preview: { type: "boolean" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("npm run worker:recommend -- --family <가족 UUID> [--preview]");
    return;
  }
  if (!values.family) throw new Error("--family에 대상 가족 UUID를 지정해 주세요.");
  const { url, token } = workerApi("/api/worker/recommendations");
  const jobUrl = new URL(url);
  jobUrl.searchParams.set("familyId", values.family);
  const job = await workerRequest(jobUrl, token);
  if (job.status === "already_saved") {
    console.log(JSON.stringify(job));
    if (!values.preview) await renderSavedRecipeImages(values.family, job.batch);
    return;
  }
  if (job.status !== "ready") throw new Error("워커 작업을 가져오지 못했어요.");

  const familyInstructions = await localFamilyInstructions(job, url.origin, values.family);
  const references = await search(job.input, familyInstructions);
  if (!references.length) throw new Error("현재 이유식 단계와 일치하는 로컬 검수 자료가 없어요.");
  const evidence = new Map(references.flatMap(({ sources }) => sources).map((source) => [sourceId(source), source]));
  const result = await generateRecommendation(job.input, familyInstructions, references);
  const recipes = validateRecommendation(result, job.input, (entry) => {
    const source = evidence.get(sourceId(entry));
    if (!source) throw new Error("검색 근거에서 확인할 수 없는 PDF 출처예요.");
    return source;
  });
  if (values.preview) {
    console.log(JSON.stringify({ status: "preview", date: job.input.date, recipes }, null, 2));
    return;
  }
  const saved = await workerRequest(url, token, { familyId: values.family, date: job.input.date, snapshot: job.snapshot, recipes });
  console.log(JSON.stringify(saved));
  await renderSavedRecipeImages(values.family, saved.batch);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
