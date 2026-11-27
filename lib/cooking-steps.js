export function cookingStepTitle(description) {
  const firstPhrase = description.split(/[.!?。\n]/u)[0].trim() || description.trim();
  if (firstPhrase.length <= 24) return firstPhrase;
  const excerpt = firstPhrase.slice(0, 24);
  const boundary = excerpt.lastIndexOf(" ");
  return (boundary > 8 ? excerpt.slice(0, boundary) : excerpt) + "…";
}
