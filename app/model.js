export const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
export const stages = ["초기", "중기", "후기", "완료기"];
export const units = ["g", "ml", "개", "팩"];
export const maxCookingEnvironmentLength = 1200;

export function todayInKorea() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date(date + "T00:00:00+09:00"));
}

export function monthsOld(birth, date) {
  const [year, month, day] = date.split("-").map(Number);
  const [birthYear, birthMonth, birthDay] = birth.split("-").map(Number);
  return Math.max(0, (year - birthYear) * 12 + month - birthMonth - Number(day < birthDay));
}

export function shoppingList(inventory, recipes) {
  const totals = new Map();
  let needsSoakedRice = false;
  for (const { ingredients } of recipes) {
    for (const item of ingredients) {
      if (item.name.trim() === "물") continue;
      if (item.name.replace(/\s+/gu, "") === "불린쌀") {
        needsSoakedRice = true;
        continue;
      }
      const key = JSON.stringify([item.name, item.unit]);
      const quantity = Number(((totals.get(key)?.quantity ?? 0) + item.quantity).toFixed(3));
      totals.set(key, { ...item, id: key, quantity });
    }
  }
  const needed = [...totals.values()].flatMap(({ id, name, quantity, unit }) => {
    const item = inventory.find((entry) => entry.name === name);
    if (!item?.available) return [{ id, name, text: quantity + unit + " 필요", tone: "peach" }];
    if (item.quantity == null || item.unit !== unit) return [{ id, name, text: "양 확인 필요", tone: "yellow" }];
    if (item.quantity < quantity) {
      return [{ id, name, text: Number((quantity - item.quantity).toFixed(3)) + unit + " 부족", tone: "peach" }];
    }
    return [];
  });
  if (needsSoakedRice && !inventory.some((item) => item.name === "쌀" && item.available) &&
      !needed.some((item) => item.name === "쌀")) {
    needed.push({ id: JSON.stringify(["쌀", null]), name: "쌀", text: "불려서 사용", tone: "peach" });
  }
  return needed;
}
