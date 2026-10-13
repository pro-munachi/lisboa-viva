import assert from "node:assert/strict";
import { test } from "node:test";
import { newTrip, type Entry, type Trip } from "../lib/engine";
import { playerStory } from "../lib/player-story";
import { TRAVELLER_COLOURS } from "../lib/traveller-colours";

function start(arrival: "airport" | "home") {
  return newTrip(
    {
      days: 3,
      budget: 300,
      style: "Culture seeker",
      base: "Graça",
      shirt: TRAVELLER_COLOURS[0].value,
      arrival,
    },
    `story-${arrival}`,
  );
}

function choice(place: Entry["place"]): Entry {
  return {
    command: {
      kind: "choice",
      choiceId: `choice-${place}`,
      key: place,
      revision: 0,
    },
    place,
  } as Entry;
}

test("a tourist follows arrival while a local starts at the first memory", () => {
  const tourist = playerStory(start("airport"), "tourist", true);
  assert.equal(tourist.action, "journey");
  assert.equal(tourist.activeIndex, 0);
  const local = playerStory(start("home"), "local", true);
  assert.equal(local.action, "experiences");
  assert.equal(local.activeIndex, 1);
  assert.equal(local.steps[0].complete, true);
});

test("confirmed choices in two places advance the same chapter without a social requirement", () => {
  const home = start("home");
  const first: Trip = { ...home, history: [choice("home")] };
  assert.equal(playerStory(first, "local", true).action, "travel");
  const away: Trip = { ...first, place: "cafe" };
  assert.equal(playerStory(away, "local", true).action, "experiences");
  const second: Trip = {
    ...away,
    history: [...first.history, choice("cafe")],
  };
  const story = playerStory(second, "local", false);
  assert.equal(story.action, "finish");
  assert.deepEqual(
    story.steps.map((step) => step.complete),
    [true, true, true, false],
  );
  assert.equal(
    playerStory({ ...second, complete: true }, "local", false).action,
    "recap",
  );
});

test("the guide sends players elsewhere when no experience is available", () => {
  assert.equal(playerStory(null, "tourist", false).action, "setup");
  assert.equal(playerStory(start("home"), "local", false).action, "travel");
});
