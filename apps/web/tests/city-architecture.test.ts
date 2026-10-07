import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildingArchitecture,
  buildingArchitectureProfile,
  createArchitecturePalette,
  createBuildingDetails,
} from "../lib/city-architecture.js";

const THREE = require("three");
const context = { projectGeo: ([x, z]: number[]) => ({ x, z }), geoY: () => 2 };
const rectangle = [
  [0, 0],
  [24, 0],
  [24, 12],
  [0, 12],
];
function building(
  kind = "yes",
  id: string | number = 99,
  ring = rectangle,
  height = 12,
) {
  return { id, kind, ring, height };
}
function dispose(result: any) {
  for (const key of ["wall", "roof", "details"]) result?.[key]?.dispose();
}
function coordinates(result: any) {
  return Array.from(result.attributes.position.array) as number[];
}
function validGeometry(result: any) {
  assert.ok(result.attributes.position.count > 0);
  assert.equal(result.attributes.position.count % 3, 0);
  for (const attribute of Object.values(result.attributes) as any[]) {
    assert.equal(attribute.count, result.attributes.position.count);
    assert.ok(Array.from(attribute.array).every(Number.isFinite));
  }
}
function insideOrBoundary(x: number, z: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i],
      [bx, bz] = ring[j];
    const cross = (x - ax) * (bz - az) - (z - az) * (bx - ax);
    if (
      Math.abs(cross) < 0.0001 &&
      x >= Math.min(ax, bx) - 0.0001 &&
      x <= Math.max(ax, bx) + 0.0001 &&
      z >= Math.min(az, bz) - 0.0001 &&
      z <= Math.max(az, bz) + 0.0001
    )
      return true;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}

test("explicit building uses override generic hashes and tall/large footprints get appropriate flat roofs", () => {
  for (const id of [1, 2, "way:234", "arbitrary-id"]) {
    for (const [kind, family] of [
      ["warehouse", "industrial"],
      ["hangar", "industrial"],
      ["transportation", "office"],
      ["office", "office"],
      ["school", "civic"],
      ["museum", "civic"],
      ["house", "townhouse"],
    ]) {
      const profile = buildingArchitectureProfile(building(kind, id), context)!;
      assert.equal(profile.family, family);
    }
    assert.equal(
      buildingArchitectureProfile(
        building("apartments", id, rectangle, 24),
        context,
      )!.family,
      "modern",
    );
    assert.equal(
      buildingArchitectureProfile(
        building("house", id, rectangle, 45),
        context,
      )!.roofStyle,
      "flat",
    );
  }
  const terminal = buildingArchitectureProfile(
    building(
      "transportation",
      23,
      [
        [0, 0],
        [180, 0],
        [180, 120],
        [0, 120],
      ],
      9.6,
    ),
    context,
  )!;
  assert.equal(terminal.family, "office");
  assert.equal(terminal.roofStyle, "flat");
  assert.equal(terminal.roofIndex, 3);
  assert.equal(
    buildingArchitectureProfile(building("yes", 7, rectangle, 6), context)!
      .family,
    "historic",
  );
  assert.equal(
    buildingArchitectureProfile(
      building(
        "yes",
        7,
        [
          [0, 0],
          [8, 0],
          [8, 10],
          [0, 10],
        ],
        6,
      ),
      context,
    )!.family,
    "townhouse",
  );
});

test("untagged equal-height stock has deterministic architectural variety without modifying the source", () => {
  const families = new Set(),
    palettes = new Set(),
    roofs = new Set();
  const cityContext = {
    projectGeo: ([lon, lat]: number[]) => ({
      x: (lon + 9.14) * 86000,
      z: (lat - 38.72) * 111000,
    }),
    geoY: () => 1,
  };
  const ring = [
    [-9.1401, 38.7199],
    [-9.1399, 38.7199],
    [-9.1399, 38.7201],
    [-9.1401, 38.7201],
  ];
  for (let id = 1; id <= 120; id++) {
    const source = building("yes", id, ring),
      original = structuredClone(source);
    const first = buildingArchitectureProfile(source, cityContext)!;
    const again = buildingArchitectureProfile(source, cityContext)!;
    assert.deepEqual(first, again);
    assert.deepEqual(source, original);
    families.add(first.family);
    palettes.add(first.paletteIndex);
    roofs.add(first.roofStyle);
    assert.ok(first.paletteIndex >= 0 && first.paletteIndex < 14);
    assert.ok(first.roofIndex >= 0 && first.roofIndex < 4);
  }
  assert.ok(families.size >= 4);
  assert.ok(palettes.size >= 8);
  assert.ok(roofs.size >= 3);
  const first = buildingArchitecture(building("house", "same-id"), context)!;
  const again = buildingArchitecture(building("house", "same-id"), context)!;
  try {
    assert.deepEqual(coordinates(first.wall), coordinates(again.wall));
    assert.deepEqual(coordinates(first.roof), coordinates(again.roof));
    assert.equal(first.details, null);
  } finally {
    dispose(first);
    dispose(again);
  }
});

test("flat, gable, hip and mansard silhouettes have different geometry and finishes", () => {
  const styles = new Map<string, any>();
  for (const kind of ["house", "museum", "office", "yes"])
    for (let id = 1; id <= 20; id++) {
      const result = buildingArchitecture(building(kind, id), context)!;
      if (!styles.has(result.roofStyle)) styles.set(result.roofStyle, result);
      else dispose(result);
    }
  try {
    assert.deepEqual(
      new Set(styles.keys()),
      new Set(["flat", "gable", "hip", "mansard"]),
    );
    const flat = styles.get("flat"),
      mansard = styles.get("mansard"),
      hip = styles.get("hip"),
      gable = styles.get("gable");
    assert.equal(flat.roof.attributes.position.count, 6);
    assert.ok(
      mansard.roof.attributes.position.count >
        hip.roof.attributes.position.count,
    );
    assert.notDeepEqual(coordinates(gable.roof), coordinates(hip.roof));
    assert.notEqual(mansard.roofIndex, hip.roofIndex);
    const flatY = coordinates(flat.roof).filter((_, index) => index % 3 === 1);
    assert.ok(flatY.every((y) => y === 14));
    for (const result of styles.values()) {
      validGeometry(result.wall);
      validGeometry(result.roof);
    }
  } finally {
    for (const result of styles.values()) dispose(result);
  }
});

test("concave rotated footprints remain exact and roof triangulation neither fills gaps nor exceeds the height envelope", () => {
  const baseRing = [
    [0, 0],
    [28, 0],
    [28, 9],
    [11, 9],
    [11, 22],
    [0, 22],
  ];
  const angle = 0.64;
  const ring = baseRing.map(([x, z]) => [
    x * Math.cos(angle) - z * Math.sin(angle) + 80,
    x * Math.sin(angle) + z * Math.cos(angle) - 30,
  ]);
  const slopeContext = {
    ...context,
    geoY: ([x, z]: number[]) => 0.02 * x + 0.01 * z,
  };
  const expectedArea = 28 * 9 + 11 * 13;
  for (const kind of ["house", "museum", "office", "warehouse", "apartments"])
    for (const shape of [
      ring,
      [...ring].reverse(),
      [...ring, ring[0]],
      [ring[0], ring[0], ...ring.slice(1)],
    ]) {
      const source = building(kind, 2, shape, 12),
        original = structuredClone(source);
      const result = buildingArchitecture(source, slopeContext, {
        detail: true,
      })!;
      try {
        assert.deepEqual(source, original);
        const positions = coordinates(result.wall);
        for (const [x, z] of ring)
          assert.ok(
            positions.some(
              (value, i) =>
                i % 3 === 0 &&
                Math.abs(value - x) < 0.0001 &&
                Math.abs(positions[i + 2] - z) < 0.0001,
            ),
          );
        const minimum = Math.min(...shape.map(slopeContext.geoY)),
          maximum = Math.max(...shape.map(slopeContext.geoY)) + source.height;
        for (const mesh of [result.wall, result.roof, result.details].filter(
          Boolean,
        )) {
          validGeometry(mesh);
          const ys = coordinates(mesh).filter((_, i) => i % 3 === 1);
          assert.ok(Math.min(...ys) >= minimum - 0.0001);
          assert.ok(Math.max(...ys) <= maximum + 0.0001);
        }
        const roof = coordinates(result.roof);
        let area = 0;
        for (let i = 0; i < roof.length; i += 9) {
          const a = [roof[i], roof[i + 2]],
            b = [roof[i + 3], roof[i + 5]],
            c = [roof[i + 6], roof[i + 8]];
          area +=
            Math.abs(
              (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
            ) / 2;
          assert.ok(
            insideOrBoundary(
              (a[0] + b[0] + c[0]) / 3,
              (a[1] + b[1] + c[1]) / 3,
              ring,
            ),
          );
        }
        assert.ok(Math.abs(area - expectedArea) < 0.01);
      } finally {
        dispose(result);
      }
    }
});

test("close-range balconies, cornices and chimneys share bounded coloured geometry and regenerate deterministically", () => {
  for (const kind of [
    "apartments",
    "yes",
    "house",
    "museum",
    "warehouse",
    "office",
  ]) {
    const source = building(kind, 12),
      sourceCopy = structuredClone(source);
    const only = createBuildingDetails(source, context)!;
    const full = buildingArchitecture(source, { ...context, detail: true })!;
    try {
      validGeometry(only);
      assert.ok(only.attributes.position.count <= 3600);
      assert.equal(only.attributes.uv, undefined);
      assert.deepEqual(coordinates(only), coordinates(full.details));
      assert.ok(
        only.attributes.color.array.every(
          (value: number) => value >= 0 && value <= 1,
        ),
      );
      assert.deepEqual(source, sourceCopy);
    } finally {
      only.dispose();
      dispose(full);
    }
  }
  assert.equal(
    createBuildingDetails(
      building("warehouse", 1, [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]),
      context,
    ),
    null,
  );
  assert.equal(
    createBuildingDetails(building("shed", 1, rectangle, 0.2), context),
    null,
  );
});

test("invalid footprints and heights produce no partial geometry", () => {
  for (const source of [
    building("yes", 1, []),
    building("yes", 1, [
      [0, 0],
      [1, 1],
      [2, 2],
    ]),
    building("yes", 1, [
      [0, 0],
      [NaN, 0],
      [1, 1],
    ]),
    building("yes", 1, rectangle, NaN),
    building("yes", 1, rectangle, 0),
  ]) {
    assert.equal(buildingArchitecture(source, context), null);
    assert.equal(createBuildingDetails(source, context), null);
  }
});

test("a fixed palette gives each window topology its own glass mask, one clock uniform and exactly-once resource disposal", () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document"),
    canvases: any[][] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement() {
        const ops: any[] = [];
        canvases.push(ops);
        const target: any = {
          fillStyle: "",
          fillRect(...args: number[]) {
            ops.push(["rect", this.fillStyle, ...args]);
          },
          fill() {
            ops.push(["path", this.fillStyle]);
          },
          createLinearGradient() {
            return { addColorStop() {} };
          },
        };
        const ctx = new Proxy(target, {
          get: (object, key) => (key in object ? object[key] : () => {}),
        });
        return { width: 0, height: 0, getContext: () => ctx };
      },
    },
  });
  try {
    const palette = createArchitecturePalette(),
      clock = palette.wallMaterials[0].userData.nightUniform;
    assert.equal(palette.wallMaterials.length, 14);
    assert.equal(palette.roofMaterials.length, 4);
    assert.equal(palette.roofMaterial, palette.roofMaterials[0]);
    assert.equal(palette.detailMaterial.vertexColors, true);
    const masks = new Set(
      palette.wallMaterials.map((material: any) => material.emissiveMap),
    );
    assert.equal(masks.size, 7);
    const signatures = canvases
      .slice(0, 7)
      .map((ops) => JSON.stringify(ops.filter((op) => op[1] === "#ffffff")));
    assert.equal(new Set(signatures).size, 7);
    // Iron balcony rails and sash/mullion frames block the warm glass glow.
    assert.ok(
      canvases[0].some(
        (op) =>
          JSON.stringify(op) ===
          JSON.stringify(["rect", "#000000", 81, 79, 94, 3]),
      ),
    );
    assert.ok(
      canvases[4].some(
        (op) =>
          JSON.stringify(op) ===
          JSON.stringify(["rect", "#000000", 14, 71, 228, 3]),
      ),
    );
    for (let i = 0; i < palette.wallMaterials.length; i++) {
      const material = palette.wallMaterials[i],
        shader = {
          uniforms: {} as any,
          fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        };
      assert.equal(
        material.emissiveMap,
        palette.wallMaterials[i - (i % 2)].emissiveMap,
      );
      assert.equal(material.userData.nightUniform, clock);
      material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.roamNight, clock);
      assert.match(
        shader.fragmentShader,
        /totalEmissiveRadiance \*= roamNight/,
      );
      assert.match(
        shader.fragmentShader,
        /emissiveMap, vec2\(vEmissiveMapUv.x, roamFacadeV\(vEmissiveMapUv.y\)\)/,
      );
    }
    palette.setNight(0.6);
    assert.equal(clock.value, 0.6);
    palette.setNight(Infinity);
    assert.equal(clock.value, 0);
    const resources = new Set<any>([
      ...palette.wallMaterials,
      ...palette.roofMaterials,
      palette.detailMaterial,
      ...palette.wallMaterials.map((material: any) => material.map),
      ...masks,
      ...palette.roofMaterials.map((material: any) => material.map),
    ]);
    assert.equal(resources.size, 44);
    const counts = new Map<any, number>();
    for (const resource of resources) {
      counts.set(resource, 0);
      resource.addEventListener("dispose", () =>
        counts.set(resource, counts.get(resource)! + 1),
      );
    }
    palette.dispose();
    palette.dispose();
    assert.ok([...counts.values()].every((count) => count === 1));
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
