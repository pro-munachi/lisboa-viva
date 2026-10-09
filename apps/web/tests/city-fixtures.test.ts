import { test } from "node:test";
import assert from "node:assert/strict";
const THREE = require("three");
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  createCityFixtures,
  sceneryFromIntersection,
  updateCityFixtures,
} from "../lib/city-fixtures.js";
import { createLandscape } from "../lib/city-landscape.js";
import { trafficSignalState } from "../lib/city-traffic.js";
import { projectGeo, unprojectGeo, surfaceElevationAt } from "../lib/geography";
import { coastRegions } from "../lib/city-water.js";

const projection = {
  projectGeo: ([x, z]: number[]) => ({ x, z: -z }),
  unprojectGeo: (x: number, z: number) => [x, -z],
  geoY: () => 0,
  focusPoint: [0, 0],
};
const crossing = {
  id: "test-streets",
  bounds: [-100, -100, 100, 100],
  buildings: [],
  surfaces: [],
  roads: [
    {
      id: 1,
      kind: "primary",
      width: 10,
      name: "Rua de São Paulo",
      points: [
        [0, -85],
        [0, 0],
        [0, 85],
      ],
    },
    {
      id: 2,
      kind: "tertiary",
      width: 8,
      name: "Rua da Moeda",
      points: [
        [-85, 0],
        [0, 0],
        [85, 0],
      ],
    },
  ],
};

function dispose(group: any) {
  const geometries = new Set<any>(),
    materials = new Set<any>();
  group.traverse((mesh: any) => {
    if (mesh.isInstancedMesh) mesh.dispose();
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) materials.add(mesh.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    m.map?.dispose();
    m.dispose();
  });
}
function read(file: string) {
  return JSON.parse(
    gunzipSync(
      readFileSync(new URL(`../public/data/${file}`, import.meta.url)),
    ).toString(),
  );
}

test("street infrastructure is bounded, grounded and pickable with genuine road-name attribution", () => {
  const group = createCityFixtures(crossing, { ...projection, maxObjects: 24 });
  const stats = group.userData.fixtures,
    items = group.userData.sceneryItems;
  assert.equal(stats.junctions, 1);
  assert.equal(stats.crosswalks, 4);
  assert.equal(stats.signals, 4);
  assert.ok(stats["bus-stop"] > 0);
  assert.ok(stats.bin > 0);
  assert.ok(stats["bike-rack"] > 0);
  assert.ok(stats.fountain > 0);
  assert.ok(stats["street-sign"] > 0);
  assert.ok(
    group.children.length < 38,
    "signal lenses and crossings must remain batched",
  );
  for (const item of items) {
    assert.ok([item.x, item.y, item.z, item.radius].every(Number.isFinite));
    assert.equal(item.source, "authored");
    assert.ok(item.x >= -100 && item.x < 100 && item.z >= -100 && item.z < 100);
  }
  const signs = items.filter((item: any) => item.kind === "street_sign");
  assert.ok(
    signs.every(
      (item: any) =>
        ["Rua de São Paulo", "Rua da Moeda"].includes(item.name) &&
        item.nameSource === "mapped",
    ),
  );
  const bus = items.find((item: any) => item.kind === "bus_stop");
  assert.ok(bus && bus.radius > 1);
  const bins = group.children.filter(
    (mesh: any) => mesh.userData.scenery?.kind === "bin",
  );
  assert.equal(
    sceneryFromIntersection({ object: bins[0] }),
    bins[0].userData.scenery,
  );
  const paint = group.children.find(
    (mesh: any) => mesh.userData.sceneryFaceRanges,
  );
  const range = paint.userData.sceneryFaceRanges[3];
  assert.equal(
    sceneryFromIntersection({ object: paint, faceIndex: range.start }),
    range.scenery,
  );
  assert.equal(
    sceneryFromIntersection({ object: paint, faceIndex: 999999 }),
    null,
  );
  assert.equal(sceneryFromIntersection(null), null);
  dispose(group);
});

test("red/amber/green lenses and clickable crossing metadata share the vehicle simulation clock", () => {
  const group = createCityFixtures(crossing, projection),
    state = group.userData.fixtures;
  assert.ok(state.signalEntries.length);
  const scratch = new THREE.Color();
  for (const time of [0, 11, 22, 24, 26, 40, 48, 52, 79]) {
    updateCityFixtures(group, time);
    for (const lamp of state.signalMeshes)
      for (let i = 0; i < state.signalEntries.length; i++) {
        const signal = state.signalEntries[i],
          phase = trafficSignalState(signal.junction, time, signal.angle);
        lamp.mesh.getColorAt(i, scratch);
        const expected = lamp.color
          .clone()
          .multiplyScalar(phase === lamp.state ? 1 : 0.025);
        assert.ok(
          Math.abs(scratch.r - expected.r) < 1e-6 &&
            Math.abs(scratch.g - expected.g) < 1e-6 &&
            Math.abs(scratch.b - expected.b) < 1e-6,
        );
      }
    for (const entry of state.crossingEntries)
      assert.equal(
        entry.scenery.signalState,
        trafficSignalState(entry.junction, time, entry.angle),
      );
  }
  const uniforms = state.signalMeshes[0].mesh.material;
  const shader = { fragmentShader: "#include <emissivemap_fragment>" };
  uniforms.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes("defined(USE_INSTANCING_COLOR)"));
  const colour = state.scratchColor;
  updateCityFixtures(group, 80);
  assert.equal(
    state.scratchColor,
    colour,
    "updates reuse the same colour scratch buffer",
  );
  dispose(group);
});

test("stop lines and traffic posts sit beside the right-hand incoming lane used by vehicles", () => {
  const group = createCityFixtures(crossing, projection);
  const state = group.userData.fixtures;
  for (const signal of state.signalEntries) {
    const centre = {
      x: signal.junction.x - Math.sin(signal.angle) * 8,
      z: signal.junction.z - Math.cos(signal.angle) * 8,
    };
    const lateral =
      (signal.x - centre.x) * Math.cos(signal.angle) -
      (signal.z - centre.z) * Math.sin(signal.angle);
    assert.ok(
      lateral < -2,
      "the post must be on the incoming lane's curb, not the opposite lane",
    );
  }
  const paint = group.children.find(
    (mesh: any) => mesh.userData.sceneryFaceRanges,
  );
  const positions = paint.geometry.attributes.position;
  const stops = paint.userData.sceneryFaceRanges.filter((range: any) => {
    const angle = range.scenery.angle;
    const lateral: number[] = [],
      along: number[] = [];
    for (let i = range.start * 3; i < range.end * 3; i++) {
      const dx = positions.getX(i) - range.scenery.x,
        dz = positions.getZ(i) - range.scenery.z;
      lateral.push(dx * Math.cos(angle) - dz * Math.sin(angle));
      along.push(dx * Math.sin(angle) + dz * Math.cos(angle));
    }
    if (Math.max(...along) - Math.min(...along) > 0.3) return false;
    assert.ok(
      Math.max(...lateral) < 0,
      "the stop stripe spans only the incoming carriageway",
    );
    return true;
  });
  assert.equal(stops.length, state.crosswalks);
  dispose(group);
});

test("furniture respects blocked buildings, source water, reserved terraces and exact chunk ownership", () => {
  const blocked = {
    ...crossing,
    buildings: [
      {
        ring: [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100],
        ],
        height: 12,
      },
    ],
  };
  const buildingGroup = createCityFixtures(blocked, projection);
  assert.equal(buildingGroup.userData.sceneryItems.length, 0);
  dispose(buildingGroup);
  const waterGroup = createCityFixtures(crossing, {
    ...projection,
    waterAt: () => true,
  });
  assert.equal(waterGroup.children.length, 0);
  dispose(waterGroup);
  const reservationGroup = createCityFixtures(crossing, {
    ...projection,
    maxJunctions: 0,
    reservations: [{ x: 0, z: 0, radius: 250 }],
  });
  assert.equal(reservationGroup.children.length, 0);
  dispose(reservationGroup);
  const empty = createCityFixtures({ ...crossing, roads: [] }, projection);
  assert.equal(empty.children.length, 0);
  assert.equal(empty.userData.fixtures.drawCalls, 0);
  dispose(empty);
});

test("narrow unsignalled junctions have give-way signs rather than invented traffic signals", () => {
  const narrow = {
    ...crossing,
    roads: crossing.roads.map((road) => ({
      ...road,
      kind: "residential",
      width: 6,
    })),
  };
  const group = createCityFixtures(narrow, projection),
    state = group.userData.fixtures;
  assert.equal(state.signals, 0);
  assert.equal(state.giveWaySigns, 4);
  const signs = group.userData.sceneryItems.filter(
    (item: any) => item.rule === "give-way",
  );
  assert.equal(signs.length, 4);
  assert.ok(
    signs.every(
      (item: any) => item.kind === "street_sign" && item.source === "authored",
    ),
  );
  dispose(group);
});

test("existing instanced garden trees, benches and flowers keep original rendering while exposing precise action targets", () => {
  const park = {
    id: "park",
    bounds: [-50, -50, 50, 50],
    buildings: [],
    surfaces: [
      {
        id: 3,
        kind: "park",
        ring: [
          [-50, -50],
          [50, -50],
          [50, 50],
          [-50, 50],
        ],
      },
    ],
    roads: [
      {
        id: 4,
        kind: "footway",
        width: 3,
        points: [
          [-40, 0],
          [40, 0],
        ],
      },
    ],
  };
  const group = createLandscape(park, projection);
  const metadata = group.userData.sceneryItems;
  for (const kind of ["tree", "bench", "flowers"])
    assert.ok(
      metadata.some((item: any) => item.kind === kind),
      `${kind} must be interactable`,
    );
  const tree = metadata.find((item: any) => item.kind === "tree");
  assert.equal(tree.speciesSource, "illustrative");
  assert.equal(tree.source, "authored");
  assert.ok(tree.radius < 0.4, "collision is on a trunk, not the whole canopy");
  assert.ok(
    metadata
      .filter((item: any) => item.fruitBearing)
      .every((item: any) => item.id.startsWith("fruit-tree:")),
  );
  const mesh = group.children.find((child: any) =>
    child.userData.sceneryInstances?.some((item: any) => item.id === tree.id),
  );
  const index = mesh.userData.sceneryInstances.findIndex(
    (item: any) => item.id === tree.id,
  );
  assert.equal(
    sceneryFromIntersection({ object: mesh, instanceId: index }),
    tree,
  );
  assert.equal(
    sceneryFromIntersection({ object: mesh, instanceId: 100000 }),
    null,
  );
  const ids = metadata.map((item: any) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  dispose(group);
});

test("real Cais do Sodré fixture generation has a small draw budget and stays on land outside source walls", () => {
  const chunk = read("buildings-11-0.json.gz"),
    terrain = read("lisbon-terrain.json.gz"),
    coast = coastRegions(read("lisbon-manifest.json.gz"));
  const options = {
    projectGeo,
    unprojectGeo,
    geoY: (p: number[]) => surfaceElevationAt([p[0], p[1]], terrain),
    terrain,
    focusPoint: [-9.1457, 38.7075],
    waterAt: (p: any) => coast.waterAt(unprojectGeo(p.x, p.z)),
  };
  const group = createCityFixtures(chunk, options),
    state = group.userData.fixtures;
  assert.ok(state.drawCalls <= 65);
  assert.ok(group.userData.sceneryItems.length > 10);
  for (const item of group.userData.sceneryItems) {
    assert.equal(options.waterAt(item), false, `${item.kind} in water`);
    assert.ok(Number.isFinite(item.y));
  }
  assert.ok(
    state["bus-stop"] <= 3 && state["bike-rack"] <= 4 && state.fountain <= 3,
  );
  dispose(group);
});
