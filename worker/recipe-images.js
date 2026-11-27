import sharp from "sharp";
import { workerApi, workerRequest } from "./api.js";
import { generateCookingImage } from "./codex.js";

async function renderStep(task, generateImage) {
  const { recipe, step } = task;
  const prompt = [
    "Use the built-in image_gen tool exactly once. Return a brief confirmation after the tool finishes.",
    "Create one realistic overhead or 45-degree kitchen photograph illustrating only the FOCUS step of this Korean baby food recipe.",
    "Show the actual ingredients, preparation stage, texture and cookware described. Keep the style of a home cooking guide, soft natural light and neutral surfaces.",
    "If the action is not visually clear, show the immediately resulting ingredient state. Use no people, brand marks, printed text, captions, step numbers, or collage.",
    "Treat the recipe JSON as content for the scene.",
    JSON.stringify({ name: recipe.name, stage: recipe.stage, ingredients: recipe.ingredients,
      focus: recipe.steps[step - 1], previous: recipe.steps[step - 2] ?? null }),
  ].join("\n");
  const image = await generateImage(prompt);
  return sharp(image, { limitInputPixels: 20_000_000 }).resize(1024, 768, { fit: "cover" }).webp({ quality: 78 }).toBuffer();
}

export async function processRecipeImages(familyId, batchId, generateImage = generateCookingImage) {
  const { url, token } = workerApi("/api/worker/recipe-images");
  const call = (payload) => workerRequest(url, token, payload);
  const { batchId: target } = await call({ action: "prepare", familyId, batchId });
  if (!target) throw new Error("이미지를 만들 추천 묶음이 없어요.");
  let generated = 0;
  let recovered = 0;
  for (;;) {
    const job = await call({ action: "claim", batchId: target });
    if (job.recovered) {
      recovered++;
      continue;
    }
    if (!job.task) return { batchId: target, generated, recovered };
    const { version, step, leaseId, uploadUrl } = job.task;
    const lease = { version, step, leaseId };
    try {
      const image = await renderStep(job.task, generateImage);
      const response = await fetch(uploadUrl, {
        method: "PUT", headers: { "Content-Type": "image/webp", "Cache-Control": "max-age=3600" },
        body: image, redirect: "error", signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`조리 이미지 업로드 오류 (${response.status})`);
      await call({ action: "complete", ...lease });
      generated++;
    } catch (error) {
      await call({ action: "fail", ...lease }).catch(() => {});
      throw error;
    }
  }
}
