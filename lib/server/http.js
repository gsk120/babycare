export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const headers = { "Cache-Control": "private, no-store" };

export function json(body, status = 200) {
  return Response.json(body, { status, headers });
}

export function errorResponse(error) {
  if (error instanceof RequestError) return json({ error: error.message }, error.status);
  console.error("Babycare API request failed", error?.code ?? error?.name ?? "unknown");
  return json({ error: "서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." }, 503);
}

export function usesHttps(request) {
  return process.env.VERCEL === "1" || request.nextUrl.protocol === "https:";
}

export function requireSameOrigin(request) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = usesHttps(request) ? "https:" : "http:";
  // Next.js can normalize the internal loopback hostname to localhost.
  if (request.headers.get("origin") !== new URL(protocol + "//" + host).origin) {
    throw new RequestError(403, "이 요청을 처리할 수 없어요.");
  }
}

export async function readJson(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestError(415, "요청 형식을 확인해 주세요.");
  }
  try {
    const data = await request.json();
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {}
  throw new RequestError(400, "입력한 내용을 확인해 주세요.");
}
