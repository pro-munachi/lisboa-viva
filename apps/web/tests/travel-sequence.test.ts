import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apply,
  newTrip,
  restore,
  serialize,
  type Command,
  type Trip,
} from "../lib/engine";
import { JOURNEY_HUBS, type Arrival } from "../lib/journey";
import { focusFor } from "../lib/world-state";
import { TRAVELLER_COLOURS } from "../lib/traveller-colours";
import {
  TravelCompletionGate,
  arrivalTravel,
  commandTravel,
  tripFocus,
  type TravelCompletion,
} from "../lib/travel-sequence";

function start(arrival: Arrival = "home") {
  return newTrip(
    {
      days: 3,
      budget: 400,
      style: "Culture seeker",
      base: "Alfama",
      shirt: TRAVELLER_COLOURS[0].value,
      arrival,
    },
    `trip-${arrival}`,
  );
}
function act(
  trip: Trip,
  action:
    | { action: "get-card" | "board" }
    | { action: "book"; routeId: string }
    | { action: "visit-hub"; hub: "airport" },
) {
  const command = {
    kind: "journey",
    ...action,
    key: `action-${trip.revision}`,
    revision: trip.revision,
  } as Command;
  const result = apply(trip, command);
  assert.equal(result.error, undefined);
  return { trip: result.trip, command };
}
function completion(trip: Trip, id = "new-sequence"): TravelCompletion {
  return {
    sequence: {
      id,
      mode: "train",
      from: tripFocus(trip),
      to: { ...focusFor("sintra") },
    },
    tripId: trip.id,
    revision: trip.revision,
    panel: null,
    outcome: "A simulated journey is complete.",
  };
}

test("new arrivals use the correct vehicle and mapped hub without inventing an outside origin", () => {
  for (const [arrival, mode, hubId] of [
    ["airport", "flight", "airport"],
    ["station", "train", "rossio"],
    ["bus-stop", "bus", "cais-bus"],
  ] as const) {
    const trip = start(arrival);
    const before = serialize(trip);
    const sequence = arrivalTravel(trip)!;
    assert.equal(sequence.mode, mode);
    assert.equal(sequence.arrival, true);
    assert.equal(sequence.to.lat, JOURNEY_HUBS[hubId].lat);
    assert.equal(sequence.to.lng, JOURNEY_HUBS[hubId].lng);
    assert.deepEqual(sequence.from, sequence.to);
    assert.notStrictEqual(sequence.from, sequence.to);
    assert.equal(
      serialize(trip),
      before,
      "camera derivation cannot apply bookkeeping",
    );
    assert.equal(trip.history.length, 0);
  }
  assert.equal(arrivalTravel(start("home")), null);
});

test("boarding resolves the previous ticket's mode after the engine clears it, preserving a once-only charge", () => {
  let trip = start("airport");
  trip = act(trip, { action: "get-card" }).trip;
  trip = act(trip, { action: "book", routeId: "airport-metro" }).trip;
  const before = trip;
  const boarded = act(before, { action: "board" });
  assert.equal(boarded.trip.journey.ticket, null);
  const sequence = commandTravel(before, boarded.trip, boarded.command)!;
  assert.equal(sequence.mode, "metro");
  assert.equal(sequence.from.lat, JOURNEY_HUBS.airport.lat);
  assert.deepEqual(sequence.to, focusFor("cafe", "Alfama"));
  assert.equal(
    boarded.trip.spent,
    before.spent,
    "boarding cannot charge the ticket twice",
  );
  assert.equal(boarded.trip.minute - before.minute, 30);
  const duplicate = apply(boarded.trip, boarded.command);
  assert.strictEqual(duplicate.trip, boarded.trip);
  assert.equal(
    commandTravel(boarded.trip, duplicate.trip, boarded.command),
    null,
  );
});

test("airport Uber and taxi can be booked without a transport card and reach the saved base", () => {
  for (const [routeId, fare] of [
    ["airport-uber", 18],
    ["airport-taxi", 20],
  ] as const) {
    const arrival = start("airport");
    assert.equal(arrival.journey.card, false);
    const booked = act(arrival, { action: "book", routeId }).trip;
    assert.equal(booked.journey.ticket?.routeId, routeId);
    assert.equal(booked.spent, fare);
    const boarded = act(booked, { action: "board" });
    assert.equal(boarded.trip.place, "home");
    assert.equal(boarded.trip.journey.phase, "city");
    assert.equal(boarded.trip.spent, fare);
    const sequence = commandTravel(booked, boarded.trip, boarded.command)!;
    assert.equal(sequence.mode, "taxi");
    assert.deepEqual(sequence.to, focusFor("home", "Alfama"));
  }
});

test("rail and bus boarding preserve their authored routes and real destination geography", () => {
  for (const [arrival, routeId, mode, place] of [
    ["station", "rossio-sintra", "train", "sintra"],
    ["bus-stop", "cais-benfica", "bus", "benfica"],
  ] as const) {
    let trip = start(arrival);
    trip = act(trip, { action: "get-card" }).trip;
    trip = act(trip, { action: "book", routeId }).trip;
    const boarded = act(trip, { action: "board" });
    const sequence = commandTravel(trip, boarded.trip, boarded.command)!;
    assert.equal(sequence.mode, mode);
    assert.deepEqual(sequence.to, focusFor(place, "Alfama"));
    assert.equal(sequence.departure, false);
  }
});

test("generic travel includes the selected mode and the actual home base", () => {
  for (const mode of ["walk", "cycle", "tram", "train"] as const) {
    const trip = start();
    const command: Command = {
      kind: "travel",
      key: `travel-${mode}`,
      revision: trip.revision,
      mode,
      place: "cafe",
    };
    const result = apply(trip, command);
    assert.equal(result.error, undefined);
    const sequence = commandTravel(trip, result.trip, command)!;
    assert.equal(sequence.mode, mode);
    assert.deepEqual(sequence.from, focusFor("home", "Alfama"));
    assert.deepEqual(sequence.to, focusFor("cafe", "Alfama"));
  }
});

test("blocked boarding and unrelated actions cannot begin a transport scene", () => {
  const trip = start("airport");
  const command: Command = {
    kind: "journey",
    action: "board",
    key: "no-ticket",
    revision: trip.revision,
  };
  const result = apply(trip, command);
  assert.ok(result.error);
  assert.equal(commandTravel(trip, result.trip, command), null);
  const card = act(trip, { action: "get-card" });
  assert.equal(commandTravel(trip, card.trip, card.command), null);
});

test("departure reveals an airport take-off rather than the ledger's home placeholder", () => {
  let trip = start();
  trip = act(trip, { action: "visit-hub", hub: "airport" }).trip;
  trip = act(trip, { action: "book", routeId: "airport-flight" }).trip;
  const before = trip;
  const boarded = act(trip, { action: "board" });
  const sequence = commandTravel(before, boarded.trip, boarded.command)!;
  assert.equal(sequence.mode, "flight");
  assert.equal(sequence.departure, true);
  assert.equal(boarded.trip.place, "home");
  assert.equal(boarded.trip.complete, true);
  assert.deepEqual(sequence.to, sequence.from);
  assert.equal(tripFocus(boarded.trip).lat, JOURNEY_HUBS.airport.lat);
  assert.equal(boarded.trip.spent, before.spent);
});

test("old, duplicate, replaced, cancelled and changed-trip completions cannot act", () => {
  const trip = start();
  const gate = new TravelCompletionGate();
  const first = completion(trip, "first");
  const next = completion(trip, "next");
  gate.start(first);
  gate.start(next);
  assert.equal(gate.take("first", trip), null);
  assert.equal(
    gate.take("next", { ...trip, id: "another-account-trip" }),
    null,
  );
  assert.equal(
    gate.take("next", { ...trip, revision: trip.revision + 1 }),
    null,
  );
  assert.strictEqual(gate.take("next", trip), next);
  assert.equal(gate.take("next", trip), null);
  gate.start(first);
  gate.cancel();
  assert.equal(gate.take("first", trip), null);
});

test("reloading committed travel restores bookkeeping without a pending or replayed sequence", () => {
  const trip = start();
  const command: Command = {
    kind: "travel",
    key: "persisted-travel",
    revision: trip.revision,
    mode: "train",
    place: "sintra",
  };
  const next = apply(trip, command).trip;
  const saved = serialize(next);
  const restored = restore(saved)!;
  assert.equal(restored.history.length, 1);
  assert.equal(restored.spent, next.spent);
  assert.equal(restored.minute, next.minute);
  const freshGate = new TravelCompletionGate();
  assert.equal(freshGate.pending, null);
  assert.equal(freshGate.take(command.key, restored), null);
  assert.equal(commandTravel(restored, restored, command), null);
  assert.ok(!saved.includes('"sequence"'));
});
