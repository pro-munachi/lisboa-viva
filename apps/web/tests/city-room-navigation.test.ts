import { test } from "node:test";
import assert from "node:assert/strict";
import { findRoomRoute } from "../lib/city-room-navigation.js";

type Point = { x: number; z: number };
const room = { bounds: [0, 0, 10, 10], clearance: 0.3, cellSize: 0.4 };

function crossings(route: Point[], x: number) {
  const heights: number[] = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i];
    if (Math.min(a.x, b.x) <= x && Math.max(a.x, b.x) >= x && a.x !== b.x) {
      heights.push(a.z + ((x - a.x) / (b.x - a.x)) * (b.z - a.z));
    }
  }
  return heights;
}

test("a clear room gives a direct route and a stationary avatar stays in place", () => {
  const start = { x: 1, z: 1 },
    target = { x: 9, z: 8 };
  const route = findRoomRoute(start, target, room);
  assert.deepEqual(route, [start, target]);
  assert.notEqual(route[0], start);
  assert.notEqual(route[1], target);
  assert.deepEqual(findRoomRoute(start, start, room), [start]);
});

test("walking to the far side of a table takes a padded detour", () => {
  const start = { x: 1, z: 5 },
    target = { x: 9, z: 5 };
  const route = findRoomRoute(start, target, {
    ...room,
    obstacles: [{ minX: 4, minZ: 3, maxX: 6, maxZ: 7 }],
  });
  assert.ok(route.length >= 4);
  assert.deepEqual(route[0], start);
  assert.deepEqual(route.at(-1), target);
  const middle = crossings(route, 5);
  assert.ok(middle.length > 0);
  assert.ok(
    middle.every((z) => z < 2.7 || z > 7.3),
    "the route crosses outside the table and avatar radius",
  );
  assert.ok(
    route.every((p) => p.x >= 0.3 && p.x <= 9.7 && p.z >= 0.3 && p.z <= 9.7),
  );
});

test("route smoothing cannot cut through alternating furniture barriers", () => {
  const route = findRoomRoute(
    { x: 1, z: 5 },
    { x: 9, z: 5 },
    {
      ...room,
      obstacles: [
        { minX: 3, minZ: 0, maxX: 4, maxZ: 7 },
        { minX: 6, minZ: 3, maxX: 7, maxZ: 10 },
      ],
    },
  );
  assert.ok(route.length >= 4);
  assert.ok(crossings(route, 3.5).every((z) => z > 7.3));
  assert.ok(crossings(route, 6.5).every((z) => z < 2.7));
});

test("a thin prop between grid nodes still blocks the complete walking segment", () => {
  const route = findRoomRoute(
    { x: 1, z: 5 },
    { x: 9, z: 5 },
    {
      ...room,
      clearance: 0,
      obstacles: [{ minX: 4.99, minZ: 4.5, maxX: 5.01, maxZ: 5.5 }],
    },
  );
  const middle = crossings(route, 5);
  assert.ok(route.length > 2 && middle.length > 0);
  assert.ok(middle.every((z) => z < 4.5 || z > 5.5));
});

test("occupied starts/goals and wall-adjacent targets fail without teleporting", () => {
  const blocked = {
    ...room,
    obstacles: [{ minX: 4, minZ: 4, maxX: 6, maxZ: 6 }],
  };
  const start = { x: 1, z: 1 };
  for (const target of [
    { x: 5, z: 5 },
    { x: 3.8, z: 5 },
    { x: 0.2, z: 5 },
    { x: 11, z: 5 },
  ]) {
    assert.deepEqual(findRoomRoute(start, target, blocked), []);
  }
  assert.deepEqual(findRoomRoute({ x: 5, z: 5 }, start, blocked), []);
  assert.deepEqual(start, { x: 1, z: 1 });
});

test("a complete divider and touching diagonal corners remain unreachable", () => {
  assert.deepEqual(
    findRoomRoute(
      { x: 1, z: 5 },
      { x: 9, z: 5 },
      {
        ...room,
        obstacles: [{ minX: 4.5, minZ: 0, maxX: 5.5, maxZ: 10 }],
      },
    ),
    [],
  );
  assert.deepEqual(
    findRoomRoute(
      { x: 1, z: 1 },
      { x: 3, z: 3 },
      {
        bounds: [0, 0, 4, 4],
        clearance: 0,
        cellSize: 0.5,
        obstacles: [
          { minX: 0, minZ: 2, maxX: 2, maxZ: 4 },
          { minX: 2, minZ: 0, maxX: 4, maxZ: 2 },
        ],
      },
    ),
    [],
  );
});

test("avatar clearance closes a passage narrower than its diameter", () => {
  const settings = {
    bounds: [0, 0, 4, 4],
    cellSize: 0.1,
    obstacles: [
      { minX: 1.7, minZ: 0, maxX: 2.3, maxZ: 1.8 },
      { minX: 1.7, minZ: 2.2, maxX: 2.3, maxZ: 4 },
    ],
  };
  const start = { x: 1, z: 2 },
    target = { x: 3, z: 2 };
  assert.deepEqual(
    findRoomRoute(start, target, { ...settings, clearance: 0.1 }),
    [start, target],
  );
  assert.deepEqual(
    findRoomRoute(start, target, { ...settings, clearance: 0.25 }),
    [],
  );
});

test("malformed rooms, coordinates and excessive search grids are bounded failures", () => {
  const start = { x: 1, z: 1 },
    target = { x: 9, z: 9 };
  for (const bounds of [
    [0, 0, 0, 10],
    [10, 0, 0, 10],
    [0, 0, NaN, 10],
    [0, 0, 10],
  ]) {
    assert.deepEqual(findRoomRoute(start, target, { ...room, bounds }), []);
  }
  for (const cellSize of [0, -1, NaN, Infinity]) {
    assert.deepEqual(findRoomRoute(start, target, { ...room, cellSize }), []);
  }
  assert.deepEqual(
    findRoomRoute(start, target, { ...room, clearance: -1 }),
    [],
  );
  assert.deepEqual(findRoomRoute({ x: Infinity, z: 1 }, target, room), []);
  assert.deepEqual(
    findRoomRoute(start, target, {
      ...room,
      obstacles: [{ minX: 5, minZ: 5, maxX: 4, maxZ: 6 }],
    }),
    [],
  );
  assert.deepEqual(
    findRoomRoute(start, target, {
      ...room,
      cellSize: 0.001,
      obstacles: [{ minX: 4, minZ: 4, maxX: 6, maxZ: 6 }],
    }),
    [],
  );
});
