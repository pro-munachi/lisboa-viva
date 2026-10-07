import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../app/api/chat/messages/route";

test("chat proxy forwards room/cursor and session; Go retains authentication authority", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/v1/chat/messages");
    assert.equal(url.searchParams.get("room"), "lisbon:hotspot:comercio");
    assert.equal(url.searchParams.get("after"), "9007199254740993");
    assert.equal(new Headers(options?.headers).get("cookie"), "lv_session=test-session");
    assert.equal(options?.cache, "no-store");
    return Response.json({ error: "session_expired" }, { status: 401 });
  }) as typeof fetch;
  try {
    const response = await GET(new Request("https://roam.test/api/chat/messages?room=lisbon%3Ahotspot%3Acomercio&after=9007199254740993", {
      headers: { cookie: "lv_session=test-session" },
    }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    globalThis.fetch = original;
  }
});

test("chat writes retain the JSON payload and reject cross-origin submissions before reaching Go", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const body = { room: "lisbon:city", body: "Anyone for coffee?", clientId: "49b27cb0-0011-441a-814e-f3f3ebdf7fd3" };
  globalThis.fetch = (async (input, options) => {
    calls++;
    assert.equal(new URL(String(input)).pathname, "/v1/chat/messages");
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(options?.body as ArrayBuffer)), body);
    assert.equal(new Headers(options?.headers).get("cookie"), "lv_session=test-session");
    return Response.json({ message: { id: "1" } }, { status: 201 });
  }) as typeof fetch;
  try {
    const request = (origin: string) => new Request("https://roam.test/api/chat/messages", {
      method: "POST",
      headers: { host: "roam.test", origin, cookie: "lv_session=test-session", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal((await POST(request("https://roam.test"))).status, 201);
    assert.equal((await POST(request("https://other.test"))).status, 403);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
