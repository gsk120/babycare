import { clearBrowserLogin, getAuth, passwordVerificationClient, setRememberPreference, verifiedUser } from "../../../lib/server/auth.js";
import { getPool } from "../../../lib/server/database.js";
import { familyForUser } from "../../../lib/server/family.js";
import { errorResponse, json, readJson, requireSameOrigin, RequestError } from "../../../lib/server/http.js";
import { credentials, parsePasswordChange } from "../../../lib/server/validate.js";

export const runtime = "nodejs";

function requireAuthService(error) {
  if (error?.status === 429) throw new RequestError(429, "잠시 기다린 뒤 다시 시도해 주세요.");
  if (error?.status >= 500 || error?.name === "AuthRetryableFetchError") {
    throw new RequestError(503, "로그인 서버에 연결할 수 없어요.");
  }
}

export async function POST(request) {
  try {
    requireSameOrigin(request);
    const body = await readJson(request);
    const input = credentials(body);
    const remember = body.remember === true;
    const auth = await getAuth(request, remember);
    const { data, error } = await auth.auth.signInWithPassword(input);
    requireAuthService(error);
    if (error || !data.user) throw new RequestError(401, "이메일이나 비밀번호를 확인해 주세요.");

    try {
      await familyForUser(await getPool(), data.user.id);
    } catch (failure) {
      await auth.auth.signOut({ scope: "local" }).catch(() => {});
      await clearBrowserLogin(request);
      throw failure;
    }
    await setRememberPreference(request, remember);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    requireSameOrigin(request);
    const { currentPassword, newPassword } = parsePasswordChange(await readJson(request));
    const user = await verifiedUser(await getAuth(request));
    await familyForUser(await getPool(), user.id);
    if (!user.email) throw new RequestError(400, "이 계정에서는 비밀번호를 변경할 수 없어요.");

    // Verify the current password even when the shared Auth project allows password updates without it.
    const check = passwordVerificationClient();
    const { data, error } = await check.auth.signInWithPassword({ email: user.email, password: currentPassword });
    try {
      requireAuthService(error);
      if (error || data.user?.id !== user.id) throw new RequestError(400, "현재 비밀번호를 확인해 주세요.");
      const { error: updateError } = await check.auth.updateUser({ password: newPassword, current_password: currentPassword });
      requireAuthService(updateError);
      if (updateError?.code === "same_password") throw new RequestError(400, "현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
      if (updateError?.code === "current_password_invalid") throw new RequestError(400, "현재 비밀번호를 확인해 주세요.");
      if (updateError) throw new RequestError(400, "새 비밀번호를 변경하지 못했어요. 다른 비밀번호로 다시 시도해 주세요.");
    } finally {
      if (data.session) await check.auth.signOut({ scope: "local" }).catch(() => {});
    }

    await clearBrowserLogin(request);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    requireSameOrigin(request);
    const auth = await getAuth(request);
    const { error } = await auth.auth.signOut({ scope: "local" });
    if (error && error.name !== "AuthSessionMissingError") throw error;
    await clearBrowserLogin(request);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
