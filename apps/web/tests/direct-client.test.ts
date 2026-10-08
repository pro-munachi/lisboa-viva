import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChatRequestError,
  chatAttempt,
  type ChatMessage,
} from "../lib/chat-client";
import {
  directRoom,
  fetchDirectConversations,
  fetchDirectPage,
  parseDirectConversations,
  sendDirectMessage,
} from "../lib/direct-client";

const viewer = "ec00c1d2-7703-46b6-9800-6a516fa2bb95";
const peer = "49b27cb0-0011-441a-814e-f3f3ebdf7fd3";
const other = "9684aa03-c50a-4131-85a1-87ee9b0717cd";
const signal = new AbortController().signal;
const contact = (id = peer) => ({ id, handle: "ines", userType: "local" });
const message = (id = "51", authorId = peer): ChatMessage => ({
  id,
  room: directRoom(peer),
  body: "Coffee by the river?",
  sentAt: "2026-10-07T13:00:00Z",
  author: {
    id: authorId,
    handle: authorId === viewer ? "muna" : "ines",
    userType: "local",
  },
});

test("private inbox accepts only unique two-person conversations and exact int64 ordering", () => {
  const first = {
    peer: contact(),
    lastMessage: message("9007199254740994", viewer),
  };
  const second = {
    peer: contact(other),
    lastMessage: {
      ...message("9007199254740993", other),
      room: directRoom(other),
    },
  };
  const inbox = parseDirectConversations(
    { conversations: [first, second] },
    viewer,
  );
  assert.deepEqual(
    inbox.map((item) => item.lastMessage.id),
    ["9007199254740994", "9007199254740993"],
  );
  assert.deepEqual(inbox[0].peer, contact());
  assert.deepEqual(parseDirectConversations({ conversations: [] }, viewer), []);
  for (const conversations of [
    [first, first],
    [second, first],
    [{ ...first, peer: contact(viewer) }],
    [{ ...first, lastMessage: message("51", other) }],
    [{ ...first, lastMessage: { ...message(), room: "lisbon:city" } }],
    [{ ...first, peer: { ...contact(), userType: "admin" } }],
    Array(51).fill(first),
  ])
    assert.throws(
      () => parseDirectConversations({ conversations }, viewer),
      ChatRequestError,
    );
});

test("private inbox projects only public identity and strips extra response fields", () => {
  const inbox = parseDirectConversations(
    {
      conversations: [
        {
          peer: {
            ...contact(),
            email: "not-for-the-client@example.test",
            roles: ["admin"],
          },
          lastMessage: {
            ...message(),
            author: { ...message().author, email: "hidden@example.test" },
          },
          unread: 10,
        },
      ],
    },
    viewer,
  );
  assert.deepEqual(Object.keys(inbox[0].peer).sort(), [
    "handle",
    "id",
    "userType",
  ]);
  assert.deepEqual(Object.keys(inbox[0].lastMessage.author).sort(), [
    "handle",
    "id",
    "userType",
  ]);
  assert.equal(
    "unread" in inbox[0],
    false,
    "the client must not invent read receipt semantics",
  );
});

test("private GET uses peer identity, exact cursor and abortable authenticated no-store requests", async () => {
  const fetcher = (async (input, options) => {
    const url = new URL(String(input), "https://roam.test");
    assert.equal(url.pathname, "/api/chat/direct/messages");
    assert.equal(url.searchParams.get("peer"), peer);
    assert.equal(url.searchParams.get("after"), "9007199254740992");
    assert.equal(url.searchParams.get("limit"), "50");
    assert.equal(url.searchParams.has("room"), false);
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.cache, "no-store");
    assert.strictEqual(options?.signal, signal);
    return Response.json({
      messages: [message("9007199254740993")],
      hasMore: false,
      nextCursor: "9007199254740993",
    });
  }) as typeof fetch;
  const page = await fetchDirectPage(
    peer,
    viewer,
    "9007199254740992",
    signal,
    fetcher,
  );
  assert.equal(page.messages[0].room, `direct:${peer}`);
});

test("private GET rejects cross-thread messages and authors outside the selected pair", async () => {
  for (const entry of [
    { ...message(), room: directRoom(other) },
    message("51", other),
  ])
    await assert.rejects(
      fetchDirectPage(peer, viewer, null, signal, (async () =>
        Response.json({
          messages: [entry],
          hasMore: false,
          nextCursor: "51",
        })) as typeof fetch),
      ChatRequestError,
    );
});

test("invalid peer, self-message and cursors fail before any private network request", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return Response.json({});
  }) as typeof fetch;
  for (const [target, after] of [
    [`${peer}?room=public`, null],
    [viewer, null],
    [peer, "-1"],
    [peer, "9223372036854775808"],
  ]) {
    await assert.rejects(
      fetchDirectPage(target!, viewer, after, signal, fetcher),
      ChatRequestError,
    );
  }
  await assert.rejects(
    sendDirectMessage(
      viewer,
      viewer,
      chatAttempt("Hello", null, () => other),
      signal,
      fetcher,
    ),
    /another person/,
  );
  assert.equal(calls, 0);
});

test("private sends preserve retry UUID and submit only recipient, body and clientId", async () => {
  const attempt = chatAttempt("Coffee by the river?", null, () => other);
  for (const status of [201, 200]) {
    const fetcher = (async (input, options) => {
      assert.equal(input, "/api/chat/direct/messages");
      assert.equal(options?.method, "POST");
      assert.equal(options?.credentials, "same-origin");
      assert.equal(options?.cache, "no-store");
      assert.strictEqual(options?.signal, signal);
      assert.deepEqual(JSON.parse(String(options?.body)), {
        recipientId: peer,
        body: attempt.body,
        clientId: other,
      });
      return Response.json({ message: message("51", viewer) }, { status });
    }) as typeof fetch;
    assert.equal(
      (await sendDirectMessage(peer, viewer, attempt, signal, fetcher)).author
        .id,
      viewer,
    );
    assert.strictEqual(chatAttempt(attempt.body, attempt), attempt);
  }
  await assert.rejects(
    sendDirectMessage(peer, viewer, attempt, signal, (async () =>
      Response.json({ message: message() })) as typeof fetch),
    /send confirmation/,
  );
});

test("private inbox fetch is viewer-scoped through the session, not a submitted account ID", async () => {
  const inbox = await fetchDirectConversations(viewer, signal, (async (
    input,
    options,
  ) => {
    assert.equal(input, "/api/chat/direct/conversations");
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.cache, "no-store");
    assert.strictEqual(options?.signal, signal);
    return Response.json({
      conversations: [{ peer: contact(), lastMessage: message() }],
    });
  }) as typeof fetch);
  assert.equal(inbox[0].peer.id, peer);
});

test("private failures distinguish session expiry, unavailable peer and uncertain service responses", async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 429, 503]) {
    await assert.rejects(
      fetchDirectPage(peer, viewer, null, signal, (async () =>
        Response.json({ error: "opaque" }, { status })) as typeof fetch),
      (error: unknown) =>
        error instanceof ChatRequestError && error.status === status,
    );
  }
  await assert.rejects(
    fetchDirectConversations(
      viewer,
      signal,
      (async () => new Response("not-json")) as typeof fetch,
    ),
    /unreadable inbox/,
  );
});
