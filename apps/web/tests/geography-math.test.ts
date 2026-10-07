import { test } from "node:test";
import assert from "node:assert/strict";
import {
  elevationAt,
  GEO_ORIGIN,
  projectGeo,
  unprojectGeo,
  surfaceElevationAt,
  type GeographicTerrain,
} from "../lib/geography";

const terrain = (elevations: number[], width = 2): GeographicTerrain => ({
  bounds: [0, 0, 1, 1],
  width,
  height: width,
  elevations,
  source: {
    name: "Synthetic DEM fixture",
    url: "https://example.test/fixture",
    license: "Test fixture",
    acquiredAt: "2026-10-07",
    zoom: 12,
  },
});
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test("surface grounding prevents burial where a saddle DEM differs from its triangular mesh", () => {
  // Opposite corners are low. The mesh diagonal joins the two 100m corners.
  const saddle = terrain([0, 100, 100, 0]);
  assert.equal(elevationAt([0.5, 0.5], saddle), 50);
  assert.equal(surfaceElevationAt([0.5, 0.5], saddle), 100);
  near(surfaceElevationAt([0.2, 0.8], saddle), 40);
  near(surfaceElevationAt([0.8, 0.2], saddle), 40);
  near(elevationAt([0.2, 0.8], saddle), 32);
  near(elevationAt([0.8, 0.2], saddle), 32);
});

test("surface samples exactly match all corners and outer edges, including east and south", () => {
  const cell = terrain([10, 30, 70, 100]);
  for (const [lng, lat, expected] of [
    [0, 1, 10],
    [1, 1, 30],
    [0, 0, 70],
    [1, 0, 100],
    [0.5, 1, 20],
    [0, 0.5, 40],
    [1, 0.5, 65],
    [0.5, 0, 85],
  ]) {
    near(surfaceElevationAt([lng, lat], cell), expected);
  }
});

test("both triangles meet continuously along the rendered TR–BL diagonal", () => {
  const cell = terrain([10, 30, 70, 100]);
  near(surfaceElevationAt([0.25, 0.25], cell), 60);
  near(surfaceElevationAt([0.25, 0.25 - 1e-9], cell), 60);
  near(surfaceElevationAt([0.25, 0.25 + 1e-9], cell), 60);
});

test("adjacent DEM cells preserve exact grid-node heights and a planar surface", () => {
  const grid = terrain([0, 10, 20, 20, 30, 40, 40, 50, 60], 3);
  near(surfaceElevationAt([0.5, 0.5], grid), 30);
  near(surfaceElevationAt([1, 0.5], grid), 40);
  near(surfaceElevationAt([0.5, 0], grid), 50);
  near(surfaceElevationAt([1, 0], grid), 60);
  near(surfaceElevationAt([0.2, 0.3], grid), 32);
});

test("missing terrain and points outside coverage return zero", () => {
  const grid = terrain([0, 100, 100, 0]);
  assert.equal(surfaceElevationAt([0.5, 0.5]), 0);
  assert.equal(surfaceElevationAt([0.5, 0.5], null), 0);
  for (const point of [
    [-0.01, 0.5],
    [1.01, 0.5],
    [0.5, -0.01],
    [0.5, 1.01],
  ] as const) {
    assert.equal(surfaceElevationAt(point, grid), 0);
  }
});

test("geographic projection uses metre-scale east/south axes and round-trips Lisbon coordinates", () => {
  const origin = projectGeo(GEO_ORIGIN);
  near(origin.x, 0);
  near(origin.z, 0);
  const east = projectGeo([GEO_ORIGIN[0] + 0.001, GEO_ORIGIN[1]]);
  assert.ok(
    east.x > 80 && east.x < 90,
    "0.001 longitude degrees near Lisbon is about 87 metres east",
  );
  near(east.z, 0);
  const north = projectGeo([GEO_ORIGIN[0], GEO_ORIGIN[1] + 0.001]);
  near(north.x, 0);
  near(north.z, -111.32);
  for (const point of [
    [-9.144603, 38.705903],
    [-9.390524, 38.787462],
  ] as const) {
    const projected = projectGeo(point);
    const restored = unprojectGeo(projected.x, projected.z);
    assert.ok(Math.abs(restored[0] - point[0]) < 1e-10);
    assert.ok(Math.abs(restored[1] - point[1]) < 1e-10);
  }
});

test("bilinear DEM interpolation preserves north-to-south row orientation", () => {
  const grid = terrain([0, 100, 200, 300]);
  near(elevationAt([0.5, 1], grid), 50);
  near(elevationAt([0.5, 0], grid), 250);
  near(elevationAt([0.5, 0.5], grid), 150);
  near(elevationAt([0.25, 0.75], grid), 75);
  near(elevationAt([0, 1], grid), 0);
  near(elevationAt([1, 0], grid), 300);
});
