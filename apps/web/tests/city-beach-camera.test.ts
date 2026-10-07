import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { beachCameraView } from "../lib/city-beach-camera";
import { coastRegions } from "../lib/city-water";
import { projectGeo, unprojectGeo, surfaceElevationAt } from "../lib/geography";

const THREE = require("three");

const data = (name: string) =>
  JSON.parse(
    gunzipSync(
      readFileSync(new URL(`../public/data/${name}.json.gz`, import.meta.url)),
    ).toString(),
  );
const manifest = data("lisbon-manifest"),
  terrain = data("lisbon-terrain");
const coast = coastRegions(manifest);
const beaches = JSON.parse(
  readFileSync(
    new URL("../public/data/lisbon-venues.json", import.meta.url),
    "utf8",
  ),
).venues.filter((venue: any) => venue.category === "beach");
const chunks = new Map<string, any>();

function nearbyFootprints(point: { x: number; z: number }) {
  return manifest.chunks.flatMap((chunk: any) => {
    const west = projectGeo([chunk.bounds[0], chunk.bounds[3]]),
      east = projectGeo([chunk.bounds[2], chunk.bounds[1]]);
    if (
      point.x + 90 < west.x ||
      point.x - 90 > east.x ||
      point.z + 90 < west.z ||
      point.z - 90 > east.z
    )
      return [];
    if (!chunks.has(chunk.id))
      chunks.set(chunk.id, data(`buildings-${chunk.id}`));
    return chunks
      .get(chunk.id)
      .buildings.map((b: any) => b.ring.map(projectGeo));
  });
}

test("mapped beach views show their original props and real water, including Tamariz and narrow coves", () => {
  assert.equal(beaches.length, 24);
  for (const aspect of [1.5, 0.65])
    for (const beach of beaches) {
      const point = projectGeo(beach.point),
        original = { ...point };
      const groundY = surfaceElevationAt(beach.point, terrain);
      let samples = 0;
      const waterAt = (p: { x: number; z: number }) => {
        samples++;
        return coast.waterAt(unprojectGeo(p.x, p.z));
      };
      const framed = beachCameraView({
        point,
        groundY,
        waterAt,
        elevationAt: (p: any) =>
          surfaceElevationAt(unprojectGeo(p.x, p.z), terrain),
        footprints: nearbyFootprints(point),
        aspect,
      });
      assert.ok(framed, `${beach.name} must have a safe land-side view`);
      assert.deepEqual(point, original, "source positions must not change");
      assert.equal(
        waterAt(framed.camera),
        false,
        `${beach.name} camera should approach from land`,
      );
      assert.equal(
        waterAt(framed.shoreline),
        true,
        `${beach.name} must show actual mapped water`,
      );
      assert.ok(
        samples < 600,
        "coast discovery and camera checks must stay bounded",
      );
      const camera = new THREE.PerspectiveCamera(43, aspect, 0.3, 90000);
      camera.position.set(framed.camera.x, framed.camera.y, framed.camera.z);
      camera.lookAt(framed.target.x, framed.target.y, framed.target.z);
      camera.updateMatrixWorld();
      for (const subject of [
        { x: point.x, y: groundY + 1.7, z: point.z },
        framed.shoreline,
      ]) {
        const ndc = new THREE.Vector3(subject.x, subject.y, subject.z).project(
          camera,
        );
        assert.ok(
          Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95 && ndc.z < 1,
          `${beach.name} source and shoreline must fit (${JSON.stringify(ndc)})`,
        );
      }
    }
});

test("beach cameras use the observed water direction and reject obstructed sightlines", () => {
  const obstruction = [
    { x: -10, z: -26 },
    { x: 10, z: -26 },
    { x: 10, z: -8 },
    { x: -10, z: -8 },
  ];
  const result = beachCameraView({
    point: { x: 0, z: 0 },
    groundY: 2,
    waterAt: (p: any) => p.z >= 20,
    elevationAt: () => 2,
    footprints: [obstruction],
  });
  assert.ok(result);
  assert.ok(result.seaward.z > 0.7);
  assert.ok(Math.abs(result.camera.x) > 10 || result.camera.z > -8);
  // A different coast orientation must also work; no fixed southern ocean.
  const west = beachCameraView({
    point: { x: 0, z: 0 },
    groundY: 2,
    waterAt: (p: any) => p.x < -20,
    elevationAt: () => 2,
  });
  assert.ok(west);
  assert.ok(west.camera.x > 0);
  assert.ok(west.shoreline.x < -20);
});

test("an absent coast or entirely enclosed source leaves the existing fallback available", () => {
  assert.equal(
    beachCameraView({
      point: { x: 0, z: 0 },
      groundY: 0,
      waterAt: () => false,
    }),
    null,
  );
  assert.equal(
    beachCameraView({
      point: { x: 0, z: 0 },
      groundY: 0,
      waterAt: (p: any) => p.z > 20,
      footprints: [
        [
          { x: -50, z: -50 },
          { x: 50, z: -50 },
          { x: 50, z: 50 },
          { x: -50, z: 50 },
        ],
      ],
    }),
    null,
  );
});
