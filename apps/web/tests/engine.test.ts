import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  newTrip,
  restore,
  serialize,
  availableScenarios,
  blocked,
  memories,
  itinerary,
  type Command,
  type Setup,
  type Trip,
} from "../lib/engine";
import {
  places,
  scenarios,
  transport,
  routeFor,
  CONTENT_VERSION,
} from "../lib/content";
const setup: Setup = {
  days: 3,
  budget: 300,
  style: "Culture seeker",
  base: "Graça",
  shirt: "#ece7df",
};
const trip = () => newTrip(setup, "test-trip");
let key = 0;
function act(t: Trip, action: Record<string, unknown>): Trip {
  const result = apply(t, {
    ...action,
    key: String(++key),
    revision: t.revision,
  } as Command);
  assert.equal(result.error, undefined);
  return result.trip;
}
function travel(t: Trip, place: string) {
  return act(t, {
    kind: "travel",
    place,
    mode: t.place === "sintra" || place === "sintra" ? "train" : "tram",
  });
}
test("catalog has 45 distinct scenarios, valid choices and cultural sources", () => {
  assert.equal(scenarios.length, 45);
  assert.equal(new Set(scenarios.map((s) => s.id)).size, 45);
  const ids = scenarios.flatMap((s) => s.choices.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const s of scenarios) {
    assert.ok(Object.hasOwn(places, s.place));
    assert.ok(s.choices.length >= 2 && s.choices.length <= 4);
    for (const c of s.choices) {
      assert.ok(c.cost >= 0 && Number.isInteger(c.cost));
      assert.ok(c.minutes > 0 && Number.isInteger(c.minutes));
    }
  }
  for (const p of Object.values(places)) {
    assert.match(p.source, /^https:\/\/www.visitlisboa.com\//);
    assert.ok(p.map.length);
  }
  for (const place of ["cais", "benfica", "sintra"] as const) {
    const chapter = scenarios.filter((s) => s.place === place);
    assert.equal(chapter.length, 5, place);
    assert.ok(
      chapter.some((s) => s.stage === "morning"),
      place,
    );
    assert.ok(
      chapter.some((s) => s.stage === "afternoon"),
      place,
    );
    assert.ok(
      chapter.some((s) => s.stage === "evening"),
      place,
    );
    assert.ok(
      chapter.some((s) => s.choices.some((c) => c.cost === 0 && c.energy >= 0)),
      `${place}: free recovery`,
    );
  }
});
test("choice is charged once, rejects double-taps with different keys and stale revisions", () => {
  const t = trip(),
    cmd: Command = {
      kind: "choice",
      choiceId: "first-morning-0",
      key: "same",
      revision: 0,
    };
  const next = apply(t, cmd).trip;
  assert.equal(next.spent, 4);
  assert.equal(next.minute, 570);
  assert.equal(next.energy, 97);
  assert.equal(apply(next, cmd).trip, next);
  assert.ok(apply(next, { ...cmd, key: "second" }).error);
  assert.ok(apply(next, { ...cmd, key: "third", revision: 1 }).error);
});
test("every destination changes the scene state and charges travel once", () => {
  let t = trip();
  for (const place of Object.keys(places).filter((p) => p !== "home")) {
    t = travel(t, place);
    assert.equal(t.place, place);
  }
  assert.equal(t.spent, 27);
  assert.equal(t.minute, 780);
  assert.ok(
    apply(t, {
      kind: "travel",
      place: t.place,
      mode: "train",
      revision: t.revision,
      key: "stay",
    }).error,
  );
});
test("Sintra uses an intercity route; a tram cannot mutate either leg of the trip", () => {
  for (const [from, to] of [
    ["cais", "sintra"],
    ["sintra", "benfica"],
  ] as const) {
    const t = { ...trip(), place: from };
    const rejected = apply(t, {
      kind: "travel",
      place: to,
      mode: "tram",
      key: `${from}-tram`,
      revision: 0,
    });
    assert.match(rejected.error || "", /route is not available/);
    assert.equal(rejected.trip, t);
    const cmd: Command = {
      kind: "travel",
      place: to,
      mode: "train",
      key: `${from}-train`,
      revision: 0,
    };
    const arrived = apply(t, cmd).trip;
    assert.equal(arrived.place, to);
    assert.equal(arrived.spent, 6);
    assert.equal(arrived.minute, 605);
    assert.equal(arrived.energy, 83);
    assert.match(arrived.history[0].title, /^Train to /);
    assert.equal(apply(arrived, cmd).trip, arrived);
  }
});
test("long walks and cycle trips to Sintra respect energy and the end of the day", () => {
  const t = trip();
  const walk = apply(t, {
    kind: "travel",
    place: "sintra",
    mode: "walk",
    key: "long-walk",
    revision: 0,
  });
  assert.equal(walk.error, undefined);
  assert.equal(walk.trip.minute, 870);
  assert.equal(walk.trip.energy, 5);
  assert.equal(walk.trip.spent, 0);
  const returnWalk = apply(walk.trip, {
    kind: "travel",
    place: "cais",
    mode: "walk",
    key: "return-walk",
    revision: 1,
  });
  assert.match(returnWalk.error || "", /restore your energy/);
  assert.equal(returnWalk.trip, walk.trip);
  const late = { ...t, minute: 1200 };
  const cycle = apply(late, {
    kind: "travel",
    place: "sintra",
    mode: "cycle",
    key: "late-cycle",
    revision: 0,
  });
  assert.match(cycle.error || "", /before 22:00/);
  assert.equal(cycle.trip, late);
  const tired = { ...t, energy: 49 };
  assert.ok(
    apply(tired, {
      kind: "travel",
      place: "sintra",
      mode: "cycle",
      key: "tired-cycle",
      revision: 0,
    }).error,
  );
  assert.equal(routeFor("cais", "benfica", "walk")?.cost, 0);
});
test("Cais, Benfica and Sintra experiences survive save replay and appear in the itinerary", () => {
  const chapters = [
    { place: "cais", choice: "station-story-0", district: "Cais do Sodré" },
    { place: "benfica", choice: "benfica-stories-1", district: "Benfica" },
    { place: "sintra", choice: "sintra-village-1", district: "Sintra" },
  ] as const;
  let t = trip();
  for (const chapter of chapters) {
    t = travel(t, chapter.place);
    t = act(t, { kind: "choice", choiceId: chapter.choice });
    assert.equal(t.history.at(-1)?.place, chapter.place);
    assert.deepEqual(restore(serialize(t)), t);
    assert.match(itinerary(t), new RegExp(chapter.district));
  }
  assert.equal(memories(t).length, 3);
  assert.match(itinerary(t), /All costs\/times illustrative/);
  assert.match(itinerary(t), /Nothing booked or confirmed/);
});
test("over-budget and insufficient-energy choices cannot mutate state", () => {
  let t = newTrip({ ...setup, budget: 30 }, "tight");
  t = travel(t, "music");
  while (t.minute < 1080) t = act(t, { kind: "rest" });
  const result = apply(t, {
    kind: "choice",
    choiceId: "dinner-music-0",
    key: "expensive",
    revision: t.revision,
  });
  assert.ok(result.error);
  assert.equal(result.trip, t);
  assert.equal(
    blocked({ ...t, energy: 0 }, transport.walk),
    "Rest first to restore your energy",
  );
  assert.equal(
    blocked({ ...t, minute: 1310 }, transport.tram),
    "Not enough time before 22:00",
  );
});
test("scenarios are gated by time, place and unique experience", () => {
  let t = trip();
  assert.ok(!availableScenarios(t).some((s) => s.id === "wind-down"));
  assert.ok(
    apply(t, {
      kind: "choice",
      choiceId: "tile-workshop-0",
      key: "wrong-place",
      revision: 0,
    }).error,
  );
  t = travel(t, "exchange");
  t = act(t, { kind: "choice", choiceId: "tile-workshop-0" });
  assert.ok(!availableScenarios(t).some((s) => s.id === "tile-workshop"));
  assert.equal(memories(t).length, 1);
});
test("day boundaries and 3/5-day completion are deterministic without timer overlaps", () => {
  for (const days of [3, 5] as const) {
    let t = newTrip({ ...setup, days }, "days");
    for (let i = 1; i <= days; i++) {
      assert.equal(t.day, i);
      t = act(t, { kind: "rest" });
      t = act(t, { kind: "night" });
      assert.equal(t.energy, 85);
    }
    assert.equal(t.complete, true);
    assert.equal(t.day, days);
    assert.equal(t.minute, 1320);
    assert.ok(
      apply(t, { kind: "rest", key: "after", revision: t.revision }).error,
    );
  }
});
test("save replays the ledger; malformed, forged and incompatible saves are rejected", () => {
  let t = trip();
  t = act(t, { kind: "choice", choiceId: "first-morning-0" });
  t = travel(t, "exchange");
  t = act(t, { kind: "choice", choiceId: "tile-workshop-0" });
  assert.deepEqual(restore(serialize(t)), t);
  assert.equal(restore("{bad"), null);
  const saved = JSON.parse(serialize(t));
  saved.spent = -999;
  assert.deepEqual(restore(JSON.stringify(saved)), t);
  saved.commands[0].choiceId = "fake";
  assert.equal(restore(JSON.stringify(saved)), null);
  assert.equal(
    restore(JSON.stringify({ version: "old", setup, id: "old", commands: [] })),
    null,
  );
  assert.equal(
    restore(
      JSON.stringify({
        version: CONTENT_VERSION,
        setup: { ...setup, budget: -1 },
        id: "bad",
        commands: [],
      }),
    ),
    null,
  );
});
test("zero-energy, zero-budget reachable states still offer rest or overnight", () => {
  let t = trip();
  for (let i = 0; i < 150 && !t.complete; i++) {
    const candidates = availableScenarios(t)
      .flatMap((s) => s.choices)
      .filter((c) => !blocked(t, c));
    if (candidates.length && i % 3) {
      t = act(t, { kind: "choice", choiceId: candidates[0].id });
    } else if (!blocked(t, { cost: 0, minutes: 30, energy: 20 }) && i % 4) {
      t = act(t, { kind: "rest" });
    } else t = act(t, { kind: "night" });
    assert.ok(t.spent <= t.setup.budget && t.spent >= 0);
    assert.ok(t.energy >= 0 && t.energy <= 100);
    assert.ok(t.minute <= 1320);
  }
  assert.equal(t.complete, true);
});
test("itinerary derives only from confirmed actions; restarting preserves prior run", () => {
  const old = act(trip(), { kind: "choice", choiceId: "first-morning-0" });
  const next = newTrip(setup, "new");
  assert.equal(next.history.length, 0);
  assert.equal(old.history.length, 1);
  const output = itinerary(old);
  assert.match(output, /Make a simple breakfast/);
  assert.doesNotMatch(output, /Paint an azulejo/);
  assert.match(output, /Nothing booked or confirmed/);
  assert.match(output, /Fictional venue/);
});
test("unknown travel modes, prototype keys and stale commands are rejected", () => {
  const t = trip();
  for (const action of [
    { kind: "travel", place: "__proto__", mode: "walk" },
    { kind: "travel", place: "cafe", mode: "constructor" },
    { kind: "unknown" },
  ])
    assert.ok(
      apply(t, { ...action, key: "bad", revision: 0 } as Command).error,
    );
});

test("idempotency keys cannot be reused for a different payload", () => {
  const cmd: Command = {
    kind: "choice",
    choiceId: "first-morning-0",
    key: "unique",
    revision: 0,
  };
  const t = apply(trip(), cmd).trip;
  assert.ok(apply(t, { ...cmd, choiceId: "first-morning-1" }).error);
  assert.equal(apply(t, cmd).trip, t);
});

test("every authored scenario is reachable and both options can complete", () => {
  for (const s of scenarios) {
    for (const c of s.choices) {
      let t = trip();
      if (s.place !== "home") t = travel(t, s.place);
      const target =
        s.stage === "afternoon" ? 720 : s.stage === "evening" ? 1080 : t.minute;
      while (t.minute < target) t = act(t, { kind: "rest" });
      assert.ok(
        availableScenarios(t).some((a) => a.id === s.id),
        s.id,
      );
      t = act(t, { kind: "choice", choiceId: c.id });
      assert.equal(t.history.at(-1)?.title, c.title);
      assert.ok(t.minute <= 1320);
    }
  }
});
