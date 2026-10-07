import { forwardBackend } from "./backend";

const noStore = { "cache-control": "no-store" };

function hasSessionCookie(request: Request): boolean {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const cookie = part.trim();
    if (cookie.startsWith("lv_session="))
      return cookie.slice("lv_session=".length).trim().length > 0;
  }
  return false;
}

/** A null result allows the caller to continue. A cookie alone never authorizes
 * an API request: Go must validate the session and active account first.
 */
export async function requireAccount(
  request: Request,
): Promise<Response | null> {
  if (!hasSessionCookie(request))
    return Response.json(
      { error: "session_expired" },
      { status: 401, headers: noStore },
    );
  const session = await forwardBackend(
    new Request(request.url, {
      method: "GET",
      headers: request.headers,
      signal: request.signal,
    }),
    "/v1/auth/me",
  );
  if (session.status === 200) return null;
  if (session.status === 401 || session.status === 503) return session;
  return Response.json(
    { error: "service_unavailable" },
    { status: 503, headers: noStore },
  );
}
