import { units } from "../app/model.js";

export const maxFamilyInstructions = 5000;

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value, limit) {
  requireValid(typeof value === "string" && value.trim() && value.length <= limit, "추천의 텍스트 항목을 확인해 주세요.");
  return value.trim().normalize("NFC");
}

function unique(values) {
  return new Set(values).size === values.length;
}

export function validateRecommendation(result, { menuCount, totalMeals }, resolveSource = (source) => source) {
  requireValid(Array.isArray(result?.recipes) && result.recipes.length === menuCount, "추천 메뉴 수가 가족 설정과 달라요.");
  const recipes = result.recipes.map((recipe) => {
    requireValid(Number.isInteger(recipe?.meals) && recipe.meals > 0 && recipe.meals <= totalMeals, "메뉴별 끼 수를 확인해 주세요.");
    requireValid(Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 && recipe.ingredients.length <= 100, "추천 재료를 확인해 주세요.");
    requireValid(Array.isArray(recipe.steps) && recipe.steps.length > 0 && recipe.steps.length <= 30, "조리 순서를 확인해 주세요.");
    requireValid(Array.isArray(recipe.sources) && recipe.sources.length > 0 && recipe.sources.length <= 30, "추천 출처를 확인해 주세요.");
    const ingredients = recipe.ingredients.map((item) => {
      const { quantity, unit } = item ?? {};
      requireValid(typeof quantity === "number" && quantity > 0 && quantity < 1e9 && Number(quantity.toFixed(3)) === quantity && units.includes(unit), "재료량 또는 단위가 올바르지 않아요.");
      return { name: text(item.name, 50), quantity, unit };
    });
    requireValid(unique(ingredients.map(({ name }) => name)), "한 메뉴에 같은 재료가 중복됐어요.");
    const sources = recipe.sources.map((entry) => {
      const source = resolveSource(entry);
      requireValid(Number.isInteger(source?.page) && source.page > 0 && source.page <= 2147483647, "추천 출처의 PDF 페이지를 확인해 주세요.");
      return { book: text(source.book, 250), page: source.page };
    });
    requireValid(unique(sources.map(({ book, page }) => JSON.stringify([book, page]))), "같은 PDF 출처가 중복됐어요.");
    return {
      name: text(recipe.name, 150),
      meals: recipe.meals,
      ingredients,
      steps: recipe.steps.map((step) => text(step, 1000)),
      reason: text(recipe.reason, 1200),
      sources,
    };
  });
  requireValid(unique(recipes.map(({ name }) => name.replace(/\s+/gu, "").toLowerCase())), "추천 메뉴 이름이 중복됐어요.");
  requireValid(recipes.reduce((sum, recipe) => sum + recipe.meals, 0) === totalMeals, "추천 끼 수의 합계가 가족 설정과 달라요.");
  return recipes;
}
