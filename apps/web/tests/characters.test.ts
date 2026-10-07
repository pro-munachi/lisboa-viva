import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCharacter,
  animateCharacter,
  disposeCharacter,
} from "../lib/characters.js";
const { Box3 } = require("three");

test("every outfit and hair variant is a grounded adult with bounded rendering cost", () => {
  for (const style of ["casual", "jacket", "dress", "tourist"]) {
    for (const hairStyle of ["short", "curly", "bob", "bun"]) {
      const character = createCharacter({ style, hairStyle });
      const bounds = new Box3().setFromObject(character);
      assert.ok(
        Math.abs(bounds.min.y) < 0.000001,
        `${style}/${hairStyle} feet`,
      );
      assert.ok(
        Math.abs(bounds.max.y - 1.75) < 0.000001,
        `${style}/${hairStyle} height`,
      );
      assert.ok(bounds.max.x - bounds.min.x < 0.7);
      let meshes = 0;
      character.traverse((node: any) => {
        if (!node.isMesh) return;
        meshes++;
        for (const value of node.geometry.attributes.position.array)
          assert.ok(Number.isFinite(value));
        for (const value of node.geometry.attributes.normal.array)
          assert.ok(Number.isFinite(value));
      });
      assert.ok(meshes < 40, `${style}/${hairStyle}: ${meshes} meshes`);
      const head = character.getObjectByName("face");
      const headBounds = new Box3().setFromObject(head);
      // An adult head is around 1/7 of total height rather than a toy-sized head.
      assert.ok((headBounds.max.y - headBounds.min.y) / 1.75 < 0.16);
      assert.ok(character.getObjectByName("eyes eyebrows and mouth"));
      assert.ok(character.getObjectByName("left hand"));
      disposeCharacter(character);
    }
  }
});

test("walking swings opposite limbs and articulated knees without moving the route root", () => {
  const character = createCharacter({ phase: 0.5 });
  character.position.set(10, 7, -4);
  character.rotation.y = 1.2;
  for (let i = 1; i <= 120; i++) animateCharacter(character, i / 60, true);
  const rig = character.userData.rig;
  assert.ok(Math.abs(rig.leftLeg.rotation.x) > 0.05);
  assert.ok(
    Math.abs(rig.leftLeg.rotation.x + rig.rightLeg.rotation.x) < 0.000001,
  );
  assert.ok(rig.leftLeg.rotation.x * rig.leftArm.rotation.x < 0);
  assert.ok(rig.leftKnee.rotation.x >= 0 && rig.rightKnee.rotation.x >= 0);
  assert.ok(rig.leftKnee.rotation.x + rig.rightKnee.rotation.x > 0);
  assert.ok(rig.leftElbow.rotation.x < 0 && rig.rightElbow.rotation.x < 0);
  assert.deepEqual(character.position.toArray(), [10, 7, -4]);
  assert.equal(character.rotation.y, 1.2);
  for (let i = 121; i <= 240; i++) animateCharacter(character, i / 60, false);
  assert.ok(Math.abs(rig.leftLeg.rotation.x) < 0.0001);
  assert.ok(
    Math.abs(rig.hips.position.y - character.userData.restHipY) < 0.0001,
  );
  const before = rig.leftLeg.rotation.x;
  animateCharacter(character, Number.NaN, true);
  assert.equal(rig.leftLeg.rotation.x, before);
  disposeCharacter(character);
});

test("disposing a character releases each resource once and detaches it", () => {
  const character = createCharacter({ style: "tourist", hairStyle: "curly" });
  const geometries = new Set<any>(),
    materials = new Set<any>();
  let geometryDisposals = 0,
    materialDisposals = 0;
  character.traverse((node: any) => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    materials.add(node.material);
  });
  for (const geometry of geometries)
    geometry.addEventListener("dispose", () => geometryDisposals++);
  for (const material of materials)
    material.addEventListener("dispose", () => materialDisposals++);
  disposeCharacter(character);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(character.parent, null);
});
