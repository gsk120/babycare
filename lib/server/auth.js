import { createServerClient, DEFAULT_COOKIE_OPTIONS } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { RequestError, usesHttps } from "./http.js";

const sessionCookie = "babycare-auth";
const rememberCookie = "babycare-remember";

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RequestError(503, "Supabase 로그인 설정이 필요해요.");
  return { url, key };
}

function cookieOptions(request) {
  return { httpOnly: true, secure: usesHttps(request), sameSite: "lax", path: "/" };
}

export async function getAuth(request, remember) {
  const { url, key } = authConfig();
  const jar = await cookies();
  const keepSession = remember ?? (jar.get(rememberCookie)?.value === "1");

  return createServerClient(url, key, {
    cookieOptions: { ...cookieOptions(request), name: sessionCookie },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (updates) => {
        for (const { name, value, options } of updates) {
          if (keepSession || value === "" || options.maxAge === 0) {
            jar.set(name, value, options);
          } else {
            const { maxAge, expires, ...sessionOptions } = options;
            jar.set(name, value, sessionOptions);
          }
        }
      },
    },
  });
}

export async function setRememberPreference(request, enabled) {
  const jar = await cookies();
  jar.set(rememberCookie, enabled ? "1" : "", {
    ...cookieOptions(request),
    maxAge: enabled ? DEFAULT_COOKIE_OPTIONS.maxAge : 0,
  });
}

export async function clearBrowserLogin(request) {
  const jar = await cookies();
  const options = { ...cookieOptions(request), maxAge: 0 };
  for (const { name } of jar.getAll()) {
    if (name === sessionCookie || name.startsWith(sessionCookie + ".")) jar.set(name, "", options);
  }
  await setRememberPreference(request, false);
}

export function passwordVerificationClient() {
  const { url, key } = authConfig();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function verifiedUser(auth) {
  const { data, error } = await auth.auth.getUser();
  if (error?.status >= 500 || error?.name === "AuthRetryableFetchError") {
    throw new RequestError(503, "로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
  if (error || !data.user) throw new RequestError(401, "가족 계정으로 로그인해 주세요.");
  return data.user;
}
