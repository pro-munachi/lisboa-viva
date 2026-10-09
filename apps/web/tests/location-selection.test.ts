import { test } from "node:test";
import assert from "node:assert/strict";
import { LocationSelectionGate } from "../lib/location-selection";

test("a slower previous camera arrival cannot reopen a superseded location", () => {
  const gate = new LocationSelectionGate();
  const cafe = gate.begin();
  const gym = gate.begin();
  assert.notEqual(cafe, gym);
  assert.equal(gate.complete(cafe), false);
  assert.equal(gate.complete(gym), true);
  assert.equal(gate.complete(gym), false);
});

test("opening another app flow or cancelling prevents a pending popup", () => {
  const gate = new LocationSelectionGate();
  const selection = gate.begin();
  gate.cancel();
  assert.equal(gate.complete(selection), false);
  const next = gate.begin();
  assert.equal(gate.complete(next), true);
});
