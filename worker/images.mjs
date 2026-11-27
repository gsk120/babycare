import { parseArgs } from "node:util";
import { processRecipeImages } from "./recipe-images.js";

try {
  const { values } = parseArgs({ options: { family: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("./babycare images --family-id <가족 UUID>");
  } else {
    if (!values.family) throw new Error("--family에 가족 UUID를 입력해 주세요.");
    console.log(JSON.stringify(await processRecipeImages(values.family)));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
