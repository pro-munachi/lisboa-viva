import { test } from "node:test";
import assert from "node:assert/strict";
import { createScenicNpcLod, updateScenicNpcLod } from "../lib/city-npc-lod.js";
import {
  createCharacter,
  animateCharacter,
  disposeCharacter,
} from "../lib/characters.js";
import {
  demographicProfile,
  applyLocalDemographicVisuals,
  poseLocalDemographic,
} from "../lib/npc-demographics.js";
const {
  Box3,
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector3,
  Color,
} = require("three");

function resident(prop = "tote") {
  const profile = demographicProfile("DEMO_001", "lod-role-budget");
  profile.prop = prop;
  const character = createCharacter({
    ...profile.character,
    shirt: "#ed8bb4",
    skin: "#a87955",
    hair: "#302823",
  });
  applyLocalDemographicVisuals(character, profile);
  poseLocalDemographic(character, profile, 0);
  return character;
}
const almost = (actual: number, expected: number, tolerance = 0.000001) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
const cameraAt = (x: number, y = 0, z = 0) => {
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  return camera;
};
function visible(node: any) {
  for (let parent = node; parent; parent = parent.parent)
    if (!parent.visible) return false;
  return true;
}

test("distant mesh retains a real posed human and role prop in character-local coordinates and authored colors", () => {
  const character = resident("stroller");
  try {
    character.position.set(120, 7, -44);
    character.rotation.y = 0.63;
    character.updateMatrixWorld(true);
    const originalBounds = new Box3().setFromObject(character, true),
      originalGeometries = new Set<any>();
    let originalVertices = 0;
    character.traverse((node: any) => {
      if (node.isMesh) {
        originalGeometries.add(node.geometry);
        originalVertices +=
          node.geometry.index?.count || node.geometry.attributes.position.count;
      }
    });
    const proxy = createScenicNpcLod(character)!;
    assert.equal(proxy.geometry.attributes.position.count, originalVertices);
    assert.equal(originalGeometries.has(proxy.geometry), false);
    assert.equal(proxy.material.vertexColors, true);
    assert.equal(proxy.castShadow, false);
    assert.equal(proxy.position.length(), 0);
    const proxyBounds = new Box3().setFromObject(proxy, true);
    for (const axis of ["x", "y", "z"]) {
      almost(proxyBounds.min[axis], originalBounds.min[axis], 0.000005);
      almost(proxyBounds.max[axis], originalBounds.max[axis], 0.000005);
    }
    const colors = proxy.geometry.attributes.color;
    const expected = [
      new Color("#ed8bb4"),
      new Color("#a87955"),
      new Color("#495b56"),
    ];
    for (const color of expected) {
      let found = false;
      for (let i = 0; i < colors.count; i++)
        if (
          Math.abs(colors.getX(i) - color.r) < 1e-6 &&
          Math.abs(colors.getY(i) - color.g) < 1e-6 &&
          Math.abs(colors.getZ(i) - color.b) < 1e-6
        ) {
          found = true;
          break;
        }
      assert.ok(
        found,
        `missing clothing, skin or role color ${color.getHexString()}`,
      );
    }
    for (const attribute of Object.values(proxy.geometry.attributes) as any[])
      for (const value of attribute.array) assert.ok(Number.isFinite(value));
    const before = proxy.geometry.attributes.position.array.slice();
    animateCharacter(character, 2, true);
    assert.deepEqual(
      proxy.geometry.attributes.position.array,
      before,
      "the far pose owns a snapshot, not the animated rig buffers",
    );
  } finally {
    disposeCharacter(character);
  }
});

test("distance hysteresis keeps original rigs nearby and restores originally hidden parts", () => {
  const character = resident(),
    hidden = new Mesh(
      new BoxGeometry(0.1, 0.1, 0.1),
      new MeshStandardMaterial({ color: "#ff0000" }),
    );
  hidden.name = "Born hidden detail";
  hidden.visible = false;
  character.add(hidden);
  try {
    const children = character.children.slice(),
      proxy = createScenicNpcLod(character)!;
    const camera = cameraAt(0, 55, 0);
    assert.equal(updateScenicNpcLod(character, camera), true);
    assert.equal(proxy.visible, false);
    camera.position.y = 55.01;
    assert.equal(updateScenicNpcLod(character, camera), false);
    assert.equal(proxy.visible, true);
    assert.ok(children.every((child: any) => !child.visible));
    camera.position.y = 50;
    assert.equal(updateScenicNpcLod(character, camera), false);
    camera.position.y = 45;
    assert.equal(updateScenicNpcLod(character, camera), false);
    camera.position.y = 44.99;
    assert.equal(updateScenicNpcLod(character, camera), true);
    assert.equal(proxy.visible, false);
    assert.equal(hidden.visible, false);
    assert.equal(children[0].visible, true);
    camera.position.y = 50;
    assert.equal(updateScenicNpcLod(character, camera), true);
    assert.equal(
      createScenicNpcLod(character),
      proxy,
      "creation is idempotent",
    );
    assert.equal(character.children.length, children.length + 1);
  } finally {
    disposeCharacter(character);
  }
});

test("far and near bodies retain one simulated picking identity while route position and heading can move", () => {
  const character = resident(),
    scene = new Group();
  scene.add(character);
  try {
    const proxy = createScenicNpcLod(character)!;
    const person = {
      name: "Duarte",
      label: "Simulated · neighbour",
      simulated: true,
    };
    const meshes: any[] = [];
    character.traverse((node: any) => {
      if (node.isMesh) {
        node.userData.person = person;
        meshes.push(node);
      }
    });
    character.position.set(15, 2, 25);
    character.rotation.y = Math.PI;
    const camera = cameraAt(15, 2, 95);
    assert.equal(updateScenicNpcLod(character, camera), false);
    assert.deepEqual(meshes.filter(visible), [proxy]);
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(proxy, true),
      target = bounds.getCenter(new Vector3());
    const ray = new Raycaster(
      new Vector3(target.x, target.y, target.z + 15),
      new Vector3(0, 0, -1),
    );
    const hits = ray.intersectObjects(meshes.filter(visible), false);
    assert.ok(hits.length > 0);
    assert.equal(hits[0].object.userData.person, person);
    character.position.x += 8;
    character.rotation.y += 0.5;
    scene.updateMatrixWorld(true);
    almost(proxy.matrixWorld.elements[12], character.position.x);
    assert.equal(proxy.userData.person, person);
    camera.position.set(
      character.position.x,
      character.position.y,
      character.position.z + 20,
    );
    assert.equal(updateScenicNpcLod(character, camera), true);
    assert.ok(meshes.filter(visible).length >= 20);
    assert.equal(proxy.visible, false);
    assert.ok(meshes.every((node) => node.userData.person === person));
  } finally {
    disposeCharacter(character);
  }
});

test("updates use world distance under transformed parents and allocate no replacement geometry or scene nodes", () => {
  const character = resident(),
    parent = new Group();
  parent.position.set(5000, 8, 200);
  parent.add(character);
  try {
    character.position.set(5, 0, 4);
    const proxy = createScenicNpcLod(character)!,
      state = character.userData.scenicNpcLod;
    const camera = cameraAt(5005, 8, 274),
      geometry = proxy.geometry,
      material = proxy.material,
      children = character.children.slice();
    assert.equal(updateScenicNpcLod(character, camera), false);
    const worldPoint = state.worldPoint,
      cameraPoint = state.cameraPoint;
    for (let i = 0; i < 300; i++) {
      camera.position.z = i % 2 ? 214 : 274;
      updateScenicNpcLod(character, camera);
      assert.equal(proxy.geometry, geometry);
      assert.equal(proxy.material, material);
      assert.equal(state.worldPoint, worldPoint);
      assert.equal(state.cameraPoint, cameraPoint);
      assert.deepEqual(character.children, children);
    }
    camera.position.z = Infinity;
    const before = state.near;
    assert.equal(updateScenicNpcLod(character, camera), before);
  } finally {
    disposeCharacter(character);
  }
});

test("normal character teardown disposes the independent proxy resources exactly once", () => {
  const first = resident(),
    second = resident();
  const proxy = createScenicNpcLod(first)!,
    other = createScenicNpcLod(second)!;
  assert.notEqual(proxy.geometry, other.geometry);
  assert.notEqual(proxy.material, other.material);
  let geometryDisposed = 0,
    materialDisposed = 0;
  proxy.geometry.addEventListener("dispose", () => geometryDisposed++);
  proxy.material.addEventListener("dispose", () => materialDisposed++);
  const otherBefore = other.geometry.attributes.position.array.slice();
  disposeCharacter(first);
  disposeCharacter(first);
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
  assert.deepEqual(other.geometry.attributes.position.array, otherBefore);
  assert.equal(updateScenicNpcLod(second, cameraAt(100)), false);
  disposeCharacter(second);
});
