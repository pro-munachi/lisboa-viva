import { test } from "node:test";
import assert from "node:assert/strict";
const THREE = require("three");
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  createCityLayerMaterial,
  projectedCityBounds,
  safeRoadRibbonGeometry,
  updateCityCameraClip,
  updateCityLayerBounds,
  uniqueCityBuildingFootprints,
} from "../lib/city-rendering.js";
import { createBuildingOverview } from "../lib/city-overview.js";
import {
  surfaceElevationAt,
  projectGeo,
  unprojectGeo,
} from "../lib/geography.js";
import type { GeographicTerrain } from "../lib/geography";

test("city layer clones preserve existing shaders and separate exact detailed bounds from coarse instances", () => {
  const overview = createBuildingOverview([[5, 5, 4, 4, 12]], {
    geoY: () => 0,
    unprojectGeo: (x: number, z: number) => [x, z],
  });
  const source = overview.children[0].material;
  const material = createCityLayerMaterial(source, {
    bounds: [[0, 0, 10, 10]],
    wholeInstance: true,
  });
  const shader = {
    uniforms: {} as Record<string, any>,
    vertexShader:
      "#include <common>\nvoid main() {\n#include <color_vertex>\n#include <project_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n}",
  };
  material.onBeforeCompile(shader, {});
  assert.notEqual(material, source);
  assert.equal(source.userData.cityLayer, undefined);
  assert.ok(shader.vertexShader.includes("attribute float roamRoofFace;"));
  assert.ok(
    shader.vertexShader.includes(
      "vColor.xyz = mix(vColor.xyz, roamOverviewRoof",
    ),
  );
  assert.ok(shader.vertexShader.includes("vec4(0.0, 0.0, 0.0, 1.0)"));
  assert.ok(shader.vertexShader.includes("instanceMatrix * roamLayerPosition"));
  assert.ok(shader.fragmentShader.includes("if(roamCovered) discard;"));
  assert.ok(shader.fragmentShader.includes("vRoamLayerXZ.x < b.z"));
  const state = material.userData.cityLayer;
  const originalVector = state.bounds.value[0];
  updateCityLayerBounds(material, [[10, 10, 20, 20]]);
  assert.equal(state.bounds.value[0], originalVector);
  assert.deepEqual(originalVector.toArray(), [10, 10, 20, 20]);
  assert.equal(shader.uniforms.roamLayerCount.value, 1);
  updateCityLayerBounds(material, []);
  assert.equal(shader.uniforms.roamLayerCount.value, 0);
  assert.notEqual(
    material.customProgramCacheKey(),
    source.customProgramCacheKey(),
  );
  material.dispose();
  for (const mesh of overview.children) {
    mesh.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test("detailed road masks own half-open chunks and reject invalid/unbounded shader lists", () => {
  const source = new THREE.MeshStandardMaterial();
  const material = createCityLayerMaterial(source, {
    mode: "inside",
    bounds: [[0, 0, 10, 10]],
  });
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader: "#include <common>\nvoid main() {\n}",
  };
  material.onBeforeCompile(shader, {});
  assert.ok(shader.vertexShader.includes("vec4(transformed, 1.0)"));
  assert.ok(shader.fragmentShader.includes("if(!roamCovered) discard;"));
  assert.equal(updateCityLayerBounds(source, []), false);
  updateCityLayerBounds(material, [
    [NaN, 0, 1, 1],
    [1, 1, 0, 0],
    [0, 0, 10, 10],
  ]);
  assert.equal(material.userData.cityLayer.count.value, 1);
  assert.throws(
    () => updateCityLayerBounds(material, Array(9).fill([0, 0, 10, 10])),
    /eight/,
  );
  assert.throws(
    () => createCityLayerMaterial(source, { mode: "invalid" }),
    /inside or outside/,
  );
  assert.deepEqual(
    projectedCityBounds([0, 0, 10, 20], ([x, z]: number[]) => ({ x, z: -z })),
    [0, -20, 10, -0],
  );
  material.dispose();
  source.dispose();
});

test("hill-road ribbons are tessellated on the DEM and never dip into its diagonal crest", () => {
  // A coarse quad with four low corners cuts below this central DEM crest.
  const terrain: GeographicTerrain = {
    bounds: [0, 0, 2, 2],
    width: 3,
    height: 3,
    elevations: [0, 0, 0, 0, 12, 0, 0, 0, 0],
    source: {
      name: "Synthetic DEM crest",
      url: "test:crest",
      license: "Test fixture",
      acquiredAt: "2026-10-09",
      zoom: 0,
    },
  };
  const context = {
    projectGeo: ([x, z]: number[]) => ({ x, z }),
    unprojectGeo: (x: number, z: number) => [x, z],
    geoY: (p: number[]) => surfaceElevationAt([p[0], p[1]], terrain),
    terrain,
  };
  const road = safeRoadRibbonGeometry(
    [
      [0, 1],
      [2, 1],
    ],
    0.6,
    context,
    { lift: 0.19 },
  );
  const p = road.attributes.position;
  assert.ok(p.count > 6);
  assert.ok(
    Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i))) > 12,
  );
  assert.ok(Array.from(p.array).every(Number.isFinite));
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    assert.ok(
      Math.abs(y - context.geoY([x, z]) - 0.19) < 1e-5,
      `road triangle at ${x},${z} must follow DEM`,
    );
    assert.ok(road.attributes.normal.getY(i) > 0);
  }
  road.dispose();
});

test("acute corners and side markings have bounded joins rather than spikes or filled road centres", () => {
  const context = {
    projectGeo: ([x, z]: number[]) => ({ x, z }),
    unprojectGeo: (x: number, z: number) => [x, z],
    geoY: () => 0,
  };
  const points = [
    [0, 0],
    [20, 0],
    [0.1, 0.1],
  ];
  const road = safeRoadRibbonGeometry(points, 6, context);
  road.computeBoundingBox();
  assert.ok(road.boundingBox.min.x >= -3.1 && road.boundingBox.max.x <= 23.1);
  assert.ok(road.boundingBox.min.z >= -3.1 && road.boundingBox.max.z <= 3.2);
  const rail = safeRoadRibbonGeometry(
    [
      [0, 0],
      [20, 0],
      [20, 20],
    ],
    0.12,
    context,
    { side: 0.7 },
  );
  const p = rail.attributes.position;
  for (let i = 0; i < p.count; i++)
    assert.ok(
      Math.hypot(p.getX(i) - 20, p.getZ(i)) >= 0.63,
      "offset join must not fill the centreline",
    );
  road.dispose();
  rail.dispose();
  const invalid = safeRoadRibbonGeometry(
    [
      [0, 0],
      [NaN, 1],
      [2, 2],
    ],
    4,
    context,
  );
  assert.equal(invalid.attributes.position, undefined);
  invalid.dispose();
});

test("real bundled sloping roads retain finite upward-facing DEM-conforming geometry", () => {
  const read = (file: string) =>
    JSON.parse(
      gunzipSync(
        readFileSync(new URL(`../public/data/${file}`, import.meta.url)),
      ).toString(),
    );
  const manifest = read("lisbon-manifest.json.gz"),
    terrain = read("lisbon-terrain.json.gz");
  const context = {
    projectGeo,
    unprojectGeo,
    geoY: (p: number[]) => surfaceElevationAt([p[0], p[1]], terrain),
    terrain,
  };
  const roads = manifest.roads
    .filter(
      (r: any) => r.points.length > 4 && r.points.length < 18 && r.width >= 4,
    )
    .slice(0, 30);
  assert.equal(roads.length, 30);
  for (const source of roads) {
    const geometry = safeRoadRibbonGeometry(
      source.points,
      source.width,
      context,
    );
    const p = geometry.attributes.position,
      normal = geometry.attributes.normal;
    assert.ok(p.count > 0, String(source.id));
    assert.ok(Array.from(p.array).every(Number.isFinite));
    for (let i = 0; i < p.count; i++)
      assert.ok(normal.getY(i) >= -1e-7, `${source.id} road back face`);
    geometry.dispose();
  }
});

test("street camera depth precision improves without clipping distant regional overview", () => {
  const camera = new THREE.PerspectiveCamera(43, 1, 0.3, 90000);
  assert.equal(updateCityCameraClip(camera, 15), true);
  assert.equal(camera.near, 0.5);
  assert.equal(camera.far, 4500);
  assert.ok(camera.far / camera.near < 10000);
  assert.equal(updateCityCameraClip(camera, 15), false);
  updateCityCameraClip(camera, 70000);
  assert.equal(camera.near, 8);
  assert.ok(camera.far > 70000);
  updateCityCameraClip(camera, 15, true);
  assert.equal(camera.near, 0.15);
});

test("exact duplicate footprints disappear while every distinct multipolygon part survives", () => {
  const ring = [
    [0, 0],
    [10, 0],
    [10, 5],
    [0, 5],
    [0, 0],
  ];
  const a = { id: 1, ring, height: 12, heightSource: "estimated" };
  const duplicate = {
    id: 2,
    ring: [
      [10, 0],
      [0, 0],
      [0, 5],
      [10, 5],
      [10, 0],
    ],
    height: 9,
    heightSource: "height",
  };
  const separatePart = {
    id: 2,
    ring: [
      [20, 0],
      [30, 0],
      [30, 5],
      [20, 5],
    ],
    height: 9,
    heightSource: "height",
  };
  const original = structuredClone([a, duplicate, separatePart]);
  const unique = uniqueCityBuildingFootprints([a, duplicate, separatePart]);
  assert.deepEqual(unique, [duplicate, separatePart]);
  assert.deepEqual([a, duplicate, separatePart], original);
  const chunk = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("../public/data/buildings-0-1.json.gz", import.meta.url),
      ),
    ).toString(),
  );
  const cleaned = uniqueCityBuildingFootprints(chunk.buildings);
  assert.ok(
    cleaned.length < chunk.buildings.length,
    "real duplicate OSM ways must be removed",
  );
  assert.ok(
    cleaned.length >= chunk.buildings.length - 10,
    "only exact duplicates should disappear",
  );
});
