import { test } from "node:test";
import assert from "node:assert/strict";
import { validHandle, validNewHandle } from "../lib/handle";
import { normalizeAuthUser } from "../lib/auth";
import { DEFAULT_APPEARANCE } from "../lib/appearance";

test("existing display usernames remain readable", () => {
  for (const name of ["Inês de Lisboa", "No underscore", "Lee!", "山田 太郎"])
    assert.equal(validHandle(name), true);
  for (const name of [
    "",
    "a",
    " a",
    "a ",
    "a@example.com",
    "line\nbreak",
    "zero\u200dwidth",
  ])
    assert.equal(validHandle(name), false);
});

test("new usernames reject every form of whitespace", () => {
  for (const name of ["Inês", "No_underscore", "Lee!", "山田太郎"])
    assert.equal(validNewHandle(name), true);
  for (const name of [
    "two words",
    " a",
    "a ",
    "a\tb",
    "a\u00a0b",
    "line\nbreak",
  ])
    assert.equal(validNewHandle(name), false);
});

test("the account response accepts new names and older spaced display names", () => {
  const account = {
    id: "2eea8c4d-1c9f-44b4-a463-a6136c926299",
    handle: "Inês!",
    email: "ines@example.test",
    userType: "tourist",
    accountStatus: "active",
    preferredLocale: "en",
    timezone: "Europe/Lisbon",
    adultConfirmedAt: null,
    emailVerifiedAt: null,
    onboardingCompletedAt: null,
    lastLoginAt: null,
    createdAt: "2026-10-08T10:00:00Z",
    updatedAt: "2026-10-08T10:00:00Z",
    roles: ["player"],
    appearance: DEFAULT_APPEARANCE,
  };
  assert.equal(normalizeAuthUser(account)?.handle, "Inês!");
  assert.equal(
    normalizeAuthUser({ ...account, handle: "Inês de Lisboa" })?.handle,
    "Inês de Lisboa",
  );
});
