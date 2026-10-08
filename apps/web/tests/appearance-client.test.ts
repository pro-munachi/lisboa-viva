import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../lib/auth";
import { normalizeAuthUser } from "../lib/auth";
import {
  DEFAULT_APPEARANCE,
  type CharacterAppearance,
} from "../lib/appearance";
import {
  AppearanceSaveError,
  saveAppearance,
  savedAppearanceUser,
} from "../lib/appearance-client";

const userId = "11111111-1111-4111-8111-111111111111";
const appearance: CharacterAppearance = {
  bodyType: "female",
  outfitStyle: "jacket",
  topColor: "#c19a4b",
  bottomColor: "#4e504b",
  hairStyle: "bun",
  hairColor: "#b98452",
  skinTone: "#5b3d30",
  shoeColor: "#292d31",
};
const user: AuthUser = {
  id: userId,
  handle: "wardrobe_traveller",
  email: "wardrobe@example.test",
  userType: "tourist",
  accountStatus: "active",
  preferredLocale: "en",
  timezone: "Europe/Lisbon",
  adultConfirmedAt: "2026-10-08T10:00:00Z",
  emailVerifiedAt: null,
  onboardingCompletedAt: null,
  lastLoginAt: null,
  createdAt: "2026-10-08T10:00:00Z",
  updatedAt: "2026-10-08T10:30:00Z",
  roles: ["player"],
  appearance,
};

test("wardrobe PATCH sends all eight fields under the current session and returns a copied saved account", async () => {
  const controller = new AbortController();
  const draft = { ...appearance };
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "/api/auth/appearance");
    assert.equal(init?.method, "PATCH");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.signal, controller.signal);
    assert.deepEqual(JSON.parse(init?.body as string), draft);
    assert.equal(
      (init?.headers as Record<string, string>)["content-type"],
      "application/json",
    );
    return Response.json({
      ...user,
      appearance: { ...appearance, unexpected: "discard" },
      unexpected: "discard",
    });
  };
  const saved = await saveAppearance(userId, draft, controller.signal, fetcher);
  assert.equal(calls, 1);
  assert.deepEqual(saved, user);
  assert.deepEqual(draft, appearance);
  assert.notEqual(saved.appearance, draft);
  assert.notEqual(saved.roles, user.roles);
});

test("a different account or mismatched saved field cannot replace the active appearance", () => {
  assert.throws(
    () =>
      savedAppearanceUser(
        { ...user, id: "22222222-2222-4222-8222-222222222222" },
        userId,
        appearance,
      ),
    AppearanceSaveError,
  );
  for (const key of Object.keys(appearance) as (keyof CharacterAppearance)[]) {
    assert.throws(
      () =>
        savedAppearanceUser(
          {
            ...user,
            appearance: { ...appearance, [key]: DEFAULT_APPEARANCE[key] },
          },
          userId,
          appearance,
        ),
      AppearanceSaveError,
      `Saved ${key} must match the submitted selection`,
    );
  }
});

test("malformed saved accounts and unsupported drafts do not update the session", async () => {
  for (const value of [
    null,
    { ...user, appearance: null },
    { ...user, accountStatus: "suspended" },
    { ...user, roles: "player" },
    { ...user, updatedAt: "unreadable" },
    { ...user, adultConfirmedAt: undefined },
    { ...user, userType: "invented" },
    { ...user, appearance: { ...appearance, bodyType: "invented" } },
    { ...user, appearance: { ...appearance, topColor: "#42b894" } },
  ]) {
    assert.throws(
      () => savedAppearanceUser(value, userId, appearance),
      AppearanceSaveError,
    );
  }
  let called = false;
  const fetcher: typeof fetch = async () => {
    called = true;
    return Response.json(user);
  };
  await assert.rejects(
    saveAppearance(
      userId,
      { ...appearance, hairStyle: "invalid" } as unknown as CharacterAppearance,
      new AbortController().signal,
      fetcher,
    ),
    AppearanceSaveError,
  );
  assert.equal(called, false);
});

test("legacy saved accounts default to male while an unconfirmed female response fails", () => {
  const { bodyType: _bodyType, ...legacy } = DEFAULT_APPEARANCE;
  assert.deepEqual(
    savedAppearanceUser(
      { ...user, appearance: legacy },
      userId,
      DEFAULT_APPEARANCE,
    ).appearance,
    DEFAULT_APPEARANCE,
  );
  assert.throws(
    () =>
      savedAppearanceUser({ ...user, appearance: legacy }, userId, {
        ...DEFAULT_APPEARANCE,
        bodyType: "female",
      }),
    AppearanceSaveError,
  );
});

test("a legacy Male + Dress account remains readable but an incompatible wardrobe save never sends", async () => {
  const legacy = {
    ...appearance,
    bodyType: "male" as const,
    outfitStyle: "dress" as const,
  };
  assert.deepEqual(
    normalizeAuthUser({ ...user, appearance: legacy })?.appearance,
    legacy,
  );
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ ...user, appearance: legacy });
  };
  await assert.rejects(
    saveAppearance(userId, legacy, new AbortController().signal, fetcher),
    AppearanceSaveError,
  );
  assert.equal(calls, 0);
});

test("validation, expired-session and service errors preserve the draft and expose a retryable error", async () => {
  for (const [status, code] of [
    [400, "invalid_appearance"],
    [401, "session_expired"],
    [403, "forbidden"],
    [503, "service_unavailable"],
  ] as const) {
    const draft = { ...appearance };
    const fetcher: typeof fetch = async () =>
      Response.json({ error: code }, { status });
    await assert.rejects(
      saveAppearance(userId, draft, new AbortController().signal, fetcher),
      (error: unknown) =>
        error instanceof AppearanceSaveError && error.status === status,
    );
    assert.deepEqual(draft, appearance);
  }
  const unreadable: typeof fetch = async () =>
    new Response("not JSON", { status: 200 });
  await assert.rejects(
    saveAppearance(
      userId,
      appearance,
      new AbortController().signal,
      unreadable,
    ),
    AppearanceSaveError,
  );
});

test("wardrobe cancellation propagates to the pending request without accepting a late account", async () => {
  const controller = new AbortController();
  let received: AbortSignal | null = null;
  const fetcher: typeof fetch = async (_url, init) => {
    received = init?.signal as AbortSignal;
    return await new Promise<Response>((_resolve, reject) => {
      received?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  };
  const saving = saveAppearance(userId, appearance, controller.signal, fetcher);
  controller.abort();
  await assert.rejects(
    saving,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(received, controller.signal);
});
