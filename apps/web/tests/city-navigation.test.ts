import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNavigationWorld,
  navigationPointIsClear,
  navigationSegmentIsClear,
  planWalkingPath,
  moveWithCollisions,
  updateFollowCamera,
  cameraCollisionPosition,
  findSafeWalkingPoint,
} from "../lib/city-navigation";

const building = (x0: number, z0: number, x1: number, z1: number) => ({
  id: `${x0}:${z0}:${x1}:${z1}`,
  height: 10,
  ring: [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ],
});

const routeClear = (world: any, start: any, route: any[]) => {
  let previous = start;
  for (const point of route) {
    assert.equal(navigationSegmentIsClear(world, previous, point), true);
    previous = point;
  }
};

test("footprint walls include shoulder clearance and preserve open courtyards", () => {
  const source = {
    ...building(-10, -10, 10, 10),
    holes: [building(-4, -4, 4, 4).ring],
  };
  const world = createNavigationWorld({ buildings: [source, source] });
  assert.equal(world.shapes.length, 1);
  assert.equal(navigationPointIsClear(world, { x: 0, z: 0 }), true);
  assert.equal(navigationPointIsClear(world, { x: 4.2, z: 0 }), false);
  assert.equal(navigationPointIsClear(world, { x: 7, z: 0 }), false);
  assert.equal(navigationPointIsClear(world, { x: 10.2, z: 0 }), false);
  assert.equal(navigationPointIsClear(world, { x: 10.7, z: 0 }), true);
  const trapped = planWalkingPath(
    world,
    { x: 0, z: 0 },
    { x: 13, z: 0 },
    { maxNodes: 3000 },
  );
  assert.deepEqual(trapped, []);
});

test("swept capsules cannot tunnel through thin walls and slide along the facade", () => {
  const world = createNavigationWorld({
    buildings: [building(0, -12, 0.08, 12)],
  });
  const start = { x: -5, y: 3, z: 0 },
    delta = { x: 40, z: 0 },
    output: any = {};
  const stopped = moveWithCollisions(world, start, delta, { output });
  assert.equal(stopped, output);
  assert.equal(stopped.blocked, true);
  assert.ok(stopped.x < -0.42 && stopped.x > -0.45);
  assert.equal(stopped.y, 3);
  assert.deepEqual(start, { x: -5, y: 3, z: 0 });
  assert.deepEqual(delta, { x: 40, z: 0 });
  const sliding = moveWithCollisions(world, start, { x: 10, z: 7 });
  assert.ok(sliding.x <= -0.42 && sliding.z > 6.9);
  assert.equal(navigationPointIsClear(world, sliding), true);
});

test("furniture, tree trunks, nearby people and other players block motion but self and other floors do not", () => {
  const world = createNavigationWorld({
    trees: [{ x: 0, z: 4, radius: 0.25 }],
    reservations: [{ x: 0, z: 0, radius: 1.1 }],
  });
  assert.equal(navigationPointIsClear(world, { x: 0, z: 0 }), false);
  assert.equal(navigationPointIsClear(world, { x: 0, z: 4.4 }), false);
  const peers = [{ id: "other", position: { x: 5, y: 0, z: 0 }, radius: 0.42 }];
  const result = moveWithCollisions(
    world,
    { x: 3, y: 0, z: 0 },
    { x: 5, z: 0 },
    { dynamic: peers },
  );
  assert.ok(result.x < 4.16 && result.x > 4.1);
  const ignored = moveWithCollisions(
    world,
    { x: 3, z: 0 },
    { x: 5, z: 0 },
    { dynamic: peers, ignoreId: "other" },
  );
  assert.equal(ignored.x, 8);
  const above = moveWithCollisions(
    world,
    { x: 3, y: 5, z: 0 },
    { x: 5, z: 0 },
    { dynamic: peers },
  );
  assert.equal(above.x, 8);
  const escape = moveWithCollisions(
    world,
    { x: 4.7, y: 0, z: 0 },
    { x: -1, z: 0 },
    { dynamic: peers },
  );
  assert.equal(
    escape.x,
    3.7,
    "a peer arriving too close does not trap the player",
  );
});

test("click paths go around walls and seats and reject occupied destinations", () => {
  const world = createNavigationWorld({
    buildings: [building(-2, -4, 2, 4)],
    reservations: [{ x: -4, z: -5, radius: 0.8 }],
    trees: [{ x: 3, z: 4.7, radius: 0.35 }],
  });
  const start = { x: -7, z: 0 },
    goal = { x: 7, z: 0 };
  const route = planWalkingPath(world, start, goal);
  assert.ok(route.length >= 3);
  assert.deepEqual(route.at(-1), goal);
  assert.ok(route.some((point: any) => Math.abs(point.z) > 4.42));
  routeClear(world, start, route);
  assert.deepEqual(planWalkingPath(world, start, { x: 0, z: 0 }), []);
  const snap = findSafeWalkingPoint(world, { x: -4, z: -5 })!;
  assert.ok(snap && navigationPointIsClear(world, snap));
});

test("water blocks full shoulder width and mid-segment crossings while a mapped walking bridge remains usable", () => {
  const waterAt = (point: any) => point.x >= 0 && point.x <= 2;
  const dry = createNavigationWorld({ waterAt });
  const moved = moveWithCollisions(dry, { x: -5, z: 0 }, { x: 20, z: 0 });
  assert.ok(moved.x < -0.42 && moved.x > -0.45);
  assert.equal(
    navigationSegmentIsClear(dry, { x: -5, z: 0 }, { x: 5, z: 0 }),
    false,
  );
  const bridge = createNavigationWorld({
    waterAt,
    paths: [
      {
        id: "bridge",
        kind: "footway",
        bridge: true,
        width: 3,
        ps: [
          { x: -5, z: 0 },
          { x: 5, z: 0 },
        ],
      },
    ],
  });
  assert.equal(
    navigationSegmentIsClear(bridge, { x: -4, z: 0 }, { x: 4, z: 0 }),
    true,
  );
  assert.equal(navigationPointIsClear(bridge, { x: 1, z: 1.2 }), false);
  assert.equal(
    moveWithCollisions(bridge, { x: -4, z: 0 }, { x: 8, z: 0 }).x,
    4,
  );
});

test("mapped pavements guide walks rather than shortcutting a road, and route budgets fail safely", () => {
  const world = createNavigationWorld({
    paths: [
      {
        id: 1,
        kind: "residential",
        width: 8,
        ps: [
          { x: -30, z: 0 },
          { x: 30, z: 0 },
        ],
      },
    ],
  });
  const start = { x: -20, z: 4.5 },
    goal = { x: 20, z: 4.5 };
  const pavement = planWalkingPath(world, start, goal);
  assert.deepEqual(pavement, [goal]);
  routeClear(world, start, pavement);
  const blocked = createNavigationWorld({
    buildings: [building(-2, -20, 2, 20)],
  });
  assert.deepEqual(
    planWalkingPath(
      blocked,
      { x: -20, z: 0 },
      { x: 20, z: 0 },
      { maxNodes: 100 },
    ),
    [],
  );
  assert.deepEqual(planWalkingPath(world, start, { x: 800, z: 0 }), []);
});

test("bounded input and scratch reuse keep invalid movement finite", () => {
  const world = createNavigationWorld({ radius: 20 });
  const output: any = {};
  for (let i = 0; i < 20; i++) {
    const moved = moveWithCollisions(
      world,
      { x: 0, z: 0 },
      { x: 1e6, z: 0 },
      { output },
    );
    assert.equal(moved, output);
    assert.ok(moved.x <= 19.58);
    assert.ok(Number.isFinite(moved.x));
  }
  assert.equal(
    moveWithCollisions(world, { x: NaN, z: 0 }, { x: 0, z: 0 }).blocked,
    true,
  );
  assert.equal(
    moveWithCollisions(world, { x: 0, z: 0 }, { x: Infinity, z: 0 }).blocked,
    true,
  );
});

test("follow camera uses real player motion with smoothing and retains a chosen orbit", () => {
  const state: any = {},
    camera = { x: 10, y: 7, z: -8 },
    target = { x: 0, y: 1.2, z: 0 };
  assert.equal(
    updateFollowCamera(state, camera, target, { x: 0, y: 0, z: 0 }, 0.05),
    true,
  );
  const offset = {
    x: camera.x - target.x,
    y: camera.y - target.y,
    z: camera.z - target.z,
  };
  updateFollowCamera(state, camera, target, { x: 3, y: 0.5, z: 4 }, 0.05);
  assert.ok(target.x > 0 && target.x < 3 && target.z > 0 && target.z < 4);
  for (let i = 0; i < 60; i++)
    updateFollowCamera(state, camera, target, { x: 3, y: 0.5, z: 4 }, 0.05);
  assert.ok(Math.abs(target.x - 3) < 0.001 && Math.abs(target.z - 4) < 0.001);
  assert.ok(Math.abs(camera.x - target.x - offset.x) < 0.001);
  assert.ok(Math.abs(camera.y - target.y - offset.y) < 0.001);
  assert.ok(Math.abs(camera.z - target.z - offset.z) < 0.001);
  assert.equal(
    updateFollowCamera(state, camera, target, { x: NaN, y: 0, z: 0 }, 0.05),
    false,
  );
});

test("close orbit stops before facades, aerial shots clear roofs, and roof descents stop above the roof", () => {
  const world = createNavigationWorld({
    buildings: [building(0, -4, 4, 4)],
    elevationAt: () => 2,
  });
  const blocked = cameraCollisionPosition(
    world,
    { x: -4, y: 3.5, z: 0 },
    { x: 2, y: 7, z: 0 },
  );
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.x < -0.25);
  const aerial = { x: 2, y: 18, z: 0 };
  assert.deepEqual(
    cameraCollisionPosition(world, { x: -4, y: 18, z: 0 }, aerial),
    { ...aerial, blocked: false },
  );
  const roof = cameraCollisionPosition(
    world,
    { x: 2, y: 20, z: 0 },
    { x: 2, y: 5, z: 0 },
  );
  assert.equal(roof.blocked, true);
  assert.ok(roof.y > 12.25);
  const safe = { x: -4, y: 4, z: 12 };
  const output: any = {};
  assert.equal(
    cameraCollisionPosition(world, { x: -4, y: 3.5, z: 0 }, safe, { output }),
    output,
  );
  assert.equal(output.blocked, false);
});

test("hillside camera envelope uses every corner and repeated collision clamping does not creep into the avatar", () => {
  const ring = [
    [0, -4],
    [4, -4],
    [4, 4],
    [0, 4],
  ];
  for (const footprint of [ring, [...ring].reverse()]) {
    const world = createNavigationWorld({
      buildings: [{ id: "hill", height: 10, ring: footprint }],
      projectGeo: ([x, z]: number[]) => ({ x, z }),
      elevationAt: (point: any) => point.x * 2,
    });
    const target = { x: -4, y: 2, z: 0 };
    let shot: any = cameraCollisionPosition(world, target, {
      x: 2,
      y: 4,
      z: 0,
    });
    assert.equal(
      shot.blocked,
      true,
      "the downhill wall cannot vanish when the first vertex is uphill",
    );
    const expected = { ...shot };
    for (let frame = 0; frame < 180; frame++)
      shot = cameraCollisionPosition(world, target, shot);
    assert.ok(
      Math.abs(shot.x - expected.x) < 1e-6 &&
        Math.abs(shot.y - expected.y) < 1e-6,
    );
    const upper = cameraCollisionPosition(
      world,
      { x: -4, y: 15, z: 0 },
      { x: 2, y: 15, z: 0 },
    );
    assert.equal(
      upper.blocked,
      true,
      "the uphill facade extends to highest ground plus mapped height",
    );
    const above = { x: 2, y: 24, z: 0 };
    assert.deepEqual(
      cameraCollisionPosition(world, { x: -4, y: 24, z: 0 }, above),
      { ...above, blocked: false },
    );
  }
});

test("multipart map relations keep distinct footprint wings while duplicate ring winding is ignored", () => {
  const wing = building(10, -3, 14, 3);
  const other = { ...building(-14, -3, -10, 3), id: wing.id };
  const duplicate = { ...wing, ring: [...wing.ring].reverse() };
  const world = createNavigationWorld({ buildings: [wing, other, duplicate] });
  assert.equal(world.shapes.length, 2);
  assert.equal(navigationPointIsClear(world, { x: 12, z: 0 }), false);
  assert.equal(navigationPointIsClear(world, { x: -12, z: 0 }), false);
  assert.equal(navigationPointIsClear(world, { x: 0, z: 0 }), true);
  assert.ok(
    moveWithCollisions(world, { x: -20, z: 0 }, { x: 12, z: 0 }).x < -14.42,
  );
});
