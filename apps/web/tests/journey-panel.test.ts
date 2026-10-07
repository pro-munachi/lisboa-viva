import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { apply, newTrip, type Trip } from "../lib/engine";
import {
  JOURNEY_PEOPLE,
  peopleAtHub,
  type Arrival,
  type JourneyAction,
  type Persona,
} from "../lib/journey";

// The Node renderer does not load CSS modules. Keep this stub local to import.
const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
const JourneyPanel = require("../components/JourneyPanel")
  .default as typeof import("../components/JourneyPanel").default;
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

function start(arrival: Arrival = "airport", persona: Persona = "tourist") {
  return newTrip(
    {
      days: 3,
      budget: 300,
      style: "Culture seeker",
      base: "Graça",
      shirt: "#ece7df",
      arrival,
      persona,
    },
    `panel-${arrival}-${persona}`,
  );
}
function render(trip: Trip) {
  return renderToStaticMarkup(
    createElement(JourneyPanel, {
      trip,
      onCommand: () => {
        throw new Error("Rendering must never consume an encounter");
      },
      onEnterHub: () => {
        throw new Error("Rendering must never transfer to a hub");
      },
    }),
  );
}
function escaped(text: string) {
  return renderToStaticMarkup(createElement(Fragment, null, text));
}
function act(trip: Trip, action: JourneyAction) {
  const result = apply(trip, {
    kind: "journey",
    key: `panel-${trip.revision}`,
    revision: trip.revision,
    ...action,
  });
  assert.equal(result.error, undefined);
  return result.trip;
}

test("encounter rendering stays at the active hub and never reveals unearned replies", () => {
  for (const arrival of ["airport", "station", "bus-stop"] as const) {
    const trip = start(arrival);
    const people = peopleAtHub(trip.journey.hub);
    const html = render(trip);
    for (const person of people) {
      assert.ok(html.includes(escaped(person.name)));
      assert.ok(!html.includes(escaped(person.responses.tourist)));
    }
    for (const person of JOURNEY_PEOPLE.filter(
      (person) => person.hub !== trip.journey.hub,
    ))
      assert.ok(!html.includes(escaped(person.name)));
    assert.ok(html.includes(escaped(people[0].greeting)));
    assert.ok(html.includes("Choose a character"));
    assert.ok(html.includes("Chat · 6 min"));
    assert.ok(html.includes("Fictional characters"));
    assert.deepEqual(trip.journey.talked, []);
    assert.equal(trip.history.length, 0);
  }
});

test("a recorded six-minute encounter reveals the correct persona reply and cannot be repeated", () => {
  for (const arrival of ["airport", "station", "bus-stop"] as const) {
    for (const persona of ["tourist", "nomad", "expat"] as const) {
      const before = start(arrival, persona);
      const person = peopleAtHub(before.journey.hub)[0];
      const trip = act(before, { action: "talk", personId: person.id });
      const html = render(trip);
      assert.equal(trip.minute, before.minute + 6);
      assert.deepEqual(trip.journey.talked, [person.id]);
      assert.ok(html.includes(escaped(person.responses[persona])));
      const recordedButton = html.match(
        /<button[^>]*aria-label="Conversation with [^"]+ recorded"[^>]*>/,
      )?.[0];
      assert.ok(recordedButton?.includes("disabled"));
      assert.ok(!html.includes("Chat · 6 min"));
      const repeated = apply(trip, {
        kind: "journey",
        action: "talk",
        personId: person.id,
        key: "repeat-conversation",
        revision: trip.revision,
      });
      assert.ok(repeated.error);
      assert.equal(repeated.trip, trip);
    }
  }
});

test("insufficient time disables the chat with the engine reason while keeping the greeting", () => {
  const trip = { ...start(), minute: 1317 };
  const person = peopleAtHub(trip.journey.hub)[0];
  const html = render(trip);
  const chatButton = html.match(
    /<button[^>]*aria-label="Chat with [^"]+ simulated minutes"[^>]*>/,
  )?.[0];
  assert.ok(chatButton?.includes("disabled"));
  assert.ok(chatButton?.includes("aria-describedby"));
  assert.ok(html.includes("Not enough time before 22:00"));
  assert.ok(html.includes(escaped(person.greeting)));
  assert.ok(!html.includes(escaped(person.responses.tourist)));
});

test("hub encounters disappear after boarding instead of following the traveller around the city", () => {
  let trip = start("station");
  trip = act(trip, { action: "book", routeId: "rossio-city" });
  trip = act(trip, { action: "board" });
  const html = render(trip);
  assert.equal(trip.journey.hub, null);
  assert.ok(!html.includes("Choose a character"));
  assert.ok(!html.includes("Chat ·"));
});
