import { stages, todayInKorea, units, weekdays } from "../../app/model.js";
import { RequestError } from "./http.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function valid(condition, message = "입력한 내용을 확인해 주세요.") {
  if (!condition) throw new RequestError(400, message);
}

function text(value, max, label, optional = false) {
  if (optional && value == null) return null;
  valid(typeof value === "string" && value.length <= max, label + "을 확인해 주세요.");
  const trimmed = value.trim();
  if (!trimmed && optional) return null;
  valid(trimmed, label + "을 입력해 주세요.");
  return trimmed;
}

function date(value) {
  valid(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "0001-01-01" && value <= todayInKorea(), "날짜를 확인해 주세요.");
  const parsed = new Date(value + "T00:00:00Z");
  valid(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, "날짜를 확인해 주세요.");
  return value;
}

function amount(value) {
  valid(typeof value === "number" && value >= 0 && value < 1e9 && Number(value.toFixed(3)) === value, "수량은 소수점 셋째 자리까지 입력할 수 있어요.");
  return value;
}

export function credentials(payload) {
  const email = text(payload.email, 254, "이메일");
  valid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "이메일을 확인해 주세요.");
  valid(typeof payload.password === "string" && payload.password.length > 0 && payload.password.length <= 1024, "비밀번호를 확인해 주세요.");
  return { email, password: payload.password };
}

export function parsePasswordChange(payload) {
  const { currentPassword, newPassword, confirmPassword } = payload;
  valid(typeof currentPassword === "string" && currentPassword.length > 0 && currentPassword.length <= 1024, "현재 비밀번호를 확인해 주세요.");
  valid(typeof newPassword === "string" && newPassword.length >= 8 && newPassword.length <= 1024, "새 비밀번호는 8자 이상 입력해 주세요.");
  valid(newPassword !== currentPassword, "현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
  valid(newPassword === confirmPassword, "새 비밀번호 확인이 일치하지 않아요.");
  return { currentPassword, newPassword };
}

export function parseProfile(payload) {
  const { child, birth, stage, days, menuCount, meals } = payload;
  valid(stages.includes(stage), "이유식 단계를 선택해 주세요.");
  valid(Array.isArray(days) && days.length > 0 && days.every((day) => weekdays.includes(day)), "추천 요일을 하나 이상 선택해 주세요.");
  valid(Number.isInteger(menuCount) && menuCount >= 1 && menuCount <= 30, "메뉴 수를 확인해 주세요.");
  valid(Number.isInteger(meals) && meals >= menuCount && meals <= 99, "총 끼 수는 메뉴 수 이상이어야 해요.");
  const mask = weekdays.reduce((sum, day, index) => days.includes(day) ? sum | (1 << index) : sum, 0);
  return { child: text(child, 30, "아이 이름"), birth: date(birth), stage, mask, menuCount, meals };
}

export function parseInventory(payload) {
  valid(payload.id == null || (typeof payload.id === "string" && uuid.test(payload.id)), "재료를 확인해 주세요.");
  valid(typeof payload.available === "boolean");
  valid(payload.unit == null || units.includes(payload.unit), "재료의 단위를 확인해 주세요.");
  const quantity = payload.quantity == null ? null : amount(payload.quantity);
  valid(quantity === null || Boolean(payload.unit), "수량의 단위를 선택해 주세요.");
  valid(quantity === null || payload.available === (quantity > 0), "재료 보유 상태와 수량을 확인해 주세요.");
  return { id: payload.id ?? null, name: text(payload.name, 50, "재료 이름"), available: payload.available, quantity, unit: payload.unit ?? null };
}

export function parseRecord(payload) {
  valid(typeof payload.id === "string" && uuid.test(payload.id), "기록을 확인해 주세요.");
  valid(payload.kind === "조리" || payload.kind === "식사", "기록 종류를 선택해 주세요.");
  valid(Array.isArray(payload.usage) && payload.usage.length <= 100, "사용 재료를 확인해 주세요.");

  const isCook = payload.kind === "조리";
  const usage = isCook ? payload.usage.map((item) => {
    valid(item && typeof item === "object", "사용 재료를 확인해 주세요.");
    return { name: text(item.name, 50, "재료 이름"), unit: text(item.unit, 20, "단위"), quantity: amount(item.quantity) };
  }).filter((item) => item.quantity > 0) : [];
  const notes = text(payload.notes, 1200, "피드백", true);
  valid(notes || usage.length, "피드백이나 실제 사용량을 입력해 주세요.");
  return { id: payload.id, kind: isCook ? "cook" : "meal", recipe: text(payload.recipe, 150, "메뉴 이름", true), date: date(payload.date), notes, usage };
}
