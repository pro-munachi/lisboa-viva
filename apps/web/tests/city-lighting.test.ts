import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lightingForMinute,
  nearestLampAnchors,
  normalizeCityMinute,
} from "../lib/city-lighting.js";
import { createArchitecturePalette } from "../lib/city-architecture.js";
import { createCityAtmosphere } from "../lib/city-atmosphere.js";
import { createLandscape, setLandscapeNight } from "../lib/city-landscape.js";

const THREE = require("three");

// GPU upload is unnecessary here: exercise the actual materials, geometry and
// disposal events with a drawing context that records the emissive glass mask.
function withCanvas(run: (draws: any[][]) => void) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  const draws: any[][] = [];
  const documentStub = {
    createElement(name: string) {
      assert.equal(name, "canvas");
      const ops: any[] = [];
      draws.push(ops);
      const ctx: any = new Proxy(
        {
          fillStyle: "",
          fillRect(...args: number[]) {
            ops.push({ fill: this.fillStyle, args });
          },
          fill() {
            ops.push({ fill: this.fillStyle, args: [] });
          },
          createLinearGradient() {
            return { addColorStop() {} };
          },
        },
        {
          get(target, key) {
            return key in target
              ? target[key as keyof typeof target]
              : () => {};
          },
        },
      );
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
  Object.defineProperty(globalThis, "document", {
    value: documentStub,
    configurable: true,
  });
  try {
    run(draws);
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

function auditDisposal(resources: any[]) {
  const counts = new Map<any, number>();
  for (const resource of new Set(resources)) {
    counts.set(resource, 0);
    resource.addEventListener("dispose", () => {
      counts.set(resource, counts.get(resource)! + 1);
    });
  }
  return () => {
    assert.ok(counts.size > 0);
    for (const count of counts.values()) assert.equal(count, 1);
  };
}

function disposeGroup(group: any) {
  const resources = new Set<any>();
  group.traverse((node: any) => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : []) {
      resources.add(material);
      if (material.map) resources.add(material.map);
    }
  });
  const verify = auditDisposal([...resources]);
  resources.forEach((resource) => resource.dispose());
  group.removeFromParent();
  group.clear();
  verify();
}

test("clock minutes wrap into one day and invalid values have a readable daytime default", () => {
  assert.equal(normalizeCityMinute(1440), 0);
  assert.equal(normalizeCityMinute(-1), 1439);
  assert.equal(normalizeCityMinute(-1441), 1439);
  assert.equal(normalizeCityMinute(3 * 1440 + 725.5), 725.5);
  for (const value of [NaN, Infinity, -Infinity, undefined])
    assert.equal(normalizeCityMinute(value), 660);
  assert.deepEqual(lightingForMinute(1440), lightingForMinute(0));
  assert.deepEqual(lightingForMinute(-1), lightingForMinute(1439));
  assert.deepEqual(lightingForMinute(Infinity), lightingForMinute(660));
});

test("daylight, golden hour and night have distinct bounded palettes with continuous transitions", () => {
  const day = lightingForMinute(660);
  const evening = lightingForMinute(1050);
  const night = lightingForMinute(1320);
  assert.equal(day.night, 0);
  assert.equal(night.night, 1);
  assert.ok(evening.night > day.night && evening.night < night.night);
  assert.ok(day.sunIntensity > evening.sunIntensity);
  assert.ok(evening.sunIntensity > night.sunIntensity);
  assert.ok(day.hemisphereIntensity > night.hemisphereIntensity);
  assert.notEqual(day.horizon, evening.horizon);
  assert.notEqual(evening.horizon, night.horizon);
  const goldenSun = parseInt(evening.sunColor.slice(1), 16);
  assert.ok(goldenSun >> 16 > (goldenSun & 255));
  for (let minute = 0; minute < 1440; minute++) {
    const state = lightingForMinute(minute);
    assert.ok(state.night >= 0 && state.night <= 1);
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === "number") assert.ok(Number.isFinite(value), key);
      if (typeof value === "string") assert.match(value, /^#[0-9a-f]{6}$/);
    }
    for (const value of Object.values(state.sunOffset))
      assert.ok(Number.isFinite(value));
    assert.ok(state.sunOffset.y > 0);
    const next = lightingForMinute(minute + 1);
    assert.ok(Math.abs(next.night - state.night) < 0.02);
    assert.ok(Math.abs(next.sunIntensity - state.sunIntensity) < 0.04);
  }
  const changed = lightingForMinute(660);
  changed.sunOffset.x = 99999;
  changed.skyTop = "#ff0000";
  assert.deepEqual(lightingForMinute(660), day);
});

test("the local lamp pool chooses six nearest valid unique positions without mutating chunk data", () => {
  const anchors = [
    { x: 60, y: 5, z: 0 },
    { x: 5, y: 5, z: 0 },
    { x: -5, y: 5, z: 0 },
    { x: 0, y: 5, z: 10 },
    { x: 20, y: 5, z: 0 },
    { x: 30, y: 5, z: 0 },
    { x: 40, y: 5, z: 0 },
    { x: 50, y: 5, z: 0 },
    { x: 5, y: 5, z: 0 },
    { x: 101, y: 5, z: 0 },
    { x: NaN, y: 5, z: 0 },
  ];
  const original = structuredClone(anchors);
  const selected = nearestLampAnchors(anchors, { x: 0, z: 0 });
  assert.deepEqual(
    selected.map((point: any) => point.x),
    [-5, 5, 0, 20, 30, 40],
  );
  assert.equal(selected[1], anchors[1]);
  assert.deepEqual(anchors, original);
  assert.equal(
    nearestLampAnchors(anchors, { x: 0, z: 0 }, { limit: 99 }).length,
    6,
  );
  assert.equal(
    nearestLampAnchors(anchors, { x: 0, z: 0 }, { maxDistance: 5 }).length,
    2,
  );
  assert.equal(
    nearestLampAnchors(anchors, { x: 0, z: 0 }, { limit: 1 }).length,
    1,
  );
  for (const options of [{ limit: 0 }, { limit: NaN }, { maxDistance: -1 }])
    assert.deepEqual(nearestLampAnchors(anchors, { x: 0, z: 0 }, options), []);
  assert.deepEqual(nearestLampAnchors(anchors, { x: Infinity, z: 0 }), []);
});

test("all façade variants share one clock uniform and only mapped glass emits at night", () => {
  withCanvas((draws) => {
    const palette = createArchitecturePalette();
    const shared = palette.wallMaterials[0].userData.nightUniform;
    const masks = [
      ...new Set(
        palette.wallMaterials.map((material: any) => material.emissiveMap),
      ),
    ];
    const resources = [
      ...palette.wallMaterials,
      ...palette.wallMaterials.map((material: any) => material.map),
      ...masks,
      ...palette.roofMaterials,
      ...palette.roofMaterials.map((material: any) => material.map),
      palette.detailMaterial,
    ];
    const verify = auditDisposal(resources);
    try {
      assert.equal(masks.length, 7);
      for (const maskDraw of draws.slice(0, 7)) {
        assert.equal(maskDraw[0].fill, "#000000");
        assert.deepEqual(maskDraw[0].args, [0, 0, 256, 256]);
        assert.ok(maskDraw.some((draw) => draw.fill === "#ffffff"));
      }
      const familyMasks = new Map();
      for (const material of palette.wallMaterials) {
        const shader: any = {
          uniforms: {},
          fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        };
        material.onBeforeCompile(shader, {} as any);
        assert.equal(shader.uniforms.roamNight, shared);
        const family = material.userData.family;
        if (familyMasks.has(family))
          assert.equal(material.emissiveMap, familyMasks.get(family));
        else familyMasks.set(family, material.emissiveMap);
        assert.match(
          shader.fragmentShader,
          /emissiveMap, vec2\(vEmissiveMapUv.x, roamFacadeV\(vEmissiveMapUv.y\)\)/,
        );
        assert.match(
          shader.fragmentShader,
          /totalEmissiveRadiance \*= roamNight/,
        );
        assert.match(
          shader.fragmentShader,
          /map, vec2\(vMapUv.x, roamFacadeV\(vMapUv.y\)\)/,
        );
      }
      assert.equal(palette.roofMaterial.emissiveMap, null);
      palette.setNight(1);
      assert.equal(shared.value, 1);
      palette.setNight(0.45);
      assert.equal(shared.value, 0.45);
      palette.setNight(9);
      assert.equal(shared.value, 1);
      palette.setNight(-1);
      assert.equal(shared.value, 0);
      palette.setNight(NaN);
      assert.equal(shared.value, 0);
    } finally {
      palette.dispose();
      verify();
    }
  });
});

test("sky and river follow the clock while an interior keeps its background and bright exposure", () => {
  withCanvas(() => {
    const scene = new THREE.Scene();
    const renderer: any = {};
    const atmosphere = createCityAtmosphere(renderer, scene);
    const verify = auditDisposal([
      ...atmosphere.materials,
      atmosphere.paving.map,
      atmosphere.asphalt.map,
    ]);
    try {
      const night = lightingForMinute(1320);
      atmosphere.setLighting(night);
      assert.equal(scene.background.getHexString(), night.horizon.slice(1));
      assert.equal(scene.fog.color.getHexString(), night.horizon.slice(1));
      assert.equal(atmosphere.sky.material.uniforms.night.value, 1);
      assert.equal(atmosphere.water.uniforms.night.value, 1);
      assert.equal(
        atmosphere.water.uniforms.reflection.value.getHexString(),
        night.waterReflection.slice(1),
      );
      scene.background = new THREE.Color("#b2b1ad");
      atmosphere.setLighting(lightingForMinute(660), false);
      assert.equal(scene.background.getHexString(), "b2b1ad");
      assert.equal(atmosphere.water.uniforms.night.value, 1);
      assert.equal(
        renderer.toneMappingExposure,
        lightingForMinute(660).exposure,
      );
      atmosphere.setLighting(night);
      assert.equal(scene.background.getHexString(), night.horizon.slice(1));
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(100, 120, 150);
      atmosphere.update(camera, 2, true);
      atmosphere.update(camera, 20, false);
      assert.equal(atmosphere.water.uniforms.time.value, 2);
      assert.equal(atmosphere.water.uniforms.night.value, 1);
      assert.ok(atmosphere.sky.position.equals(camera.position));
    } finally {
      atmosphere.dispose();
      atmosphere.sky.geometry.dispose();
      verify();
    }
  });
});

test("lantern light pools follow sloping terrain, switch off by day and use one extra draw per chunk", () => {
  const geoY = (point: number[]) => point[0] * 0.01 + point[1] * 0.02;
  const group = createLandscape(
    {
      bounds: [0, 0, 200, 200],
      roads: [
        {
          id: 1,
          kind: "residential",
          width: 8,
          points: [
            [20, 100],
            [180, 100],
          ],
        },
      ],
      buildings: [],
      surfaces: [],
    },
    {
      projectGeo: (point: number[]) => ({ x: point[0], z: -point[1] }),
      geoY,
      focusPoint: [100, 100],
    },
  );
  try {
    const lighting = group.userData.lighting;
    assert.ok(lighting.lampAnchors.length > 0);
    const glow = group.getObjectByName("Terrain-draped lantern pools");
    assert.ok(glow);
    assert.equal(
      group.children.filter((child: any) => child.name === glow.name).length,
      1,
    );
    assert.equal(
      glow.geometry.attributes.position.count,
      lighting.lampAnchors.length * 12 * 3,
    );
    const positions = glow.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const point = [positions.getX(i), -positions.getZ(i)];
      assert.ok(Math.abs(positions.getY(i) - geoY(point) - 0.2) < 0.00001);
    }
    const a = new THREE.Vector3().fromBufferAttribute(positions, 0);
    const b = new THREE.Vector3().fromBufferAttribute(positions, 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, 2);
    assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).y > 0);
    let pointLights = 0;
    group.traverse((node: any) => {
      if (node.isPointLight) pointLights++;
    });
    assert.equal(pointLights, 0);
    setLandscapeNight(group, 1);
    assert.equal(lighting.groundStrength.value, 0.32);
    assert.ok(lighting.glass.emissiveIntensity > 1.5);
    setLandscapeNight(group, 0);
    assert.equal(lighting.groundStrength.value, 0);
    assert.equal(lighting.glass.emissiveIntensity, 0.06);
    setLandscapeNight(group, Infinity);
    assert.equal(lighting.groundStrength.value, 0);
    const scene = new THREE.Scene();
    scene.add(group);
    const attached = () =>
      scene.children.flatMap(
        (child: any) => child.userData.lighting?.lampAnchors || [],
      );
    assert.ok(nearestLampAnchors(attached(), { x: 100, z: -100 }).length > 0);
    group.removeFromParent();
    assert.deepEqual(nearestLampAnchors(attached(), { x: 100, z: -100 }), []);
  } finally {
    disposeGroup(group);
  }
});
