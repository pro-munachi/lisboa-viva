import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPresenceClient,
  nearbyPresencePeers,
  validPresenceLocation,
  PRESENCE_TTL_MS,
} from "../lib/presence-client";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
import { VENUES } from "../lib/venues";

const time = Date.UTC(2026, 9, 7, 20, 0);
const point = { latitude: 38.7061, longitude: -9.1459, area: "Cais do Sodré" };
const nextPoint = { latitude: 38.7496, longitude: -9.2026, area: "Benfica" };
function peer(extra: any = {}) {
  return {
    ...point,
    id: "12345678-1234-4123-8123-123456789012",
    handle: "qa_local",
    userType: "local",
    distanceMetres: 50,
    lastSeenAt: new Date(time).toISOString(),
    appearance: { ...DEFAULT_APPEARANCE },
    ...extra,
  };
}
function nearby(players: any[] = [peer()]) {
  return Response.json({ players, expiresInSeconds: 45 });
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("venue presence copies only canonical public place IDs and rejects private rooms", () => {
  const gym = VENUES.find((venue) => venue.category === "gym")!;
  assert.equal(validPresenceLocation({ ...point, placeId: gym.id }), true);
  for (const placeId of ["home", "made-up", 42])
    assert.equal(validPresenceLocation({ ...point, placeId }), false);
  const result = nearbyPresencePeers(
    {
      players: [
        peer({ placeId: gym.id, placeName: "Forged" }),
        peer({ id: "22345678-1234-4123-8123-123456789012", placeId: "home" }),
      ],
      expiresInSeconds: 45,
    },
    time,
  )!;
  assert.equal(result.length, 1);
  assert.equal(result[0].placeId, gym.id);
  assert.equal("placeName" in result[0], false);
});

test("entering and leaving at unchanged coordinates immediately updates the shared venue", async () => {
  const writes: any[] = [];
  const { client } = harness((async (_, init) => {
    if (init?.method === "PUT") {
      writes.push(JSON.parse(init.body as string));
      return Response.json({ online: true });
    }
    return nearby([]);
  }) as typeof fetch);
  await client.sync();
  client.setLocation({ ...point, placeId: "transit-cais-bus" });
  await tick();
  client.setLocation(point);
  await tick();
  assert.deepEqual(
    writes.map((p) => p.placeId),
    [undefined, "transit-cais-bus", undefined],
  );
  client.dispose();
});
function harness(fetcher: typeof fetch, clock = () => time, timeoutMs = 5000) {
  const states: any[] = [];
  const client = createPresenceClient({
    location: point,
    fetcher,
    now: clock,
    timeoutMs,
    onUpdate(snapshot) {
      states.push(snapshot);
    },
  });
  return { client, states };
}

test("nearby DTOs have bounded public fields, identifiers, coordinates, timestamps and appearance", () => {
  const invalid = [
    peer({ id: "not-a-uuid" }),
    peer({ id: "00000000-0000-0000-0000-000000000000" }),
    peer({ handle: "<script>" }),
    peer({ latitude: NaN }),
    peer({ longitude: 0 }),
    peer({ area: "injected\nline" }),
    peer({ area: "á".repeat(50) }),
    peer({ distanceMetres: 25_001 }),
    peer({ distanceMetres: 1.5 }),
    peer({ userType: "admin" }),
    peer({ lastSeenAt: "yesterday" }),
    peer({ lastSeenAt: new Date(time + 6000).toISOString() }),
    peer({ appearance: { ...DEFAULT_APPEARANCE, hairStyle: "injected" } }),
    peer({ appearance: { ...DEFAULT_APPEARANCE, topColor: "url(secret)" } }),
  ];
  const valid = peer({
    email: "private@example.test",
    roles: ["admin"],
    appearance: { ...DEFAULT_APPEARANCE, token: "secret" },
  });
  const result = nearbyPresencePeers(
    { players: [...invalid, valid, valid], expiresInSeconds: 45 },
    time,
  )!;
  assert.equal(result.length, 1);
  assert.equal("email" in result[0], false);
  assert.equal("roles" in result[0], false);
  assert.equal("token" in result[0].appearance, false);
  assert.notEqual(result[0].appearance, valid.appearance);
  assert.equal(
    nearbyPresencePeers(
      { players: new Array(41).fill(valid), expiresInSeconds: 45 },
      time,
    ),
    null,
  );
  assert.equal(
    nearbyPresencePeers({ players: "bad", expiresInSeconds: 45 }, time),
    null,
  );
  assert.equal(
    nearbyPresencePeers({ players: [], expiresInSeconds: 999 }, time),
    null,
  );
  assert.equal(validPresenceLocation(point), true);
  assert.equal(validPresenceLocation({ ...point, area: " " }), false);
});

test("duplicate refresh triggers share one bounded PUT/GET chain", async () => {
  const gate = deferred<Response>(),
    calls: string[] = [];
  const { client, states } = harness((async (_, init) => {
    calls.push(init?.method || "GET");
    return init?.method === "PUT" ? gate.promise : nearby();
  }) as typeof fetch);
  const first = client.sync(),
    second = client.sync(),
    third = client.sync();
  assert.equal(first, second);
  assert.equal(second, third);
  assert.deepEqual(calls, ["PUT"]);
  gate.resolve(Response.json({ online: true }));
  await first;
  assert.deepEqual(calls, ["PUT", "GET"]);
  assert.equal(states.at(-1).status, "online");
  assert.equal(states.at(-1).peers.length, 1);
  client.dispose();
});

test("hide waits for the outstanding heartbeat to settle, then deletes instead of issuing another PUT", async () => {
  const gate = deferred<Response>(),
    calls: string[] = [];
  const { client, states } = harness((async (_, init) => {
    calls.push(init?.method || "GET");
    return init?.method === "PUT"
      ? gate.promise
      : Response.json({ online: false });
  }) as typeof fetch);
  const running = client.sync();
  client.setEnabled(false);
  assert.deepEqual(calls, ["PUT"]);
  gate.resolve(Response.json({ online: true }));
  await running;
  assert.deepEqual(calls, ["PUT", "DELETE"]);
  assert.equal(states.at(-1).status, "hidden");
  assert.deepEqual(states.at(-1).peers, []);
  client.dispose();
});

test("an obsolete location heartbeat cannot fetch or publish old-location peers", async () => {
  const gate = deferred<Response>(),
    calls: { method: string; url: string; body?: any }[] = [];
  const { client, states } = harness((async (url, init) => {
    calls.push({
      method: init?.method || "GET",
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (calls.length === 1) return gate.promise;
    return init?.method === "PUT" ? Response.json({ online: true }) : nearby();
  }) as typeof fetch);
  const running = client.sync();
  client.setLocation(nextPoint);
  gate.resolve(Response.json({ online: true }));
  await running;
  assert.deepEqual(
    calls.map((call) => call.method),
    ["PUT", "PUT", "GET"],
  );
  assert.deepEqual(calls[1].body, nextPoint);
  assert.equal(
    new URL(calls[2].url, "https://local.test").searchParams.get("latitude"),
    String(nextPoint.latitude),
  );
  assert.equal(
    states.filter((snapshot) => snapshot.status === "online").length,
    1,
  );
  client.dispose();
});

test("location changes abort a stale read and preserve one request at a time", async () => {
  const read = deferred<Response>();
  let calls = 0,
    concurrent = 0,
    maximum = 0;
  const { client, states } = harness((async (_, init) => {
    concurrent++;
    maximum = Math.max(maximum, concurrent);
    const number = ++calls;
    try {
      if (number === 2) {
        init?.signal?.addEventListener(
          "abort",
          () => read.reject(new Error("aborted")),
          { once: true },
        );
        return await read.promise;
      }
      return init?.method === "PUT"
        ? Response.json({ online: true })
        : nearby();
    } finally {
      concurrent--;
    }
  }) as typeof fetch);
  const running = client.sync();
  await tick();
  assert.equal(calls, 2);
  client.setLocation(nextPoint);
  await running;
  assert.equal(calls, 4);
  assert.equal(maximum, 1);
  assert.equal(states.at(-1).status, "online");
  client.dispose();
});

test("failed polls retain only unexpired peers and the expiry tick removes stale online entries", async () => {
  let clock = time,
    fail = false;
  const { client, states } = harness(
    (async (_, init) =>
      fail
        ? Response.json({ error: "offline" }, { status: 503 })
        : init?.method === "PUT"
          ? Response.json({ online: true })
          : nearby()) as typeof fetch,
    () => clock,
  );
  await client.sync();
  fail = true;
  clock += 5000;
  await client.sync();
  assert.equal(states.at(-1).status, "reconnecting");
  assert.equal(states.at(-1).peers.length, 1);
  clock = time + PRESENCE_TTL_MS;
  client.expire();
  assert.equal(states.at(-1).peers.length, 0);
  client.dispose();
});

test("heartbeat and partially received response bodies cannot leave the poll pending forever", async () => {
  for (const stallBody of [false, true]) {
    let calls = 0;
    const { client, states } = harness(
      (async (_, init) => {
        calls++;
        if (!stallBody) return new Promise<Response>(() => {});
        if (init?.method === "PUT") return Response.json({ online: true });
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"players":'));
            },
          }),
        );
      }) as typeof fetch,
      () => time,
      15,
    );
    await client.sync();
    assert.equal(states.at(-1).status, "reconnecting");
    assert.equal(calls, stallBody ? 2 : 1);
    client.dispose();
  }
});

test("disposing an account cancels its request and ignores late completions", async () => {
  const gate = deferred<Response>();
  let signal: AbortSignal | null = null;
  const { client, states } = harness((async (_, init) => {
    signal = init!.signal as AbortSignal;
    return gate.promise;
  }) as typeof fetch);
  const running = client.sync();
  client.dispose();
  assert.equal((signal as unknown as AbortSignal).aborted, true);
  gate.resolve(Response.json({ online: true }));
  await running;
  assert.deepEqual(states, []);
  await client.sync();
  client.dispose();
});
