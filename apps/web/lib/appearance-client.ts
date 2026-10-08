import {
  APPEARANCE_FIELDS,
  isCompatibleAppearance,
  normalizeCharacterAppearance,
  type CharacterAppearance,
} from "./appearance";
import { authError, normalizeAuthUser, type AuthUser } from "./auth";

export class AppearanceSaveError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "AppearanceSaveError";
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function validAppearance(value: unknown): value is CharacterAppearance {
  return (
    record(value) &&
    Object.hasOwn(value, "bodyType") &&
    normalizeCharacterAppearance(value) !== null &&
    isCompatibleAppearance(value as CharacterAppearance)
  );
}

/** Never replace the active account with a response for someone else. */
export function savedAppearanceUser(
  value: unknown,
  userId: string,
  submitted: CharacterAppearance,
): AuthUser {
  const user = normalizeAuthUser(value);
  if (
    !user ||
    user.id !== userId ||
    !validAppearance(submitted) ||
    !APPEARANCE_FIELDS.every((key) => user.appearance[key] === submitted[key])
  ) {
    throw new AppearanceSaveError(
      "We could not confirm your saved look. Try again before leaving.",
    );
  }
  return user;
}

export async function saveAppearance(
  userId: string,
  appearance: CharacterAppearance,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AuthUser> {
  if (!validAppearance(appearance)) {
    throw new AppearanceSaveError("Choose one of the available looks.");
  }
  const response = await fetcher("/api/auth/appearance", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(appearance),
    signal,
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      record(value) && typeof value.error === "string" ? value.error : "";
    throw new AppearanceSaveError(
      response.status === 401
        ? "Your session has expired. Sign in again to save your look."
        : response.status === 403
          ? "This account cannot save a look right now."
          : authError[code] ||
            "We could not save your look. Your changes are still here.",
      response.status,
    );
  }
  return savedAppearanceUser(value, userId, appearance);
}
