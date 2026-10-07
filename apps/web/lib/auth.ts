import type { CharacterAppearance } from "./appearance";

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
