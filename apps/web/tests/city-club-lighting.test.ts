import { test } from "node:test";
import assert from "node:assert/strict";
import { createClubLighting } from "../lib/city-club-lighting.js";
const THREE = require("three");
function snapshot(group: any) {
  const values: any[] = [];
  group.traverse((node: any) => {
    values.push([
      node.position.toArray(),
      node.rotation.toArray(),
      node.scale.toArray(),
      node.isLight ? node.intensity : null,
    ]);
  });
  return values;
}

test("original club fixtures have finite bounded geometry and three soft lights without shadow maps", () => {
  const rig = createClubLighting();
  try {
    let meshes = 0,
      lights = 0,
      triangles = 0;
    rig.group.traverse((node: any) => {
      if (node.isLight) {
        lights++;
        assert.equal(node.castShadow, false);
        assert.ok(node.penumbra >= 0.8);
      }
      if (!node.isMesh) return;
      meshes++;
      for (const attribute of Object.values(node.geometry.attributes) as any[])
        for (const value of attribute.array) assert.ok(Number.isFinite(value));
      triangles +=
        (node.geometry.index?.count ||
          node.geometry.attributes.position.count) / 3;
    });
    assert.equal(lights, 3);
    assert.ok(meshes <= 20);
    assert.ok(triangles < 5000);
    assert.ok(rig.group.userData.clubLighting);
  } finally {
    rig.dispose();
  }
});

test("slow lighting stays continuously illuminated, pauses exactly, and reduced motion is steady", () => {
  const rig = createClubLighting();
  try {
    const lamps: any[] = [];
    rig.group.traverse((node: any) => {
      if (node.isLight) lamps.push(node);
    });
    let previous = lamps.map((light) => light.intensity);
    for (let i = 1; i <= 3600; i++) {
      rig.update(i / 60, {
        enabled: true,
        paused: false,
        reducedMotion: false,
      });
      lamps.forEach((light, index) => {
        assert.ok(light.intensity >= 5.75 && light.intensity <= 7.25);
        assert.ok(Math.abs(light.intensity - previous[index]) < 0.005);
      });
      previous = lamps.map((light) => light.intensity);
    }
    const frozen = snapshot(rig.group);
    for (let i = 0; i < 40; i++) rig.update(1000 + i, { paused: true });
    assert.deepEqual(snapshot(rig.group), frozen);
    rig.update(0, { reducedMotion: true });
    const steady = snapshot(rig.group);
    for (let i = 0; i < 40; i++) rig.update(1000 + i, { reducedMotion: true });
    assert.deepEqual(snapshot(rig.group), steady);
    assert.ok(lamps.every((light) => light.intensity === 6.5));
    rig.update(100, { enabled: false });
    assert.equal(rig.group.visible, false);
    rig.update(100, { enabled: true, reducedMotion: true });
    assert.equal(rig.group.visible, true);
  } finally {
    rig.dispose();
  }
});

test("fixture targets follow their translated room and idempotent disposal releases shared resources once", () => {
  const rig = createClubLighting(),
    scene = new THREE.Scene();
  scene.add(rig.group);
  rig.group.position.set(1200, 30, -800);
  scene.updateMatrixWorld(true);
  const geometries = new Set<any>(),
    materials = new Set<any>();
  let geometryDisposals = 0,
    materialDisposals = 0;
  rig.group.traverse((node: any) => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) materials.add(node.material);
    if (node.isLight) {
      const point = node.target.getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(point.x - 1200) < 7 && Math.abs(point.z + 800) < 6);
      assert.equal(point.y, 30.05);
    }
  });
  geometries.forEach((geometry) =>
    geometry.addEventListener("dispose", () => geometryDisposals++),
  );
  materials.forEach((material) =>
    material.addEventListener("dispose", () => materialDisposals++),
  );
  rig.dispose();
  rig.dispose();
  rig.update(300, { enabled: true });
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(scene.children.length, 0);
  assert.equal(rig.group.children.length, 0);
});
