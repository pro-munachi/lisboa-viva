import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardBackend, MAX_BACKEND_BODY_BYTES } from "../lib/backend";

async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
function writeRequest(body: BodyInit) {
  return new Request("https://roam.test/api/auth/login", {
    method: "POST",
    headers: {
      host: "roam.test",
      origin: "https://roam.test",
      "content-type": "application/json",
      cookie: "lv_session=test-token",
    },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

test("bounded same-origin writes preserve body, session cookie, status and no-store response", async () => {
  const body = new TextEncoder().encode(
    '{"identity":"test-account","password":"test-only-password"}',
  );
  await withFetch(
    (async (input, options) => {
      assert.equal(new URL(String(input)).pathname, "/v1/auth/login");
      assert.equal(options?.method, "POST");
      assert.equal(options?.redirect, "manual");
      assert.equal(options?.cache, "no-store");
      assert.deepEqual(new Uint8Array(options?.body as ArrayBuffer), body);
      assert.equal(
        new Headers(options?.headers).get("cookie"),
        "lv_session=test-token",
      );
      return Response.json(
        { id: "test-account" },
        {
          status: 201,
          headers: {
            "set-cookie":
              "lv_session=new-token; Path=/; HttpOnly; SameSite=Lax; Secure",
          },
        },
      );
    }) as typeof fetch,
    async () => {
      const response = await forwardBackend(
        writeRequest(body),
        "/v1/auth/login",
      );
      assert.equal(response.status, 201);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.ok(response.headers.get("set-cookie")?.includes("HttpOnly"));
      assert.deepEqual(await response.json(), { id: "test-account" });
    },
  );
});

test("a body of exactly 16 KiB is forwarded, while one extra byte returns 413 without a fetch", async () => {
  let calls = 0;
  await withFetch(
    (async (_input, options) => {
      calls++;
      assert.equal(
        (options?.body as ArrayBuffer).byteLength,
        MAX_BACKEND_BODY_BYTES,
      );
      return Response.json({ ok: true });
    }) as typeof fetch,
    async () => {
      assert.equal(
        (
          await forwardBackend(
            writeRequest(new Uint8Array(MAX_BACKEND_BODY_BYTES)),
            "/v1/auth/login",
          )
        ).status,
        200,
      );
      const response = await forwardBackend(
        writeRequest(new Uint8Array(MAX_BACKEND_BODY_BYTES + 1)),
        "/v1/auth/login",
      );
      assert.equal(response.status, 413);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "payload_too_large" });
      assert.equal(calls, 1);
    },
  );
});

test("streamed overflow is rejected before forwarding and cancels the remaining body", async () => {
  let cancelled = false;
  let chunksRead = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        chunksRead++;
        controller.enqueue(new Uint8Array(4096));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  await withFetch(
    (async () => {
      throw new Error("Overflow must not fetch");
    }) as typeof fetch,
    async () => {
      const response = await forwardBackend(
        writeRequest(body),
        "/v1/auth/login",
      );
      assert.equal(response.status, 413);
      assert.equal(cancelled, true);
      assert.equal(chunksRead, 5);
      assert.equal(body.locked, false);
    },
  );
});

test("cross-origin writes are rejected before buffering and GET session checks have no body", async () => {
  let calls = 0;
  await withFetch(
    (async (_input, options) => {
      calls++;
      assert.equal(options?.method, "GET");
      assert.equal(options?.body, undefined);
      return Response.json({ error: "session_expired" }, { status: 401 });
    }) as typeof fetch,
    async () => {
      for (const origin of ["https://attacker.test", "not-a-url"]) {
        const request = new Request("https://roam.test/api/auth/logout", {
          method: "POST",
          headers: { host: "roam.test", origin },
          body: "must stay unread",
        });
        const response = await forwardBackend(request, "/v1/auth/logout");
        assert.equal(response.status, 403);
        assert.equal(request.bodyUsed, false);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
      const response = await forwardBackend(
        new Request("https://roam.test/api/auth/me", {
          headers: { cookie: "lv_session=opaque" },
        }),
        "/v1/auth/me",
      );
      assert.equal(response.status, 401);
      assert.equal(calls, 1);
    },
  );
});

test("backend failure produces 503 and body stream errors never reach the backend", async () => {
  await withFetch(
    (async () => {
      throw new Error("Simulated connection failure");
    }) as typeof fetch,
    async () => {
      const response = await forwardBackend(
        new Request("https://roam.test/api/auth/me"),
        "/v1/auth/me",
      );
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "service_unavailable" });
    },
  );
  let calls = 0;
  await withFetch(
    (async () => {
      calls++;
      return Response.json({ ok: true });
    }) as typeof fetch,
    async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("Interrupted request body"));
        },
      });
      const response = await forwardBackend(
        writeRequest(body),
        "/v1/auth/login",
      );
      assert.equal(response.status, 503);
      assert.equal(calls, 0);
      assert.equal(body.locked, false);
    },
  );
});
