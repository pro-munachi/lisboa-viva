import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLocalTraffic } from "../lib/city-traffic.js";

const street = {
  id: 1,
  kind: "residential",
  width: 8,
  owner: "detail",
  length: 1000,
  lengths: [0, 1000],
  ps: [
    { x: 0, z: 0 },
    { x: 1000, z: 0 },
  ],
};
test("street traffic finds the closest section of a long mapped road and both driving lanes", () => {
  const actors = chooseLocalTraffic([street], { x: 500, z: 0 });
  assert.ok(actors.length >= 6);
  assert.ok(actors.some((a) => a.side > 0) && actors.some((a) => a.side < 0));
  for (const a of actors) {
    const d = a.d > street.length ? street.length * 2 - a.d : a.d;
    assert.ok(Math.abs(d - 500) <= 78);
    assert.ok(Math.abs(a.side) + 0.875 < street.width / 2);
  }
});
test("cars never populate beaches, pedestrian routes, tracks, cycleways or narrow streets", () => {
  const paths = [
    "footway",
    "pedestrian",
    "path",
    "steps",
    "cycleway",
    "rail",
    "tram",
  ].map((kind, i) => ({ ...street, id: i, kind }));
  paths.push({ ...street, id: 99, width: 2.5 });
  assert.deepEqual(chooseLocalTraffic(paths, { x: 500, z: 0 }), []);
});
test("duplicated overview roads do not duplicate actors and crowd caps remain deterministic", () => {
  const overview = { ...street, owner: "overview" };
  const once = chooseLocalTraffic([street], { x: 500, z: 0 }, { max: 6 });
  const twice = chooseLocalTraffic(
    [overview, street],
    { x: 500, z: 0 },
    { max: 6 },
  );
  assert.deepEqual(twice, once);
  assert.equal(twice.length, 6);
  assert.ok(twice.every((a) => a.line === street));
  assert.deepEqual(chooseLocalTraffic([street], { x: NaN, z: 0 }), []);
  assert.deepEqual(chooseLocalTraffic([street], { x: 500, z: 500 }), []);
});
