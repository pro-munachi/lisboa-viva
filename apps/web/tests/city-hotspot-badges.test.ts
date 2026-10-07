import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectBadgePosition,
  declutterBadgePositions,
} from "../lib/city-hotspot-badges.js";

const { PerspectiveCamera, Vector3 } = require("three");
const viewport = { width: 800, height: 600 };
const makeCamera = () => {
  const camera = new PerspectiveCamera(90, 4 / 3, 0.5, 50);
  camera.updateMatrixWorld();
  return camera;
};
const ids = (items: { id: string }[]) => items.map((item) => item.id);

test("world anchors project into CSS pixels with depth rather than world-sized controls", () => {
  const camera = makeCamera();
  const centre = projectBadgePosition(
    new Vector3(0, 0, -10),
    camera,
    viewport,
  )!;
  assert.equal(centre.x, 400);
  assert.equal(centre.y, 300);
  assert.equal(centre.depth, 10);
  const left = projectBadgePosition(
    new Vector3(-10, 0, -10),
    camera,
    viewport,
  )!;
  assert.ok(Math.abs(left.x - 100) < 0.0001);
  assert.equal(left.y, 300);
  camera.position.set(10, 3, 5);
  camera.lookAt(0, 3, 5);
  camera.updateMatrixWorld();
  const rotated = projectBadgePosition(new Vector3(0, 3, 5), camera, viewport)!;
  assert.ok(Math.abs(rotated.x - 400) < 0.0001);
  assert.ok(Math.abs(rotated.y - 300) < 0.0001);
  assert.ok(Math.abs(rotated.depth - 10) < 0.0001);
});

test("projection rejects anchors behind the camera, clipped by depth, outside the viewport or unable to fit the 44px target", () => {
  const camera = makeCamera();
  for (const point of [
    new Vector3(0, 0, 10),
    new Vector3(0, 0, 0),
    new Vector3(0, 0, -0.25),
    new Vector3(0, 0, -100),
    new Vector3(20, 0, -10),
    new Vector3(0, 20, -10),
    new Vector3(-13, 0, -10),
    new Vector3(NaN, 0, -10),
  ])
    assert.equal(projectBadgePosition(point, camera, viewport), null);
  assert.equal(
    projectBadgePosition(new Vector3(0, 0, -10), camera, {
      width: 43,
      height: 600,
    }),
    null,
  );
  assert.equal(
    projectBadgePosition(new Vector3(0, 0, -10), camera, {
      width: 800,
      height: Infinity,
    }),
    null,
  );
  camera.position.set(10, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  assert.equal(
    projectBadgePosition(new Vector3(12, 0, 0), camera, viewport),
    null,
  );
});

test("selected markers win overlaps and native keyboard focus stays visible ahead of selection", () => {
  const candidates = [
    { id: "near", x: 100, y: 100, depth: 1 },
    { id: "selected", x: 110, y: 105, depth: 20 },
    { id: "focused", x: 115, y: 110, depth: 30 },
    { id: "distant", x: 300, y: 100, depth: 40 },
  ];
  assert.deepEqual(
    ids(
      declutterBadgePositions(candidates, {
        ...viewport,
        selectedId: "selected",
      }),
    ),
    ["selected", "distant"],
  );
  assert.deepEqual(
    ids(
      declutterBadgePositions(candidates, {
        ...viewport,
        selectedId: "selected",
        focusedId: "focused",
      }),
    ),
    ["focused", "distant"],
  );
});

test("decluttering is deterministic, preserves inputs and uses depth then ID for ordinary markers", () => {
  const candidates = [
    { id: "b", x: 100, y: 100, depth: 2 },
    { id: "a", x: 100, y: 100, depth: 2 },
    { id: "far", x: 300, y: 100, depth: 9 },
    { id: "near", x: 302, y: 100, depth: 1 },
  ];
  const snapshot = JSON.stringify(candidates);
  const ordered = declutterBadgePositions(candidates, viewport);
  assert.deepEqual(ids(ordered), ["near", "a"]);
  assert.deepEqual(
    declutterBadgePositions([...candidates].reverse(), viewport),
    ordered,
  );
  assert.equal(JSON.stringify(candidates), snapshot);
});

test("visible targets remain inside the viewport and maintain 44px size plus an 8px gap", () => {
  const candidates = [];
  for (let row = 0; row < 14; row++)
    for (let column = 0; column < 18; column++)
      candidates.push({
        id: `${row}:${column}`,
        x: column * 24,
        y: row * 24,
        depth: row + column,
      });
  candidates.push({ id: "invalid", x: NaN, y: 100, depth: 1 });
  const kept = declutterBadgePositions(candidates, { width: 390, height: 300 });
  assert.ok(kept.length > 6);
  for (const item of kept) {
    assert.ok(item.x >= 22 && item.x <= 368);
    assert.ok(item.y >= 22 && item.y <= 278);
    for (const other of kept) {
      if (item === other) continue;
      assert.ok(
        Math.abs(item.x - other.x) >= 52 || Math.abs(item.y - other.y) >= 52,
      );
    }
  }
  assert.deepEqual(
    ids(
      declutterBadgePositions(
        [
          { id: "one", x: 22, y: 22 },
          { id: "two", x: 74, y: 22 },
        ],
        viewport,
      ),
    ),
    ["one", "two"],
  );
});

test("invalid layout dimensions and malformed candidates cannot produce visible controls", () => {
  const candidates = [
    { id: "outside", x: 2, y: 100 },
    { id: "infinite", x: 100, y: Infinity },
    { id: "", x: 100, y: 100 },
  ];
  assert.deepEqual(declutterBadgePositions(candidates, viewport), []);
  assert.deepEqual(
    declutterBadgePositions([{ id: "valid", x: 100, y: 100 }], {
      width: 800,
      height: 600,
      size: 0,
    }),
    [],
  );
});
