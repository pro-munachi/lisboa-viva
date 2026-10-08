import {
  normalizeCharacterAppearance,
  type CharacterAppearance,
} from "./appearance";

export type AuthUser = {
  id: string;
  handle: string;
  email: string;
  userType: "tourist" | "local";
  accountStatus: "active" | "suspended" | "banned" | "deletion_pending";
  preferredLocale: "pt-PT" | "en";
  timezone: string;
  adultConfirmedAt: string | null;
  emailVerifiedAt: string | null;
  onboardingCompletedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  appearance: CharacterAppearance;
};

/** Validate account responses and normalize legacy saved appearances once. */
export function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const user = value as Record<string, unknown>;
  const appearance = normalizeCharacterAppearance(user.appearance);
  const date = (entry: unknown) =>
    typeof entry === "string" && Number.isFinite(Date.parse(entry));
  if (
    typeof user.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      user.id,
    ) ||
    user.id === "00000000-0000-0000-0000-000000000000" ||
    typeof user.handle !== "string" ||
    !/^[a-z0-9_]{3,24}$/.test(user.handle) ||
    typeof user.email !== "string" ||
    (user.userType !== "tourist" && user.userType !== "local") ||
    user.accountStatus !== "active" ||
    (user.preferredLocale !== "en" && user.preferredLocale !== "pt-PT") ||
    typeof user.timezone !== "string" ||
    !date(user.createdAt) ||
    !date(user.updatedAt) ||
    ![
      "adultConfirmedAt",
      "emailVerifiedAt",
      "onboardingCompletedAt",
      "lastLoginAt",
    ].every((key) => user[key] === null || date(user[key])) ||
    !Array.isArray(user.roles) ||
    !user.roles.every((role) => typeof role === "string") ||
    !appearance
  )
    return null;
  return {
    id: user.id,
    handle: user.handle,
    email: user.email,
    userType: user.userType,
    accountStatus: "active",
    preferredLocale: user.preferredLocale,
    timezone: user.timezone,
    adultConfirmedAt: user.adultConfirmedAt as string | null,
    emailVerifiedAt: user.emailVerifiedAt as string | null,
    onboardingCompletedAt: user.onboardingCompletedAt as string | null,
    lastLoginAt: user.lastLoginAt as string | null,
    createdAt: user.createdAt as string,
    updatedAt: user.updatedAt as string,
    roles: [...user.roles] as string[],
    appearance,
  };
}

export const authError: Record<string, string> = {
  adult_confirmation_required: "Confirm that you are at least 18 years old.",
  credentials: "The username, email, or password is incorrect.",
  email_taken: "An account already uses this email address.",
  handle_taken: "This username is already taken.",
  invalid_input: "Check the email address and username.",
  invalid_json: "We could not read the submitted information.",
  invalid_password: "Use a password between 10 and 72 characters.",
  invalid_user_type: "Choose tourist or local.",
  invalid_appearance: "Choose one of the available appearance options.",
  rate_limited: "Too many attempts. Try again in one minute.",
  server_error: "The account service is temporarily unavailable.",
};
