import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../app/api/chat/direct/messages/route";
import { GET as inbox } from "../app/api/chat/direct/conversations/route";

const peer = "49b27cb0-0011-441a-814e-f3f3ebdf7fd3";

test("private message and inbox proxies preserve session and cursor without caching or replacing API authorization", async () => {
  const previous = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input, options) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.equal(
      new Headers(options?.headers).get("cookie"),
      "lv_session=test-session",
    );
    assert.equal(options?.cache, "no-store");
    if (url.pathname.endsWith("messages")) {
      assert.equal(url.searchParams.get("peer"), peer);
      assert.equal(url.searchParams.get("after"), "9007199254740993");
    }
    return Response.json({ error: "session_expired" }, { status: 401 });
  }) as typeof fetch;
  try {
    const request = (path: string) =>
      new Request(`https://roam.test${path}`, {
        headers: { cookie: "lv_session=test-session" },
      });
    for (const response of [
      await GET(
        request(
          `/api/chat/direct/messages?peer=${peer}&after=9007199254740993`,
        ),
      ),
      await inbox(request("/api/chat/direct/conversations")),
    ]) {
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(paths, [
      "/v1/chat/direct/messages",
      "/v1/chat/direct/conversations",
    ]);
  } finally {
    globalThis.fetch = previous;
  }
});

test("private sends preserve recipient and idempotency UUID; cross-origin sends never reach Go", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  const body = {
    recipientId: peer,
    body: "Coffee?",
    clientId: "9684aa03-c50a-4131-85a1-87ee9b0717cd",
  };
  globalThis.fetch = (async (input, options) => {
    calls++;
    assert.equal(new URL(String(input)).pathname, "/v1/chat/direct/messages");
    assert.equal(options?.method, "POST");
    assert.deepEqual(
      JSON.parse(new TextDecoder().decode(options?.body as ArrayBuffer)),
      body,
    );
    assert.equal(
      new Headers(options?.headers).get("cookie"),
      "lv_session=test-session",
    );
    return Response.json({ message: { id: "1" } }, { status: 201 });
  }) as typeof fetch;
  try {
    const request = (origin: string) =>
      new Request("https://roam.test/api/chat/direct/messages", {
        method: "POST",
        headers: {
          host: "roam.test",
          origin,
          cookie: "lv_session=test-session",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    assert.equal((await POST(request("https://roam.test"))).status, 201);
    assert.equal((await POST(request("https://other.test"))).status, 403);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
