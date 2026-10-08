import test from "node:test";
import assert from "node:assert/strict";
import {
  areaTransport,
  distanceMetres,
  WALKABLE_METRES,
} from "../lib/area-transport";

test("walkable range uses real map distance and longer areas require a fare", () => {
  const graca = { lat: 38.7166, lng: -9.13 };
  const baixa = { lat: 38.7119, lng: -9.1374 };
  const belem = { lat: 38.6954, lng: -9.2073 };
  assert.ok(distanceMetres(graca, baixa) < WALKABLE_METRES);
  assert.ok(distanceMetres(graca, belem) > WALKABLE_METRES);
  assert.equal(distanceMetres(graca, graca), 0);
  assert.ok(areaTransport.every((option) => option.costCents > 0));
});
