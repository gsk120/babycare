export function workerApi(path) {
  const token = process.env.BABYCARE_WORKER_TOKEN?.trim();
  if (!token) throw new Error("BABYCARE_WORKER_TOKEN을 설정해 주세요.");
  if (!process.env.BABYCARE_WORKER_URL) throw new Error("BABYCARE_WORKER_URL을 설정해 주세요.");
  const url = new URL(process.env.BABYCARE_WORKER_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
    throw new Error("워커 URL은 HTTPS 또는 로컬 개발 서버 주소여야 해요.");
  }
  return { token, url: new URL(path, url.origin) };
}

export async function workerRequest(url, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(url, { method: body ? "POST" : "GET", headers, body: body && JSON.stringify(body),
      redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error("워커 API에 연결할 수 없어요.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? `워커 API 오류 (${response.status})`);
  return data;
}
