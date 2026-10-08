import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChatRequestError,
  chatAttempt,
  type ChatMessage,
} from "../lib/chat-client";
import {
  ACTIVITY_DRINKS,
  activityRoomId,
  createActivity,
  creationRetryDraft,
  restoreCreationRetry,
  drinkAvailable,
  fetchActivities,
  getActivity,
  getWallet,
  incomingChallenges,
  joinActivity,
  leaveActivity,
  parseActivityFeed,
  parseActivityRoom,
  parseWallet,
  performActivityAction,
  persistActivityActions,
  restoreActivityActions,
  activityActionKey,
  sendActivityMessage,
  validateActivityCreate,
  venuesForActivity,
  type ActivityCreateInput,
  type ActivityEvent,
  type ActivityRoom,
  type ActivityVenue,
} from "../lib/activities";

const viewer = "ec00c1d2-7703-46b6-9800-6a516fa2bb95";
const peer = "49b27cb0-0011-441a-814e-f3f3ebdf7fd3";
const former = "9684aa03-c50a-4131-85a1-87ee9b0717cd";
const activityId = "9e08d134-4e91-4b4a-9c8b-0a4c1c49c405";
const eventId = "bbaaa1c8-55aa-48cf-b9b6-43314a0e4859";
const clientId = "00cd00b9-2a2f-48a5-b139-5ebc147eb2cd";
const signal = new AbortController().signal;
const wallet = { balance: 192, currency: "ROAM credits" as const };
const now = Date.parse("2026-10-08T14:00:00Z");
const venues: ActivityVenue[] = [
  {
    id: "node:6016016285",
    name: "Café Janis",
    category: "cafe",
    area: "Cais do Sodré",
    latitude: 38.7079,
    longitude: -9.1456,
  },
  {
    id: "node:1802158801",
    name: "Tasca do Chico",
    category: "bar",
    area: "Bairro Alto",
    latitude: 38.7105,
    longitude: -9.1435,
  },
  {
    id: "way:544205149",
    name: "Praia da Conceição",
    category: "beach",
    area: "Cascais",
    latitude: 38.6995,
    longitude: -9.4196,
  },
  {
    id: "node:7354561901",
    name: "Museum",
    category: "culture",
    area: "Belém",
    latitude: 38.7,
    longitude: -9.19,
  },
  {
    id: "node:7087980095",
    name: "Gym",
    category: "gym",
    area: "Saldanha",
    latitude: 38.735,
    longitude: -9.14,
  },
];
const person = (id = viewer) => ({
  id,
  handle: id === viewer ? "maya" : "ines",
});
const member = (id = viewer) => ({
  ...person(id),
  userType: "tourist" as const,
  joinedAt: "2026-10-08T13:00:00Z",
  socialOptIn: false,
});
function message(id = "9007199254740993", authorId = viewer): ChatMessage {
  return {
    id,
    room: activityRoomId(activityId),
    body: "Meet by the entrance?",
    sentAt: "2026-10-08T13:58:00Z",
    author: { ...person(authorId), userType: "local" },
  };
}
function room(): ActivityRoom {
  return {
    id: activityId,
    title: "Coffee and a city wander",
    category: "coffee",
    travellerType: "everyone",
    venueId: venues[0].id,
    startsAt: "2026-10-08T14:00:00Z",
    capacity: 6,
    memberCount: 2,
    host: person(),
    joined: true,
    createdAt: "2026-10-08T13:00:00Z",
    members: [member(), member(peer)],
    messages: [message()],
    events: [],
  };
}
const input: ActivityCreateInput = {
  title: " Coffee and a city wander ",
  category: "coffee",
  travellerType: "nomad",
  venueId: venues[0].id,
  startsAt: "2026-10-08T14:00:00Z",
  capacity: 6,
  clientId,
};
const challenge = (): ActivityEvent => ({
  id: eventId,
  inviteId: eventId,
  kind: "challenge",
  actor: person(peer),
  target: person(),
  label: "Ines invited Maya to a playful showdown",
  createdAt: "2026-10-08T13:59:00Z",
});
const response = (value: unknown, status = 200) =>
  (async () => Response.json(value, { status })) as typeof fetch;

test("wallet parses only authoritative nonnegative integer ROAM credits and strips extra fields", () => {
  assert.deepEqual(parseWallet({ ...wallet, actualMoney: 1000 }), wallet);
  for (const value of [
    null,
    { ...wallet, balance: -1 },
    { ...wallet, balance: 1.1 },
    { ...wallet, balance: "200" },
    { ...wallet, balance: Number.MAX_SAFE_INTEGER + 1 },
    { ...wallet, currency: "EUR" },
  ])
    assert.throws(() => parseWallet(value), ChatRequestError);
  assert.deepEqual(
    ACTIVITY_DRINKS.map(({ cost }) => cost),
    [8, 12, 15],
  );
});

test("feed accepts actual mapped venue categories and keeps the category/venue contract consistent", () => {
  const parsed = parseActivityFeed({ activities: [room()], venues, wallet });
  assert.deepEqual(parsed.activities[0].host, person());
  for (const [category, expected] of [
    ["coffee", "cafe"],
    ["nightlife", "bar"],
    ["outdoors", "beach"],
    ["culture", "culture"],
    ["wellness", "gym"],
  ] as const)
    assert.deepEqual(
      venuesForActivity(category, venues).map((venue) => venue.category),
      [expected],
    );
  for (const feed of [
    { activities: [room(), room()], venues, wallet },
    { activities: [room()], venues: [venues[0], venues[0]], wallet },
    { activities: [room()], venues: venues.slice(1), wallet },
    { activities: [{ ...room(), category: "nightlife" }], venues, wallet },
    { activities: [], venues: [{ ...venues[0], category: "airport" }], wallet },
    { activities: [], venues: [{ ...venues[0], latitude: 91 }], wallet },
    { activities: Array(61).fill(room()), venues, wallet },
  ])
    assert.throws(() => parseActivityFeed(feed), ChatRequestError);
  assert.equal(drinkAvailable("coffee", venues[0]), true);
  assert.equal(drinkAvailable("beer", venues[0]), false);
  assert.equal(drinkAvailable("coffee", venues[1]), false);
  assert.equal(drinkAvailable("mocktail", venues[1]), true);
  assert.equal(drinkAvailable("beer", venues[2]), false);
  assert.equal(drinkAvailable("coffee"), false);
});

test("room verifies membership, bounded actual lists, public identity and exact decimal message order", () => {
  const original = room();
  const parsed = parseActivityRoom(
    {
      ...original,
      members: original.members.map((value) => ({
        ...value,
        email: "hidden@example.test",
      })),
      host: { ...original.host, email: "hidden@example.test" },
      messages: [
        message("9007199254740992", former),
        message("9007199254740993"),
      ],
    },
    activityId,
    viewer,
  );
  assert.deepEqual(
    parsed.messages.map((item) => item.id),
    ["9007199254740992", "9007199254740993"],
  );
  assert.equal(
    parsed.messages[0].author.id,
    former,
    "messages remain readable after their author leaves the room",
  );
  assert.equal("email" in parsed.members[0], false);
  assert.equal("email" in parsed.host, false);
  for (const value of [
    { ...original, id: "invalid-id" },
    { ...original, joined: false },
    {
      ...original,
      members: [member(peer), member(former)],
      host: person(peer),
    },
    { ...original, memberCount: 3 },
    { ...original, members: [member(), member()] },
    { ...original, messages: [message("53"), message("52")] },
    { ...original, messages: [message(), message()] },
    { ...original, messages: [{ ...message(), room: "lisbon:city" }] },
    { ...original, messages: [message("55", "not-a-uuid")] },
    { ...original, messages: Array(51).fill(message()) },
  ])
    assert.throws(
      () => parseActivityRoom(value, activityId, viewer),
      ChatRequestError,
    );
  assert.throws(
    () => parseActivityRoom(original, eventId, viewer),
    ChatRequestError,
  );
});

test("event UUIDs stay distinct, chronological and bounded without exposing private identity", () => {
  const first = challenge();
  const second = {
    ...first,
    id: clientId,
    kind: "decline-challenge",
    actor: person(),
    target: person(peer),
    createdAt: "2026-10-08T14:00:00Z",
  };
  const parsed = parseActivityRoom(
    {
      ...room(),
      events: [
        { ...first, actor: { ...first.actor, email: "hidden@example.test" } },
        second,
      ],
    },
    activityId,
    viewer,
  );
  assert.equal("email" in parsed.events[0].actor, false);
  assert.equal(parsed.events[1].inviteId, eventId);
  for (const events of [
    [first, first],
    [second, first],
    [{ ...first, id: "42" }],
    [{ ...first, inviteId: "42" }],
    Array(31).fill(first),
  ])
    assert.throws(
      () => parseActivityRoom({ ...room(), events }),
      ChatRequestError,
    );
});

test("only unresolved incoming playfight invitations within ten minutes are shown", () => {
  const invite = challenge();
  const active = { ...room(), events: [invite] };
  assert.deepEqual(incomingChallenges(active, viewer, now), [invite]);
  assert.deepEqual(incomingChallenges(active, peer, now), []);
  assert.deepEqual(incomingChallenges(active, viewer, now + 600000), []);
  assert.deepEqual(incomingChallenges(active, viewer, now - 120000), []);
  assert.deepEqual(
    incomingChallenges({ ...active, members: [member()] }, viewer, now),
    [],
  );
  for (const rejoined of [viewer, peer])
    assert.deepEqual(
      incomingChallenges(
        {
          ...active,
          members: active.members.map((member) =>
            member.id === rejoined
              ? { ...member, joinedAt: "2026-10-08T14:00:00Z" }
              : member,
          ),
        },
        viewer,
        now,
      ),
      [],
    );
  for (const kind of ["accept-challenge", "decline-challenge"])
    assert.deepEqual(
      incomingChallenges(
        { ...active, events: [invite, { ...invite, id: clientId, kind }] },
        viewer,
        now,
      ),
      [],
    );
});

test("creation validates the backend title/group contract and strips unrelated fields", () => {
  const value = validateActivityCreate({
    ...input,
    secret: "not submitted",
  } as ActivityCreateInput);
  assert.equal(value.title, "Coffee and a city wander");
  assert.equal("secret" in value, false);
  assert.equal(
    input.title,
    " Coffee and a city wander ",
    "validation never mutates the saved retry input",
  );
  for (const candidate of [
    { ...input, title: "ab" },
    { ...input, title: "x".repeat(81) },
    { ...input, title: "Hi\u0000there" },
    { ...input, capacity: 1 },
    { ...input, capacity: 13 },
    { ...input, startsAt: "tomorrow" },
    { ...input, clientId: "missing" },
  ])
    assert.throws(() => validateActivityCreate(candidate), ChatRequestError);
  assert.equal(
    validateActivityCreate({ ...input, title: "😀".repeat(80) }).title.length,
    160,
  );
});

test("creation nonce and exact start-now time survive a Phone unmount while edited forms start a fresh attempt", () => {
  const fingerprint = "coffee-plan-fields";
  const draft = creationRetryDraft(input, fingerprint);
  const restored = restoreCreationRetry(
    JSON.parse(JSON.stringify(draft)),
    fingerprint,
  );
  assert.deepEqual(restored, validateActivityCreate(input));
  assert.equal(
    restored?.startsAt,
    input.startsAt,
    "an intentional retry never recomputes the arrival time",
  );
  assert.equal(restored?.clientId, clientId);
  assert.equal(restoreCreationRetry(draft, "changed-plan-fields"), null);
  assert.equal(
    restoreCreationRetry({ ...draft, clientId: eventId }, fingerprint),
    null,
  );
  assert.equal(
    restoreCreationRetry({ ...draft, body: "broken-json" }, fingerprint),
    null,
  );
  assert.equal(
    restoreCreationRetry(
      {
        ...draft,
        body: JSON.stringify({ fingerprint, input: { ...input, title: "x" } }),
      },
      fingerprint,
    ),
    null,
  );
  assert.equal(restoreCreationRetry(null, fingerprint), null);
});

test("GETs are authenticated, abortable and no-store; a restored room uses its own ID", async () => {
  const paths: string[] = [];
  const fetcher = (async (path, options) => {
    paths.push(String(path));
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.cache, "no-store");
    assert.strictEqual(options?.signal, signal);
    assert.equal(options?.body, undefined);
    if (path === "/api/wallet") return Response.json({ wallet });
    if (path === "/api/activities")
      return Response.json({ activities: [room()], venues, wallet });
    return Response.json({ activity: room(), wallet });
  }) as typeof fetch;
  assert.equal(
    (await fetchActivities(signal, fetcher)).venues[0].name,
    "Café Janis",
  );
  assert.deepEqual(await getWallet(signal, fetcher), wallet);
  assert.equal(
    (await getActivity(activityId, signal, viewer, fetcher)).activity.id,
    activityId,
  );
  assert.deepEqual(paths, [
    "/api/activities",
    "/api/wallet",
    `/api/activities/${activityId}`,
  ]);
  await assert.rejects(
    getActivity("../../admin", signal, viewer, fetcher),
    ChatRequestError,
  );
  assert.equal(paths.length, 3);
});

test("create/join requests keep server-selected membership and social consent off by default", async () => {
  const bodies: unknown[] = [];
  const fetcher = (async (_path, options) => {
    assert.equal(options?.method, "POST");
    assert.equal(
      new Headers(options?.headers).get("content-type"),
      "application/json",
    );
    bodies.push(JSON.parse(String(options?.body)));
    return Response.json({ activity: room(), wallet });
  }) as typeof fetch;
  await createActivity(input, viewer, signal, fetcher);
  await createActivity(input, viewer, signal, fetcher);
  await joinActivity(activityId, false, viewer, signal, fetcher);
  await joinActivity(activityId, true, viewer, signal, fetcher);
  assert.deepEqual(bodies[0], validateActivityCreate(input));
  assert.deepEqual(
    bodies[1],
    bodies[0],
    "retry keeps the exact nonce and payload",
  );
  assert.deepEqual(bodies.slice(2), [
    { socialOptIn: false },
    { socialOptIn: true },
  ]);
  await assert.rejects(
    joinActivity(activityId, false, former, signal, fetcher),
    /not available to this account/,
  );
});

test("group chat sends preserve retry nonce, normalize the body and require exact author/room acknowledgement", async () => {
  const attempt = chatAttempt(
    "  Meet by the entrance? \r",
    null,
    () => clientId,
  );
  const bodies: unknown[] = [];
  const fetcher = (async (_path, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return Response.json({ message: message() });
  }) as typeof fetch;
  const first = await sendActivityMessage(
    activityId,
    viewer,
    attempt,
    signal,
    fetcher,
  );
  await sendActivityMessage(
    activityId,
    viewer,
    chatAttempt("Meet by the entrance?", attempt),
    signal,
    fetcher,
  );
  assert.deepEqual(bodies, [
    { body: first.body, clientId },
    { body: first.body, clientId },
  ]);
  for (const invalid of [
    message("52", peer),
    { ...message(), body: "Changed body" },
    { ...message(), room: "activity:" + eventId },
  ])
    await assert.rejects(
      sendActivityMessage(
        activityId,
        viewer,
        attempt,
        signal,
        response({ message: invalid }),
      ),
      ChatRequestError,
    );
});

test("actions never calculate credit deductions; only confirmed server event and wallet are adopted", async () => {
  const drink = {
    ...challenge(),
    kind: "drink",
    actor: person(),
    target: undefined,
    inviteId: undefined,
    label: "Maya ordered a simulated coffee",
  };
  const bodies: unknown[] = [];
  const fetcher = (async (_path, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return Response.json({ event: drink, wallet: { ...wallet, balance: 172 } });
  }) as typeof fetch;
  const result = await performActivityAction(
    activityId,
    {
      kind: "drink",
      item: "coffee",
      clientId,
      secret: "not submitted",
    } as Parameters<typeof performActivityAction>[1],
    viewer,
    signal,
    fetcher,
  );
  assert.equal(
    result.wallet.balance,
    172,
    "the server may include other concurrent wallet actions",
  );
  assert.equal(wallet.balance, 192);
  assert.deepEqual(bodies, [{ kind: "drink", item: "coffee", clientId }]);
  await assert.rejects(
    performActivityAction(
      activityId,
      { kind: "drink", item: "coffee", clientId },
      viewer,
      signal,
      response({ event: { ...drink, actor: person(peer) }, wallet }),
    ),
    ChatRequestError,
  );
});

test("pending action retries survive Phone remount with exact nonces and are isolated by actor and room", () => {
  const pending = {
    kind: "drink" as const,
    item: "mocktail" as const,
    clientId,
  };
  const pendingWave = {
    kind: "wave" as const,
    targetId: peer,
    clientId: eventId,
  };
  const draft = persistActivityActions(activityId, viewer, [
    pending,
    pendingWave,
  ]);
  assert.deepEqual(
    restoreActivityActions(
      activityId,
      viewer,
      JSON.parse(JSON.stringify(draft)),
    ),
    [pending, pendingWave],
  );
  assert.deepEqual(restoreActivityActions(activityId, peer, draft), []);
  assert.deepEqual(restoreActivityActions(eventId, viewer, draft), []);
  assert.deepEqual(
    restoreActivityActions(activityId, viewer, {
      body: "invalid-json",
      attempt: null,
    }),
    [],
  );
  assert.deepEqual(persistActivityActions(activityId, viewer, []), {
    body: "",
    attempt: null,
  });
  assert.equal(
    activityActionKey({ kind: "drink", item: "mocktail" }),
    activityActionKey(pending),
  );
  assert.notEqual(
    activityActionKey(pending),
    activityActionKey({ kind: "drink", item: "beer" }),
  );
  assert.throws(
    () =>
      persistActivityActions(activityId, viewer, [
        pending,
        { ...pending, clientId: eventId },
      ]),
    ChatRequestError,
  );
  assert.throws(
    () =>
      persistActivityActions(activityId, viewer, [
        pending,
        { ...pendingWave, clientId },
      ]),
    ChatRequestError,
  );
  assert.throws(
    () =>
      persistActivityActions(activityId, viewer, [
        { ...pendingWave, targetId: viewer },
      ]),
    ChatRequestError,
  );
  const malformed = {
    body: JSON.stringify({
      actorId: viewer,
      activityId,
      requests: [{ ...pendingWave, targetId: viewer }],
    }),
    attempt: null,
  };
  assert.deepEqual(restoreActivityActions(activityId, viewer, malformed), []);
});

test("invitation response retains its original invitation ID, and self-targeting never reaches the network", async () => {
  const resolved = {
    ...challenge(),
    id: clientId,
    kind: "decline-challenge",
    actor: person(),
    target: person(peer),
  };
  const result = await performActivityAction(
    activityId,
    { kind: "decline-challenge", inviteId: eventId, clientId },
    viewer,
    signal,
    response({ event: resolved, wallet }),
  );
  assert.equal(result.event.inviteId, eventId);
  await assert.rejects(
    performActivityAction(
      activityId,
      { kind: "accept-challenge", inviteId: eventId, clientId },
      viewer,
      signal,
      response({
        event: { ...resolved, kind: "accept-challenge", inviteId: former },
        wallet,
      }),
    ),
    ChatRequestError,
  );
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return Response.json({});
  }) as typeof fetch;
  for (const invalid of [
    { kind: "flirt" as const, targetId: viewer, clientId },
    { kind: "challenge" as const, clientId },
    { kind: "accept-challenge" as const, inviteId: "1", clientId },
    { kind: "drink" as const, item: "water" as "beer", clientId },
  ])
    await assert.rejects(
      performActivityAction(activityId, invalid, viewer, signal, fetcher),
      ChatRequestError,
    );
  assert.equal(calls, 0);
});

test("leave requires its actual acknowledgement and action errors preserve useful retry/status information", async () => {
  await leaveActivity(activityId, signal, response({ left: true }));
  await assert.rejects(
    leaveActivity(activityId, signal, response({ left: false })),
    /leave confirmation/,
  );
  for (const [status, code, pattern] of [
    [409, "insufficient_credits", /enough ROAM credits/],
    [403, "activity_presence_required", /other player must also/],
    [403, "social_opt_in_required", /Both people/],
    [409, "invitation_unavailable", /no longer available/],
    [410, "activity_closed", /host closed/],
    [401, "session_expired", /session has expired/],
  ] as const)
    await assert.rejects(
      getWallet(signal, response({ error: code }, status)),
      (error: unknown) =>
        error instanceof ChatRequestError &&
        error.status === status &&
        pattern.test(error.message),
    );
});
