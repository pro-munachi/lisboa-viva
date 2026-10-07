import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  availableScenarios,
  euro,
  itinerary,
  newTrip,
  previewJourney,
  restore,
  serialize,
  tripDateDuration,
  validSetup,
  type Command,
  type Setup,
  type Trip,
} from "../lib/engine";
import {
  CARD_COST,
  JOURNEY_HUBS,
  JOURNEY_PEOPLE,
  JOURNEY_PERSONAS,
  JOURNEY_ROUTES,
  initialJourney,
  journeyFor,
  profileMissions,
  type Arrival,
  type JourneyAction,
} from "../lib/journey";
import { GEO_BOUNDS, containsGeo } from "../lib/geography";
import { CONTENT_VERSION, places } from "../lib/content";

const setup: Setup = {
  days: 3,
  budget: 300,
  style: "Culture seeker",
  base: "Graça",
  shirt: "#ece7df",
};
function arrivalTrip(arrival: Arrival = "airport") {
  return newTrip(
    { ...setup, persona: "tourist", arrival },
    `arrive-${arrival}`,
  );
}
function command<A extends JourneyAction>(
  trip: Trip,
  action: A,
  key = `journey-${trip.revision}`,
): { kind: "journey"; key: string; revision: number } & A {
  return { kind: "journey", ...action, key, revision: trip.revision } as {
    kind: "journey";
    key: string;
    revision: number;
  } & A;
}
function act(trip: Trip, action: JourneyAction): Trip {
  const result = apply(trip, command(trip, action));
  assert.equal(result.error, undefined);
  return result.trip;
}
function ordinary(trip: Trip, payload: Record<string, unknown>) {
  return apply(trip, {
    ...payload,
    key: `ordinary-${trip.revision}`,
    revision: trip.revision,
  } as Command);
}
function arrive(trip: Trip, routeId = "airport-metro"): Trip {
  const route = JOURNEY_ROUTES.find((route) => route.id === routeId)!;
  if (route.requiresCard && !trip.journey.card)
    trip = act(trip, { action: "get-card" });
  trip = act(trip, { action: "book", routeId });
  return act(trip, { action: "board" });
}

test("legacy setups retain city play while new arrivals start at their own mapped hub", () => {
  const legacy = newTrip(setup, "legacy");
  assert.deepEqual(legacy.setup, setup);
  assert.deepEqual(legacy.journey, initialJourney());
  assert.ok(availableScenarios(legacy).length);
  for (const [arrival, hub] of [
    ["airport", "airport"],
    ["station", "rossio"],
    ["bus-stop", "cais-bus"],
  ] as const) {
    const trip = arrivalTrip(arrival);
    assert.equal(trip.journey.phase, "arriving");
    assert.equal(trip.journey.hub, hub);
    assert.equal(trip.journey.card, false);
    assert.equal(trip.journey.ticket, null);
    assert.deepEqual(availableScenarios(trip), []);
    assert.deepEqual(restore(serialize(trip)), trip);
  }
  assert.deepEqual(journeyFor({}), initialJourney());
});

test("arrival cannot teleport into city experiences, another hub or an overnight", () => {
  const trip = arrivalTrip();
  for (const payload of [
    { kind: "choice", choiceId: "first-morning-0" },
    { kind: "travel", place: "cafe", mode: "walk" },
    { kind: "night" },
    { kind: "journey", action: "visit-hub", hub: "rossio" },
    { kind: "journey", action: "book", routeId: "airport-flight" },
  ]) {
    const result = ordinary(trip, payload);
    assert.match(result.error || "", /arrival hub|Continue into Lisbon/);
    assert.equal(result.trip, trip);
  }
  assert.equal(ordinary(trip, { kind: "rest" }).error, undefined);
  assert.equal(ordinary(trip, { kind: "finish" }).trip.complete, true);
});

test("card purchase, booking and boarding spend and move exactly once with payload conflicts rejected", () => {
  let trip = arrivalTrip();
  const card = command(trip, { action: "get-card" }, "card");
  trip = apply(trip, card).trip;
  assert.equal(trip.spent, CARD_COST);
  assert.equal(trip.minute, 543);
  assert.equal(apply(trip, card).trip, trip);
  assert.ok(apply(trip, { ...card, action: "board" }).error);
  assert.ok(previewJourney(trip, { action: "get-card" }).reason);
  const book = command(
    trip,
    { action: "book", routeId: "airport-metro" },
    "ticket",
  );
  const booked = apply(trip, book).trip;
  assert.equal(booked.spent, CARD_COST + 2);
  assert.equal(booked.place, "home");
  assert.equal(booked.minute, 546);
  assert.deepEqual(booked.journey.ticket, { routeId: "airport-metro" });
  assert.equal(apply(booked, book).trip, booked);
  assert.ok(apply(booked, { ...book, routeId: "airport-bus" }).error);
  assert.ok(apply(booked, { ...book, key: "stale" }).error);
  assert.match(
    previewJourney(booked, { action: "book", routeId: "airport-bus" }).reason ||
      "",
    /ready ticket/,
  );
  const board = command(booked, { action: "board" }, "board");
  const boarded = apply(booked, board).trip;
  assert.equal(boarded.spent, booked.spent);
  assert.equal(boarded.minute, 576);
  assert.equal(boarded.energy, 82);
  assert.equal(boarded.place, "cafe");
  assert.equal(boarded.journey.phase, "city");
  assert.equal(boarded.journey.hub, null);
  assert.equal(boarded.journey.ticket, null);
  assert.equal(apply(boarded, board).trip, boarded);
  assert.match(
    previewJourney(boarded, { action: "board" }).reason || "",
    /before boarding/,
  );
  assert.equal(boarded.history.at(-1)?.cost, 0);
  assert.deepEqual(restore(serialize(boarded)), boarded);
});

test("shared previews keep blocked fares visible and leave every nested state unchanged", () => {
  const trip = arrivalTrip();
  const before = JSON.stringify(trip);
  const preview = previewJourney(trip, {
    action: "book",
    routeId: "airport-metro",
  });
  assert.equal(preview.cost, 2);
  assert.equal(preview.minutes, 3);
  assert.match(preview.reason || "", /card first/);
  assert.equal(
    apply(trip, command(trip, { action: "book", routeId: "airport-metro" }))
      .error,
    preview.reason,
  );
  preview.journey.talked.push("changed-preview");
  assert.equal(JSON.stringify(trip), before);
  assert.equal(euro(0.5), "€0.5");
  assert.equal(euro(300), "€300");
});

test("the train and bus journeys enforce departure hub/card while free walking continuations unlock city play", () => {
  for (const [arrival, routeId, place] of [
    ["station", "rossio-sintra", "sintra"],
    ["bus-stop", "cais-benfica", "benfica"],
    ["airport", "airport-bus", "cais"],
  ] as const) {
    const trip = arrivalTrip(arrival);
    assert.match(
      previewJourney(trip, { action: "book", routeId }).reason || "",
      /card/,
    );
    const result = arrive(trip, routeId);
    assert.equal(result.place, place);
    assert.equal(result.journey.phase, "city");
    assert.ok(availableScenarios(result).length);
  }
  for (const [arrival, routeId, place] of [
    ["station", "rossio-city", "cafe"],
    ["bus-stop", "cais-city", "cais"],
  ] as const) {
    const result = arrive(arrivalTrip(arrival), routeId);
    assert.equal(result.place, place);
    assert.equal(result.spent, 0);
    assert.equal(result.journey.card, false);
  }
  const wrong = arrivalTrip("station");
  assert.match(
    previewJourney(wrong, { action: "book", routeId: "airport-metro" })
      .reason || "",
    /departure hub/,
  );
  const forged = {
    ...wrong,
    journey: {
      ...wrong.journey,
      card: true,
      ticket: { routeId: "airport-metro" },
    },
  };
  assert.match(
    previewJourney(forged, { action: "board" }).reason || "",
    /another departure hub/,
  );
});

test("booking checks the complete journey against budget, time and energy before charging", () => {
  const trip = act(arrivalTrip(), { action: "get-card" });
  const states = [
    { ...trip, spent: 299 },
    { ...trip, minute: 1290 },
    { ...trip, energy: 2 },
  ];
  for (const state of states) {
    const result = apply(
      state,
      command(state, { action: "book", routeId: "airport-metro" }),
    );
    assert.ok(result.error);
    assert.equal(result.trip, state);
    assert.equal(result.trip.journey.ticket, null);
  }
  const booked = act(trip, { action: "book", routeId: "airport-metro" });
  const late = { ...booked, minute: 1300 };
  const denied = apply(late, command(late, { action: "board" }));
  assert.match(denied.error || "", /before 22:00/);
  assert.equal(denied.trip, late);
  assert.deepEqual(denied.trip.journey.ticket, { routeId: "airport-metro" });
  assert.equal(denied.trip.spent, booked.spent);
});

test("a ready paid ticket locks every other clock-changing action until boarding or an explicit finish", () => {
  const trip = { ...act(arrivalTrip(), { action: "get-card" }), minute: 1287 };
  const booked = act(trip, { action: "book", routeId: "airport-metro" });
  assert.equal(booked.minute, 1290);
  assert.equal(previewJourney(booked, { action: "board" }).reason, null);
  for (const payload of [
    { kind: "rest" },
    { kind: "night" },
    { kind: "choice", choiceId: "first-morning-0" },
    { kind: "travel", place: "cafe", mode: "walk" },
    { kind: "journey", action: "talk", personId: "airport-ines" },
    { kind: "journey", action: "get-card" },
    { kind: "journey", action: "visit-hub", hub: "rossio" },
    { kind: "journey", action: "book", routeId: "airport-bus" },
  ]) {
    const result = ordinary(booked, payload);
    assert.equal(result.error, "Board your ready ticket before continuing.");
    assert.equal(result.trip, booked);
    assert.equal(previewJourney(result.trip, { action: "board" }).reason, null);
    if (payload.kind === "journey")
      assert.equal(
        previewJourney(booked, payload as JourneyAction).reason,
        result.error,
      );
  }
  assert.equal(
    previewJourney(booked, { action: "book", routeId: "airport-bus" }).cost,
    3,
  );
  assert.equal(previewJourney(booked, { action: "get-card" }).cost, CARD_COST);
  const boarded = act(booked, { action: "board" });
  assert.equal(boarded.minute, 1320);
  assert.equal(boarded.spent, booked.spent);
  const finished = ordinary(booked, { kind: "finish" }).trip;
  assert.equal(finished.complete, true);
  assert.equal(finished.minute, booked.minute);
  assert.equal(finished.spent, booked.spent);
  assert.deepEqual(finished.journey.ticket, booked.journey.ticket);
});

test("city hub visits have deterministic scene costs and cannot discard a pending ticket", () => {
  let trip = arrive(arrivalTrip("station"), "rossio-city");
  const preview = previewJourney(trip, {
    action: "visit-hub",
    hub: "cais-bus",
  });
  const visited = act(trip, { action: "visit-hub", hub: "cais-bus" });
  assert.equal(visited.minute, trip.minute + preview.minutes);
  assert.equal(visited.energy, trip.energy + preview.energy);
  assert.equal(visited.journey.phase, "city");
  assert.equal(visited.journey.hub, "cais-bus");
  assert.deepEqual(availableScenarios(visited), []);
  trip = act(act(visited, { action: "get-card" }), {
    action: "book",
    routeId: "cais-benfica",
  });
  for (const payload of [
    { kind: "journey", action: "visit-hub", hub: "airport" },
    { kind: "travel", place: "music", mode: "walk" },
    { kind: "night" },
  ])
    assert.equal(ordinary(trip, payload).trip, trip);
  const unbooked = ordinary(visited, {
    kind: "travel",
    place: "music",
    mode: "walk",
  }).trip;
  assert.equal(unbooked.journey.hub, null);
  assert.equal(unbooked.place, "music");
});

test("local and traveller dialogues are finite, persona-specific and cannot be rewarded twice", () => {
  const replies = new Set<string>();
  for (const persona of ["tourist", "nomad", "expat"] as const) {
    const trip = newTrip({ ...setup, persona, arrival: "airport" }, persona);
    const cmd = command(
      trip,
      { action: "talk", personId: "airport-ines" },
      "hello",
    );
    const chatted = apply(trip, cmd).trip;
    replies.add(chatted.history.at(-1)!.outcome);
    assert.equal(chatted.connection, trip.connection + 6);
    assert.equal(chatted.minute, trip.minute + 6);
    assert.equal(chatted.spent, 0);
    assert.deepEqual(chatted.journey.talked, ["airport-ines"]);
    assert.equal(apply(chatted, cmd).trip, chatted);
    assert.ok(apply(chatted, { ...cmd, personId: "airport-mika" }).error);
    assert.ok(
      apply(
        chatted,
        command(chatted, { action: "talk", personId: "airport-ines" }),
      ).error,
    );
    assert.match(
      previewJourney(trip, { action: "talk", personId: "rossio-aya" }).reason ||
        "",
      /their transport hub/,
    );
    assert.deepEqual(restore(serialize(chatted)), chatted);
  }
  assert.equal(replies.size, 3);
  assert.equal(
    JOURNEY_PEOPLE.filter((person) => person.role === "local").length,
    3,
  );
  assert.equal(
    JOURNEY_PEOPLE.filter((person) => person.role === "traveller").length,
    3,
  );
});

test("simulated departure is paid once, ends the trip only on boarding, and is explicit in the itinerary", () => {
  const city = arrive(arrivalTrip("station"), "rossio-city");
  const airport = act(city, { action: "visit-hub", hub: "airport" });
  const book = command(
    airport,
    { action: "book", routeId: "airport-flight" },
    "flight",
  );
  const ticket = apply(airport, book).trip;
  assert.equal(ticket.spent, airport.spent + 90);
  assert.equal(ticket.complete, false);
  assert.equal(ticket.journey.phase, "city");
  assert.equal(ticket.journey.card, false);
  assert.equal(apply(ticket, book).trip, ticket);
  assert.match(
    itinerary(ticket),
    /Simulated departure flight charges are included/,
  );
  assert.match(itinerary(ticket), /€90.*game budget/);
  assert.doesNotMatch(itinerary(ticket), /Flights and accommodation excluded/);
  const board = command(ticket, { action: "board" }, "gate");
  const departed = apply(ticket, board).trip;
  assert.equal(departed.complete, true);
  assert.equal(departed.journey.phase, "departed");
  assert.equal(departed.journey.hub, null);
  assert.equal(departed.spent, ticket.spent);
  assert.equal(departed.minute, ticket.minute + 90);
  assert.equal(apply(departed, board).trip, departed);
  assert.deepEqual(restore(serialize(departed)), departed);
  assert.match(itinerary(departed), /Nothing booked or confirmed/);
  assert.match(itinerary(departed), /no real flight/i);
});

test("save replay derives journey state and rejects forged commands and invalid profile fields", () => {
  const trip = arrive(arrivalTrip());
  const saved = JSON.parse(serialize(trip));
  saved.journey = {
    phase: "departed",
    card: false,
    ticket: { routeId: "fake" },
  };
  saved.spent = -100;
  assert.deepEqual(restore(JSON.stringify(saved)), trip);
  saved.commands[1].routeId = "fake";
  assert.equal(restore(JSON.stringify(saved)), null);
  const old = newTrip(setup, "old-format");
  const oldSave = { version: CONTENT_VERSION, id: old.id, setup, commands: [] };
  assert.deepEqual(restore(JSON.stringify(oldSave)), old);
  for (const payload of [
    { action: "visit-hub", hub: "__proto__" },
    { action: "visit-hub", hub: "constructor" },
    { action: "book", routeId: "__proto__" },
    { action: "talk", personId: "__proto__" },
    { action: "fake" },
  ])
    assert.ok(apply(trip, command(trip, payload as JourneyAction)).error);
});

test("extended onboarding validates paired dates, calendar duration, interests and accommodation without mutating input", () => {
  const profile: Setup = {
    ...setup,
    days: 4,
    persona: "nomad",
    arrival: "station",
    interests: ["food", "community"],
    accommodation: "coliving",
    startDate: "2026-10-24",
    endDate: "2026-10-28",
    shirt: "#456a86",
  };
  assert.equal(validSetup(profile), true);
  assert.equal(
    tripDateDuration(profile.startDate!, profile.endDate!),
    4,
    "DST boundary uses UTC calendar days",
  );
  const trip = newTrip(profile, "profile");
  profile.interests!.push("culture");
  assert.deepEqual(trip.setup.interests, ["food", "community"]);
  assert.deepEqual(restore(serialize(trip)), trip);
  for (const invalid of [
    { days: 0 },
    { days: 31 },
    { days: 2.5 },
    { persona: "fake" },
    { arrival: "fake" },
    { interests: ["food", "food"] },
    { interests: ["fake"] },
    { interests: null },
    { accommodation: "fake" },
    { startDate: "2026-02-30", endDate: "2026-03-04" },
    { startDate: "2026-10-24", endDate: undefined },
    { startDate: "2026-10-24", endDate: "2026-10-24" },
    { startDate: "2026-10-24", endDate: "2026-10-23" },
    { startDate: "2026-10-24", endDate: "2026-10-27" },
  ])
    assert.equal(
      validSetup({ ...profile, ...invalid } as Setup),
      false,
      JSON.stringify(invalid),
    );
  assert.equal(tripDateDuration("2024-02-28", "2024-03-01"), 2);
  assert.equal(tripDateDuration("2026-02-28", "2026-03-01"), 1);
  assert.equal(tripDateDuration("2026-2-28", "2026-03-01"), null);
  assert.equal(tripDateDuration("2026-01-01", "2026-02-01"), null);
  for (const days of [1, 30]) {
    let t = newTrip({ ...setup, days }, `days-${days}`);
    for (let day = 1; day <= days; day++)
      t = ordinary(t, { kind: "night" }).trip;
    assert.equal(t.complete, true);
    assert.equal(t.day, days);
    assert.deepEqual(restore(serialize(t)), t);
  }
});

test("hub anchors, bounded routes and profile suggestions reference real context and existing chapters", () => {
  for (const hub of Object.values(JOURNEY_HUBS)) {
    assert.ok(containsGeo(GEO_BOUNDS, [hub.lng, hub.lat]));
    assert.equal(hub.category, "transport");
    assert.match(hub.mapsUrl, /^https:\/\/www.google.com\/maps\/search/);
    assert.match(hub.sourceUrl, /^https:\/\//);
    assert.match(hub.coordinateSource, /^https:\/\//);
  }
  assert.equal(
    new Set(JOURNEY_ROUTES.map((route) => route.id)).size,
    JOURNEY_ROUTES.length,
  );
  assert.ok(JOURNEY_ROUTES.length < 12);
  for (const route of JOURNEY_ROUTES) {
    assert.ok(Object.hasOwn(JOURNEY_HUBS, route.from));
    assert.ok(Object.hasOwn(places, route.toPlace));
    assert.match(route.name, /simulation/);
    assert.ok(route.cost >= 0 && route.minutes > 0 && route.energy <= 0);
  }
  for (const persona of ["tourist", "nomad", "expat"] as const) {
    assert.ok(JOURNEY_PERSONAS[persona].missions.length);
    assert.ok(
      profileMissions({ persona }).every((mission) =>
        Object.hasOwn(places, mission.place),
      ),
    );
  }
  const missions = profileMissions({
    persona: "expat",
    interests: ["nightlife", "wellness", "food", "community"],
  });
  assert.equal(missions[0].place, "music");
  assert.equal(missions[1].place, "riverside");
  assert.equal(missions.length, 4);
  assert.equal(
    new Set(missions.map((mission) => mission.place)).size,
    missions.length,
  );
});
