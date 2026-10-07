import assert from "node:assert/strict";
import { test } from "node:test";
import { requireAccount } from "../lib/server-account";

async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("missing, unrelated and empty cookies reject before any backend fetch", async () => {
  await withFetch(
    (async () => {
      throw new Error("No session means no fetch");
    }) as typeof fetch,
    async () => {
      for (const cookie of [
        "",
        "theme=cream",
        "other_lv_session=opaque",
        "lv_session=",
        "lv_session=   ; theme=cream",
      ]) {
        const response = await requireAccount(
          new Request("https://roam.test/api/recommendations", {
            headers: cookie ? { cookie } : {},
          }),
        );
        assert.equal(response?.status, 401);
        assert.equal(response?.headers.get("cache-control"), "no-store");
        assert.deepEqual(await response?.json(), { error: "session_expired" });
      }
    },
  );
});

test("a successful Go session check allows the caller and leaves its request body unread", async () => {
  await withFetch(
    (async (input, options) => {
      assert.equal(new URL(String(input)).pathname, "/v1/auth/me");
      assert.equal(options?.method, "GET");
      assert.equal(options?.body, undefined);
      assert.equal(options?.cache, "no-store");
      assert.equal(
        new Headers(options?.headers).get("cookie"),
        "theme=cream; lv_session=opaque-token",
      );
      return Response.json({ id: "account-test", accountStatus: "active" });
    }) as typeof fetch,
    async () => {
      const request = new Request("https://roam.test/api/recommendations", {
        method: "POST",
        headers: {
          cookie: "theme=cream; lv_session=opaque-token",
          "content-type": "application/json",
        },
        body: '{"setup":"caller-owned"}',
      });
      assert.equal(await requireAccount(request), null);
      assert.equal(request.bodyUsed, false);
      assert.equal(await request.text(), '{"setup":"caller-owned"}');
    },
  );
});

test("a forged or expired session remains unauthorized instead of granting access from cookie presence", async () => {
  await withFetch(
    (async () =>
      Response.json(
        { error: "session_expired" },
        { status: 401 },
      )) as typeof fetch,
    async () => {
      const response = await requireAccount(
        new Request("https://roam.test/api/recommendations", {
          headers: { cookie: "lv_session=forged" },
        }),
      );
      assert.equal(response?.status, 401);
      assert.equal(response?.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response?.json(), { error: "session_expired" });
    },
  );
});

test("backend outages and unexpected upstream responses remain retryable service errors", async () => {
  for (const status of [503, 500, 404, 302]) {
    await withFetch(
      (async () =>
        Response.json(
          { error: "service_unavailable" },
          { status },
        )) as typeof fetch,
      async () => {
        const response = await requireAccount(
          new Request("https://roam.test/api/recommendations", {
            headers: { cookie: "lv_session=valid-looking" },
          }),
        );
        assert.equal(response?.status, 503);
        assert.equal(response?.headers.get("cache-control"), "no-store");
      },
    );
  }
  await withFetch(
    (async () => {
      throw new Error("Simulated network outage");
    }) as typeof fetch,
    async () => {
      const response = await requireAccount(
        new Request("https://roam.test/api/recommendations", {
          headers: { cookie: "lv_session=valid-looking" },
        }),
      );
      assert.equal(response?.status, 503);
    },
  );
});
