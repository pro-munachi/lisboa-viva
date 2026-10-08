import assert from "node:assert/strict";
import { test } from "node:test";
import { createVenueDecorations } from "../lib/city-venues.js";
import {
  createStreetLife,
  setStreetLifeNight,
} from "../lib/city-street-life.js";
import { createLandscape } from "../lib/city-landscape.js";

const { Box3 } = require("three");

const projectGeo = ([x, lat]: number[]) => ({ x, z: -lat });
const geoY = ([x, lat]: number[]) => 2 + x * 0.001 + lat * 0.003;
function withCanvas(run: () => void) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () =>
          new Proxy(
            { measureText: (s: string) => ({ width: s.length * 8 }) },
            { get: (target: any, key) => target[key] || (() => {}) },
          ),
      }),
    },
  });
  try {
    run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
}
function release(...groups: any[]) {
  const resources = new Set<any>();
  groups.forEach((group) =>
    group.traverse((node: any) => {
      if (node.geometry) resources.add(node.geometry);
      if (node.material) {
        resources.add(node.material);
        if (node.material.map) resources.add(node.material.map);
      }
    }),
  );
  resources.forEach((resource) => resource.dispose());
}
function mappedPlaces(count = 4, height = 12) {
  const chunk = {
    bounds: [0, 0, 1800, 100],
    buildings: Array.from({ length: count }, (_, i) => {
      const x = 30 + i * 50;
      return {
        id: i + 1,
        kind: "retail",
        height,
        ring: [
          [x, 35],
          [x + 12, 35],
          [x + 12, 55],
          [x, 55],
          [x, 35],
        ],
      };
    }),
    roads: [
      {
        id: 10,
        kind: "residential",
        width: 5,
        points: [
          [0, 29],
          [1800, 29],
        ],
      },
    ],
    surfaces: [],
  };
  const venues = Array.from({ length: count }, (_, i) => ({
    id: `node:${i + 1}`,
    name: `Source place ${i + 1}`,
    category: ["cafe", "restaurant", "bar", "shop"][i % 4],
    point: [36 + i * 50, 35.4],
  }));
  return { chunk, venues };
}
function validateGeometry(group: any) {
  let meshes = 0,
    triangles = 0;
  group.traverse((node: any) => {
    if (!node.isMesh) return;
    meshes++;
    for (const attribute of Object.values(node.geometry.attributes) as any[])
      for (const value of attribute.array) assert.ok(Number.isFinite(value));
    triangles +=
      ((node.geometry.index?.count || node.geometry.attributes.position.count) /
        3) *
      (node.isInstancedMesh ? node.count : 1);
  });
  return { meshes, triangles };
}

test("street dressing uses mounted source facades and existing terrace tables, keeping road clearance", () => {
  withCanvas(() => {
    const { chunk, venues } = mappedPlaces();
    const original = JSON.stringify({ chunk, venues });
    const storefronts = createVenueDecorations(chunk, venues, {
      projectGeo,
      geoY,
      focusPoint: [36, 35.4],
    });
    const group = createStreetLife(chunk, storefronts, { projectGeo, geoY });
    try {
      const meta = group.userData.streetLife;
      assert.equal(meta.fronts, 4);
      assert.deepEqual(
        meta.venueIds,
        venues.map((venue) => venue.id),
      );
      assert.ok(meta.parasols > 0);
      assert.equal(meta.lanterns, 8);
      const tables = storefronts.children.flatMap(
        (front: any) => front.userData.terraceTables || [],
      );
      for (const point of meta.points) {
        assert.ok(
          venues.some(
            (venue) => venue.id === point.venueId && venue.name === point.name,
          ),
        );
        assert.ok([point.x, point.y, point.z].every(Number.isFinite));
        if (point.type === "striped-esplanada-parasol") {
          assert.ok(
            tables.some(
              (table: any) =>
                table.x === point.x &&
                table.y === point.y &&
                table.z === point.z,
            ),
          );
          assert.ok(Math.abs(point.z + 29) >= 2.5 + 1.05);
        }
        if (["facade-planter", "menu-board"].includes(point.type)) {
          assert.ok(Math.abs(point.z + 29) >= 2.5 + 0.35);
          assert.ok(
            Math.abs(point.y - geoY([point.x, -point.z]) - 0.13) < 1e-8,
          );
        }
      }
      assert.equal(
        meta.reservations.filter((p: any) => p.type === "mapped-terrace")
          .length,
        tables.length,
      );
      assert.equal(JSON.stringify({ chunk, venues }), original);
      const geometry = validateGeometry(group);
      assert.equal(geometry.meshes, meta.drawCalls);
      assert.ok(meta.drawCalls <= 13);
      assert.ok(geometry.triangles < 12000);
      setStreetLifeNight(group, 1);
      assert.equal(group.userData.streetLighting.strength.value, 0.27);
      assert.ok(
        group.userData.streetLighting.glass.every(
          (mat: any) => mat.emissiveIntensity > 2,
        ),
      );
      setStreetLifeNight(group, Number.NaN);
      assert.equal(group.userData.streetLighting.strength.value, 0);
      assert.ok(
        group.userData.streetLighting.glass.every(
          (mat: any) => mat.emissiveIntensity === 0.08,
        ),
      );
    } finally {
      release(group, storefronts);
    }
  });
});

test("fallback map signs never become invented street facades", () => {
  withCanvas(() => {
    const { chunk, venues } = mappedPlaces();
    chunk.buildings = [];
    const storefronts = createVenueDecorations(chunk, venues, {
      projectGeo,
      geoY,
      focusPoint: [36, 35.4],
    });
    const group = createStreetLife(chunk, storefronts, { projectGeo, geoY });
    try {
      assert.equal(group.userData.streetLife.fronts, 0);
      assert.deepEqual(group.userData.streetLife.venueIds, []);
      assert.deepEqual(group.userData.streetLife.points, []);
      assert.equal(group.children.length, 0);
    } finally {
      release(group, storefronts);
    }
  });
});

test("fixtures stay below low mapped roofs and dense venue output remains capped", () => {
  withCanvas(() => {
    const { chunk, venues } = mappedPlaces(1, 1.95);
    venues[0].category = "bar";
    const storefronts = createVenueDecorations(chunk, venues, {
      projectGeo,
      geoY,
      focusPoint: [36, 35.4],
    });
    const group = createStreetLife(chunk, storefronts, { projectGeo, geoY });
    try {
      assert.equal(group.userData.streetLife.lanterns, 0);
      const front = storefronts.children.find(
        (child: any) => child.userData.mappedFacade,
      )!;
      const trim = group.getObjectByName("Warm entrance trim")!;
      assert.ok(
        new Box3().setFromObject(trim).max.y <=
          front.userData.mappedFacade.groundY +
            front.userData.mappedFacade.height,
      );
    } finally {
      release(group, storefronts);
    }
    const many = mappedPlaces(100);
    const dense = createVenueDecorations(many.chunk, many.venues, {
      projectGeo,
      geoY,
      focusPoint: [36, 35.4],
    });
    const life = createStreetLife(many.chunk, dense, { projectGeo, geoY });
    try {
      assert.ok(life.userData.streetLife.fronts <= 24);
      assert.ok(life.userData.streetLife.parasols <= 24);
      assert.ok(life.userData.streetLife.planters <= 48);
      assert.ok(life.userData.streetLife.drawCalls <= 13);
      validateGeometry(life);
    } finally {
      release(life, dense);
    }
  });
});

function garden(withPath = true) {
  return {
    bounds: [0, 0, 120, 80],
    buildings: [],
    roads: withPath
      ? [
          {
            id: 101,
            kind: "footway",
            width: 2,
            points: [
              [0, 40],
              [120, 40],
            ],
          },
        ]
      : [],
    surfaces: [
      {
        id: 201,
        kind: "park",
        ring: [
          [10, 10],
          [110, 10],
          [110, 70],
          [10, 70],
          [10, 10],
        ],
      },
    ],
  };
}
test("park paths and seats follow mapped footways inside green rings and avoid sourced terraces", () => {
  const chunk = garden(),
    original = JSON.stringify(chunk);
  const reserve = { x: 35, z: -42.65, radius: 3 };
  const group = createLandscape(chunk, {
    projectGeo,
    geoY,
    focusPoint: [50, 40],
    venueReservations: [reserve],
  });
  try {
    const meta = group.userData.landscape;
    assert.ok(meta.parkPaths >= 6);
    assert.ok(meta.parkBenches > 0);
    assert.ok(meta.flowerBeds > 0);
    assert.ok(meta.parkBenches <= 18);
    assert.ok(meta.flowerBeds <= 24);
    for (const path of meta.parkDetails.paths) {
      assert.equal(path.roadId, 101);
      assert.equal(path.surfaceId, 201);
      assert.equal(path.z, -40);
      assert.ok(path.x > 10 && path.x < 110);
    }
    for (const point of [
      ...meta.parkDetails.benches,
      ...meta.parkDetails.flowerBeds,
    ]) {
      assert.ok(
        point.x > 10 && point.x < 110 && point.z > -70 && point.z < -10,
      );
      assert.ok(Math.abs(point.z + 40) >= 1.75);
      assert.ok(
        Math.hypot(point.x - reserve.x, point.z - reserve.z) >=
          reserve.radius + 1.15 - 1e-9,
      );
    }
    assert.equal(JSON.stringify(chunk), original);
    const geometry = validateGeometry(group);
    assert.equal(geometry.meshes, meta.drawCalls);
    assert.ok(meta.drawCalls <= 28);
  } finally {
    release(group);
  }
});

test("green rings without mapped footways do not acquire invented paths or park furniture", () => {
  const group = createLandscape(garden(false), {
    projectGeo,
    geoY,
    focusPoint: [50, 40],
  });
  try {
    assert.equal(group.userData.landscape.parkPaths, 0);
    assert.equal(group.userData.landscape.parkBenches, 0);
    assert.equal(group.userData.landscape.flowerBeds, 0);
    assert.equal(
      group.getObjectByName("Paths following mapped garden footways"),
      undefined,
    );
  } finally {
    release(group);
  }
});
