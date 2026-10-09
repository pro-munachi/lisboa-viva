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
  assert.equal(routes.length, 2);
  assert.ok(routes.some((route) => route.side < 0));
  assert.ok(routes.some((route) => route.side > 0));
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

test("overview and detail copies produce one pair of detailed pavements", () => {
  const overview = { ...longStreet, owner: "overview" };
  for (const paths of [
    [overview, longStreet],
    [longStreet, overview],
  ]) {
    const routes = chooseWalkingRoutes(paths, target);
    assert.equal(routes.length, 2);
    assert.ok(routes.every((route) => route.line === longStreet));
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
  assert.equal(residents.length, 72);
  assert.ok(new Set(residents.map((person) => person.line.id)).size >= 3);
  for (let i = 0; i < residents.length; i++) {
    const a = sampleLocalWalker(residents[i]);
    for (let j = 0; j < i; j++) {
      const b = sampleLocalWalker(residents[j]);
      const sameGroup =
        residents[i].groupId && residents[i].groupId === residents[j].groupId;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= (sameGroup ? 1.3 : 2.2));
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

test("eight CSV categories are deterministically represented on broad pedestrian streets", () => {
  const plaza = { ...longStreet, kind: "pedestrian", width: 6 };
  const options = { paths: [plaza], target, projectGeo: project, max: 28 };
  const first = createLocalWalkerProfiles(options),
    second = createLocalWalkerProfiles(options);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((person) => person.categoryId)).size, 8);
  assert.ok(first.length <= 28);
  for (const person of first) {
    assert.equal(person.simulated, true);
    assert.match(person.label, /^Simulated/);
    assert.ok(person.speed >= 0.6 && person.speed <= 1.4);
    assert.equal(typeof person.character.bodyType, "string");
    if (person.role === "solo-man")
      assert.equal(person.character.bodyType, "male");
    if (person.role === "solo-woman")
      assert.equal(person.character.bodyType, "female");
  }
});

test("family members reflect and pause together with safe shared formation margins", () => {
  const plaza = { ...longStreet, kind: "pedestrian", width: 6 };
  const people = createLocalWalkerProfiles({
    paths: [plaza],
    target,
    projectGeo: project,
  });
  const firstFamily = people.find((person) => person.categoryId === "DEMO_003");
  assert.ok(firstFamily);
  const family = people.filter(
    (person) => person.groupId === firstFamily.groupId,
  );
  assert.equal(family.length, 3);
  assert.deepEqual(
    family.map((person) => person.groupRole),
    ["stroller-caregiver", "caregiver", "child"],
  );
  assert.equal(family[2].ageBand, "child");
  const offsets = family.map((person) => person.d - family[0].d);
  for (const dt of [0.1, 3, 26, 4, 99, 1e6]) {
    for (const person of family) advanceLocalWalker(person, dt);
    assert.equal(new Set(family.map((person) => person.direction)).size, 1);
    assert.equal(new Set(family.map((person) => person.moving)).size, 1);
    for (let i = 0; i < family.length; i++) {
      near(family[i].d - family[0].d, offsets[i]);
      assert.ok(family[i].d >= family[i].minD && family[i].d <= family[i].maxD);
      assert.ok(
        sampleLocalWalker(family[i]).x > 438 &&
          sampleLocalWalker(family[i]).x < 562,
      );
    }
  }
});

test("children stay accompanied and strollers skip narrow, steep or stepped paths", () => {
  for (const plaza of [
    { ...longStreet, kind: "steps", width: 6 },
    { ...longStreet, kind: "footway", width: 1.8 },
    {
      ...longStreet,
      kind: "footway",
      width: 5,
      ps: [
        { x: 0, y: 0, z: 0 },
        { x: 1000, y: 250, z: 0 },
      ],
    },
  ]) {
    const people = createLocalWalkerProfiles({
      paths: [plaza],
      target,
      projectGeo: project,
    });
    assert.ok(
      people.every(
        (person) => person.prop !== "stroller" && person.ageBand !== "child",
      ),
    );
  }
  const people = createLocalWalkerProfiles({
    paths: [longStreet],
    target,
    projectGeo: project,
  });
  assert.ok(
    people.every((person) => !["child", "teen"].includes(person.ageBand)),
  );
});

test("park contexts use mapped polygons and café furniture reservations remain clear throughout walks", () => {
  const plaza = { ...longStreet, kind: "pedestrian", width: 6 };
  const park = {
    kind: "park",
    ring: [
      [420, -15],
      [580, -15],
      [580, 15],
      [420, 15],
      [420, -15],
    ],
  };
  const reservation = { x: 500, z: 0, radius: 6 };
  const people = createLocalWalkerProfiles({
    paths: [plaza],
    target,
    projectGeo: project,
    surfaces: [park],
    reservations: [reservation],
  });
  assert.ok(people.length > 0);
  assert.ok(people.every((person) => person.context === "park"));
  for (const person of people) {
    for (let i = 0; i < 400; i++) {
      advanceLocalWalker(person, 0.5);
      const p = sampleLocalWalker(person);
      const padding = person.groupId ? 1.3 : 0.42;
      assert.ok(
        Math.hypot(p.x - reservation.x, p.z - reservation.z) >
          reservation.radius + padding,
      );
    }
  }
});

test("authored pauses integrate elapsed time independently of animation frame size", () => {
  const plaza = { ...longStreet, kind: "pedestrian", width: 6 };
  const original = createLocalWalkerProfiles({
    paths: [plaza],
    target,
    projectGeo: project,
  })[0];
  const coarse = { ...original },
    fine = { ...original };
  advanceLocalWalker(coarse, 120);
  for (let i = 0; i < 1200; i++) advanceLocalWalker(fine, 0.1);
  near(coarse.d, fine.d);
  assert.equal(coarse.direction, fine.direction);
  assert.equal(coarse.moving, fine.moving);
});

test("busy populations fill both safe pavements near the destination under desktop and mobile budgets", () => {
  const streets = Array.from({ length: 8 }, (_, i) => ({
    ...longStreet,
    id: 60 + i,
    width: 7,
    ps: [
      { x: 0, y: 0, z: (i - 4) * 17 },
      { x: 1000, y: 0, z: (i - 4) * 17 },
    ],
  }));
  for (const max of [48, 64, 500]) {
    const people = createLocalWalkerProfiles({ paths: streets, target, max });
    assert.equal(people.length, Math.min(max, 72));
    const nearPeople = people.filter((person) => {
      const point = sampleLocalWalker(person);
      return Math.hypot(point.x - target.x, point.z - target.z) < 60;
    });
    assert.ok(
      nearPeople.length >= people.length * 0.7,
      "density is concentrated in the visible neighbourhood",
    );
    assert.ok(people.some((person) => person.side < 0));
    assert.ok(people.some((person) => person.side > 0));
    assert.ok(
      new Set(people.map((person) => person.id)).size === people.length,
    );
    assert.ok(new Set(people.map((person) => person.pause.walk)).size > 3);
    assert.ok(
      new Set(people.map((person) => person.speed.toFixed(2))).size > 8,
    );
    assert.deepEqual(
      people,
      createLocalWalkerProfiles({ paths: streets, target, max }),
    );
  }
});

test("obstacles split usable pedestrian activity to both sides without passing through furniture", () => {
  const path = { ...longStreet, kind: "footway", width: 2 };
  const furniture = { x: 500, z: 0, radius: 8 };
  const people = createLocalWalkerProfiles({
    paths: [path],
    target,
    max: 48,
    reservations: [furniture],
  });
  assert.ok(people.some((person) => sampleLocalWalker(person).x < 490));
  assert.ok(people.some((person) => sampleLocalWalker(person).x > 510));
  for (const person of people) {
    for (let step = 0; step < 300; step++) {
      advanceLocalWalker(person, 0.7);
      const point = sampleLocalWalker(person);
      assert.ok(
        Math.hypot(point.x - furniture.x, point.z) > furniture.radius + 0.42,
      );
    }
  }
});

test("water and explicit single-side pavement tags cannot place walkers on an unavailable edge", () => {
  const dry = createLocalWalkerProfiles({
    paths: [longStreet],
    target,
    waterAt: (point) => point.z > 0,
  });
  assert.ok(dry.length > 0);
  assert.ok(dry.every((person) => sampleLocalWalker(person).z < 0));
  for (const [sidewalk, sign] of [
    ["left", 1],
    ["right", -1],
  ] as const) {
    const people = createLocalWalkerProfiles({
      paths: [{ ...longStreet, sidewalk }],
      target,
    });
    assert.ok(people.length > 0);
    assert.ok(people.every((person) => Math.sign(person.side) === sign));
  }
});

test("accompanied families keep each route's own dry-land boundary through pauses and reversals", () => {
  // The second path has water on the opposite end. Reusing the first path's
  // water closure for the cached stroller clearance would reject its family
  // section or allow family members beyond the second path's dry boundary.
  const paths = [910, 911].map((id, i) => ({
    ...longStreet,
    id,
    kind: "pedestrian",
    width: 6,
    ps: [
      { x: 0, y: 0, z: i * 22 },
      { x: 1000, y: 0, z: i * 22 },
    ],
  }));
  const waterAt = (point: { x: number }, line: { id: number }) =>
    line.id === 910 ? point.x > 520 : point.x < 480;
  const people = createLocalWalkerProfiles({ paths, target, max: 64, waterAt });
  const family = people.filter((person) => person.categoryId === "DEMO_003");
  assert.equal(family.length, 3);
  assert.ok(family.every((person) => person.line.id === 911));
  assert.equal(family.filter((person) => person.ageBand === "child").length, 1);
  for (const dt of [0.25, 12, 41, 132, 1e6]) {
    for (const person of people) {
      advanceLocalWalker(person, dt);
      assert.equal(waterAt(sampleLocalWalker(person), person.line), false);
      assert.ok(person.d >= person.minD && person.d <= person.maxD);
    }
    assert.equal(new Set(family.map((person) => person.direction)).size, 1);
    assert.equal(new Set(family.map((person) => person.moving)).size, 1);
  }
});

test("companions keep one shared route, pause and heading through turns and large elapsed times", () => {
  const streets = [0, 17, 34, -17].map((z, i) => ({
    ...longStreet,
    id: 80 + i,
    ps: [
      { x: 0, y: 0, z },
      { x: 1000, y: 0, z },
    ],
  }));
  const people = createLocalWalkerProfiles({
    paths: streets,
    target,
    max: 64,
    context: "market",
  });
  const first = people.find((person) => person.groupSize === 2);
  assert.ok(first);
  const pair = people.filter((person) => person.groupId === first.groupId);
  assert.equal(pair.length, 2);
  const gap = pair[1].d - pair[0].d;
  for (const dt of [0.1, 3, 21, 8, 94, 1e6]) {
    for (const person of pair) advanceLocalWalker(person, dt);
    near(pair[1].d - pair[0].d, gap);
    assert.equal(pair[0].direction, pair[1].direction);
    assert.equal(pair[0].moving, pair[1].moving);
    assert.equal(pair[0].line, pair[1].line);
    assert.equal(pair[0].side, pair[1].side);
  }
  const out = { x: 0, y: 0, z: 0, angle: 0, distance: 0 };
  assert.equal(
    sampleLocalWalker(pair[0], out),
    out,
    "the animation loop can reuse its sample object",
  );
  assert.deepEqual(out, sampleLocalWalker(pair[0]));
});
