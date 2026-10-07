import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChatRequestError,
  ChatTimeline,
  chatAttempt,
  chatBodyError,
  chatCharacterCount,
  fetchChatPage,
  mergeChatMessages,
  normalizeChatBody,
  parseChatPage,
  sendChatMessage,
  type ChatMessage,
} from "../lib/chat-client";

const room = "lisbon:hotspot:node:123";
const uuid = "ec00c1d2-7703-46b6-9800-6a516fa2bb95";
function message(id: string, body = "Coffee after a city walk?"): ChatMessage {
  return {
    id,
    room,
    body,
    sentAt: "2026-10-07T13:00:00Z",
    author: { id: uuid, handle: "ines", userType: "local" },
  };
}

test("chat body limits count Unicode code points and match Go whitespace/control rules", () => {
  assert.equal(chatCharacterCount("☕😀"), 2);
  assert.equal(chatBodyError("😀".repeat(1000)), null);
  assert.match(chatBodyError("😀".repeat(1001))!, /1,000/);
  assert.equal(chatBodyError("Coffee\n\tand a city walk"), null);
  assert.match(chatBodyError("Coffee\rand a walk")!, /control/);
  assert.match(chatBodyError("Coffee\u0081and a walk")!, /control/);
  assert.match(chatBodyError("Coffee\u0000and a walk")!, /control/);
  assert.equal(chatBodyError("\rCoffee\r"), null);
  assert.equal(chatBodyError("\u0085Coffee\u0085"), null);
  assert.equal(normalizeChatBody("\u3000 Coffee \u0085"), "Coffee");
  assert.equal(normalizeChatBody("\ufeffCoffee"), "\ufeffCoffee");
  assert.match(chatBodyError("\r\n\t ")!, /first/);
});

test("uncertain sends retain their UUID on retry and edited messages get a fresh attempt", () => {
  let calls = 0;
  const makeUuid = () => `${uuid}-${++calls}`;
  const first = chatAttempt("  Coffee? \r", null, makeUuid);
  assert.equal(first.body, "Coffee?");
  assert.strictEqual(chatAttempt("Coffee?", first, makeUuid), first);
  assert.equal(calls, 1);
  const changed = chatAttempt("City walk?", first, makeUuid);
  assert.notEqual(changed.clientId, first.clientId);
  assert.equal(calls, 2);
  assert.throws(() => chatAttempt("\n", first, makeUuid), /first/);
  assert.equal(calls, 2);
});

test("POST acknowledgement cannot skip another player's unread messages", () => {
  const timeline = new ChatTimeline();
  timeline.acceptPage({
    messages: [message("50")],
    hasMore: false,
    nextCursor: "50",
  });
  timeline.acceptSent(message("100"));
  assert.equal(timeline.cursor, "50");
  timeline.acceptPage({
    messages: [message("51"), message("52")],
    hasMore: true,
    nextCursor: "52",
  });
  assert.equal(timeline.cursor, "52");
  assert.deepEqual(
    timeline.messages.map((item) => item.id),
    ["50", "51", "52", "100"],
  );
  const update = timeline.acceptPage({
    messages: [message("100")],
    hasMore: false,
    nextCursor: "100",
  });
  assert.equal(update.added, 0);
  assert.equal(timeline.messages.length, 4);
  const empty = new ChatTimeline();
  empty.acceptPage({ messages: [], hasMore: false, nextCursor: null });
  assert.equal(
    empty.cursor,
    "0",
    "an empty initial room must poll incrementally from zero",
  );
});

test("message history deduplicates large decimal IDs exactly, caps history and rejects room mixing", () => {
  const result = mergeChatMessages(
    [message("9007199254740993"), message("9007199254740992")],
    [message("9007199254740993"), message("9007199254740994")],
    2,
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["9007199254740993", "9007199254740994"],
  );
  assert.throws(
    () => mergeChatMessages(result, [{ ...message("1"), room: "lisbon:city" }]),
    /different room/,
  );
});

test("cursor pages reject foreign rooms, invalid ordering and nonprogressing hasMore responses", () => {
  const valid = { messages: [message("51")], hasMore: false, nextCursor: "51" };
  assert.equal(parseChatPage(valid, room, "50").nextCursor, "51");
  assert.throws(() => parseChatPage(valid, "lisbon:city", "50"), /message/);
  assert.throws(() => parseChatPage(valid, room, "51"), /out-of-order/);
  assert.throws(
    () => parseChatPage({ ...valid, nextCursor: "52" }, room, "50"),
    /cursor/,
  );
  assert.throws(
    () =>
      parseChatPage(
        { messages: [], hasMore: true, nextCursor: "50" },
        room,
        "50",
      ),
    /cursor/,
  );
  assert.throws(
    () =>
      parseChatPage(
        {
          ...valid,
          messages: [{ ...message("51"), author: { handle: "ines" } }],
        },
        room,
        "50",
      ),
    /message/,
  );
  assert.throws(
    () =>
      parseChatPage(
        { ...valid, nextCursor: "9223372036854775808" },
        room,
        "50",
      ),
    /unreadable/,
  );
});

test("GET preserves exact place IDs, cursor and same-origin abortable no-store behavior", async () => {
  const controller = new AbortController();
  const fetcher = (async (input, options) => {
    const url = new URL(String(input), "https://roam.test");
    assert.equal(url.pathname, "/api/chat/messages");
    assert.equal(url.searchParams.get("room"), room);
    assert.equal(url.searchParams.get("after"), "9007199254740992");
    assert.equal(url.searchParams.get("limit"), "50");
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.cache, "no-store");
    assert.strictEqual(options?.signal, controller.signal);
    return Response.json({
      messages: [message("9007199254740993")],
      hasMore: false,
      nextCursor: "9007199254740993",
    });
  }) as typeof fetch;
  assert.equal(
    (await fetchChatPage(room, "9007199254740992", controller.signal, fetcher))
      .messages.length,
    1,
  );
});

test("POST sends only room, body and retry UUID, and treats both new and idempotent replies as success", async () => {
  const controller = new AbortController();
  const attempt = chatAttempt("Coffee?", null, () => uuid);
  for (const status of [201, 200]) {
    const fetcher = (async (input, options) => {
      assert.equal(input, "/api/chat/messages");
      assert.equal(options?.method, "POST");
      assert.equal(options?.credentials, "same-origin");
      assert.equal(options?.cache, "no-store");
      assert.strictEqual(options?.signal, controller.signal);
      assert.deepEqual(JSON.parse(String(options?.body)), {
        room,
        body: "Coffee?",
        clientId: uuid,
      });
      return Response.json({ message: message("51", "Coffee?") }, { status });
    }) as typeof fetch;
    assert.equal(
      (await sendChatMessage(room, attempt, controller.signal, fetcher)).id,
      "51",
    );
  }
});

test("expired sessions and service failures stay distinguishable without accepting malformed success data", async () => {
  const signal = new AbortController().signal;
  for (const status of [401, 403, 409, 429, 503]) {
    await assert.rejects(
      fetchChatPage(room, null, signal, (async () =>
        Response.json({ error: "opaque" }, { status })) as typeof fetch),
      (error: unknown) =>
        error instanceof ChatRequestError && error.status === status,
    );
  }
  await assert.rejects(
    fetchChatPage(room, null, signal, (async () =>
      Response.json({ messages: "wrong" })) as typeof fetch),
    /unreadable/,
  );
});
