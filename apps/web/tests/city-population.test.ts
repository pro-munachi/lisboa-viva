import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseWalkingRoutes,
  createLocalWalkerProfiles,
  advanceLocalWalker,
  sampleLocalWalker,
} from "../lib/city-population.js";

const project = (point: number[]) => ({ x: point[0], z: point[1] });
const target = { x: 500, z: 0 };
const longStreet = {
  id: 10,
  owner: "detail",
  kind: "residential",
  width: 10,
  length: 1000,
  ps: [
    { x: 0, y: 0, z: 0 },
    { x: 1000, y: 0, z: 0 },
  ],
  lengths: [0, 1000],
};
const rightSideBuilding = {
  id: 20,
  ring: [
    [420, 4],
    [580, 4],
    [580, 20],
    [420, 20],
    [420, 4],
  ],
};
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test("residents start near the camera on a long way whose vertices are far away", () => {
  const farStreet = {
    ...longStreet,
    id: 11,
    ps: [
      { x: 0, y: 0, z: 500 },
      { x: 1000, y: 0, z: 500 },
    ],
  };
  const routes = chooseWalkingRoutes([farStreet, longStreet], target);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].line.id, 10);
  near(routes[0].nearestD, 500);
  assert.ok(routes[0].minD > 400 && routes[0].maxD < 600);

  const residents = createLocalWalkerProfiles({
    paths: [farStreet, longStreet],
    target,
    projectGeo: project,
  });
  assert.ok(residents.length >= 6);
  for (const resident of residents) {
    const p = sampleLocalWalker(resident);
    assert.ok(Math.hypot(p.x - target.x, p.z - target.z) <= 110);
    assert.equal(resident.line.id, 10);
  }
});

test("overview and detail copies of the same OSM way produce one detailed route", () => {
  const overview = { ...longStreet, owner: "overview" };
  for (const paths of [
    [overview, longStreet],
    [longStreet, overview],
  ]) {
    const routes = chooseWalkingRoutes(paths, target);
    assert.equal(routes.length, 1);
    assert.equal(routes[0].line, longStreet);
  }
});

test("residents choose the opposite sidewalk when a mapped building blocks one side", () => {
  const residents = createLocalWalkerProfiles({
    paths: [longStreet],
    target,
    projectGeo: project,
    buildings: [rightSideBuilding],
  });
  assert.ok(residents.length >= 6);
  for (const resident of residents) {
    assert.ok(resident.side < 0);
    for (let step = 0; step < 180; step++) {
      advanceLocalWalker(resident, 0.75);
      const p = sampleLocalWalker(resident);
      assert.ok(p.z < 0, "Resident must stay on the unobstructed sidewalk");
      assert.ok(resident.d >= resident.minD && resident.d <= resident.maxD);
    }
  }
});

test("an entirely obstructed mapped path is omitted instead of spawning people inside it", () => {
  const path = { ...longStreet, kind: "footway", width: 2 };
  const building = {
    id: 21,
    ring: [
      [400, -10],
      [600, -10],
      [600, 10],
      [400, 10],
      [400, -10],
    ],
  };
  const residents = createLocalWalkerProfiles({
    paths: [path],
    target,
    projectGeo: project,
    buildings: [building],
  });
  assert.deepEqual(residents, []);
});

test("walking turns around within its local section and faces the return direction", () => {
  const resident = {
    line: longStreet,
    d: 58,
    minD: 40,
    maxD: 60,
    side: -5.5,
    direction: 1,
    speed: 2,
  };
  const before = sampleLocalWalker(resident);
  advanceLocalWalker(resident, 2);
  const after = sampleLocalWalker(resident);
  near(resident.d, 58);
  assert.equal(resident.direction, -1);
  near(after.angle - before.angle, Math.PI);
  near(after.x, 58);
  near(after.z, -5.5);

  // A suspended tab or time jump must not send residents down the full kilometre.
  for (const dt of [20, 59, 1000, 1e7]) {
    advanceLocalWalker(resident, dt);
    assert.ok(resident.d >= 40 && resident.d <= 60);
    const p = sampleLocalWalker(resident);
    assert.ok(p.x >= 40 && p.x <= 60);
    assert.ok(Number.isFinite(p.angle));
  }
});

test("paused and invalid elapsed times preserve a resident's position and heading", () => {
  const resident = {
    line: longStreet,
    d: 51,
    minD: 40,
    maxD: 60,
    side: -5.5,
    direction: -1,
    speed: 1.2,
  };
  const original = { ...resident };
  const pose = sampleLocalWalker(resident);
  for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    advanceLocalWalker(resident, dt);
    assert.deepEqual(resident, original);
    assert.deepEqual(sampleLocalWalker(resident), pose);
  }
});

test("population is bounded, spaced across streets, and excludes motorways", () => {
  const streets = [0, 9, 18, 27].map((z, i) => ({
    ...longStreet,
    id: 40 + i,
    ps: [
      { x: 0, y: 0, z },
      { x: 1000, y: 0, z },
    ],
  }));
  const residents = createLocalWalkerProfiles({
    paths: streets,
    target,
    projectGeo: project,
    max: 100,
  });
  assert.ok(residents.length >= 24 && residents.length <= 32);
  assert.ok(new Set(residents.map((person) => person.line.id)).size >= 3);
  for (let i = 0; i < residents.length; i++) {
    const a = sampleLocalWalker(residents[i]);
    for (let j = 0; j < i; j++) {
      const b = sampleLocalWalker(residents[j]);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 3.6);
    }
    assert.equal(residents[i].simulated, true);
  }
  assert.deepEqual(
    chooseWalkingRoutes([{ ...longStreet, kind: "motorway" }], target),
    [],
  );
  assert.deepEqual(
    createLocalWalkerProfiles({
      paths: streets,
      target,
      projectGeo: project,
      max: 0,
    }),
    [],
  );
});
