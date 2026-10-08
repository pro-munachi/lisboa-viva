import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCharacter,
  animateCharacter,
  disposeCharacter,
  replaceCharacterAppearance,
} from "../lib/characters.js";
const {
  Box3,
  Group,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} = require("three");

test("every outfit and hair variant is a grounded adult with bounded rendering cost", () => {
  for (const style of ["casual", "jacket", "dress", "tourist"]) {
    for (const hairStyle of ["short", "curly", "bob", "bun"]) {
      const character = createCharacter({
        bodyType: style === "dress" ? "female" : "male",
        style,
        hairStyle,
      });
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
      let vertices = 0;
      character.traverse((node: any) => {
        if (!node.isMesh) return;
        meshes++;
        vertices += node.geometry.attributes.position.count;
        for (const value of node.geometry.attributes.position.array)
          assert.ok(Number.isFinite(value));
        for (const value of node.geometry.attributes.normal.array)
          assert.ok(Number.isFinite(value));
      });
      assert.ok(meshes < 40, `${style}/${hairStyle}: ${meshes} meshes`);
      assert.ok(
        vertices < 30_000,
        `${style}/${hairStyle}: ${vertices} vertices`,
      );
      const head = character.getObjectByName("face");
      const headBounds = new Box3().setFromObject(head);
      // An adult head is around 1/7 of total height rather than a toy-sized head.
      assert.ok((headBounds.max.y - headBounds.min.y) / 1.75 < 0.16);
      const facialFeatures =
        character.getObjectByName("facial details").userData.features;
      assert.ok(facialFeatures["eyes eyebrows and mouth"]);
      assert.ok(facialFeatures["eye whites and catchlights"]);
      assert.ok(facialFeatures["lips and inner ears"]);
      assert.ok(
        character.getObjectByName("left forearm and hand details").userData
          .features["left hand"],
      );
      disposeCharacter(character);
    }
  }
});

test("custom colors reach the clothing and face while eye whites stay natural", () => {
  const character = createCharacter({
    shirt: "#687f73",
    skin: "#76513b",
    hair: "#b98452",
    trousers: "#6b5147",
    shoes: "#5c4b42",
    trim: "#777791",
    style: "tourist",
    hairStyle: "bun",
  });
  const color = (name: string) =>
    character.getObjectByName(name).material.color.getHexString();
  assert.equal(color("tailored top"), "687f73");
  assert.equal(color("face"), "76513b");
  assert.equal(color("bun hair"), "b98452");
  assert.equal(color("left thigh"), "6b5147");
  assert.equal(color("left shoe"), "5c4b42");
  assert.equal(
    character.getObjectByName("facial details").userData.features[
      "eye whites and catchlights"
    ].color,
    "fffaf2",
  );
  const wardrobe =
    character.getObjectByName("wardrobe details").userData.features;
  assert.ok(wardrobe["day pack"]);
  assert.ok(wardrobe["backpack pockets zip and handle"]);
  assert.ok(wardrobe["front and back garment seams"]);
  disposeCharacter(character);
});

test("explicit male/female bodies have distinct silhouettes and their supported wardrobe remains grounded", () => {
  const legacy = createCharacter();
  assert.equal(legacy.userData.bodyType, "male");
  disposeCharacter(legacy);
  for (const style of ["casual", "jacket", "dress", "tourist"]) {
    for (const hairStyle of ["short", "curly", "bob", "bun"]) {
      const male = createCharacter({ bodyType: "male", style, hairStyle });
      const female = createCharacter({ bodyType: "female", style, hairStyle });
      assert.equal(female.userData.bodyType, "female");
      assert.equal(female.userData.appearance.bodyType, "female");
      assert.equal(female.userData.style, style);
      assert.equal(male.userData.style, style === "dress" ? "casual" : style);
      assert.equal(female.userData.hairStyle, hairStyle);
      const maleTop = new Box3().setFromObject(
        male.getObjectByName("tailored top"),
      );
      const femaleTop = new Box3().setFromObject(
        female.getObjectByName("tailored top"),
      );
      assert.ok(
        femaleTop.max.x - femaleTop.min.x < maleTop.max.x - maleTop.min.x,
      );
      for (const person of [male, female]) {
        const bounds = new Box3().setFromObject(person);
        assert.ok(Math.abs(bounds.min.y) < 1e-6);
        assert.ok(Math.abs(bounds.max.y - 1.75) < 1e-6);
        let meshes = 0;
        person.traverse((node: any) => {
          if (node.isMesh) meshes++;
        });
        assert.ok(meshes <= 20);
        disposeCharacter(person);
      }
    }
  }
});

test("saved hair enums produce distinct male and female silhouettes rather than relabeled shared geometry", () => {
  for (const hairStyle of ["short", "curly", "bob", "bun"]) {
    const male = createCharacter({ bodyType: "male", hairStyle });
    const female = createCharacter({ bodyType: "female", hairStyle });
    const maleHair = male.getObjectByName(`${hairStyle} hair`),
      femaleHair = female.getObjectByName(`${hairStyle} hair`);
    assert.notDeepEqual(
      Array.from(maleHair.geometry.attributes.position.array),
      Array.from(femaleHair.geometry.attributes.position.array),
    );
    maleHair.geometry.computeBoundingBox();
    femaleHair.geometry.computeBoundingBox();
    const maleBounds = maleHair.geometry.boundingBox,
      femaleBounds = femaleHair.geometry.boundingBox;
    if (hairStyle === "short") {
      assert.ok(
        maleBounds.max.z < femaleBounds.max.z,
        "pixie has a longer swept fringe than the fade",
      );
    } else if (hairStyle === "curly") {
      assert.ok(
        maleBounds.max.x - maleBounds.min.x <
          femaleBounds.max.x - femaleBounds.min.x,
      );
      assert.ok(
        maleBounds.min.y > femaleBounds.min.y,
        "full curls extend lower around the face",
      );
    } else if (hairStyle === "bob") {
      assert.ok(
        maleBounds.min.y > femaleBounds.min.y + 0.03,
        "medium swept waves stay above the chin-length bob",
      );
    } else {
      assert.ok(
        maleBounds.max.y > femaleBounds.max.y + 0.025,
        "top knot is higher than the tied bun",
      );
      assert.ok(
        maleBounds.min.z > femaleBounds.min.z,
        "tied bun projects behind the head",
      );
    }
    disposeCharacter(male);
    disposeCharacter(female);
  }
});

test("male polo and explorer cuts differ from female tees and cropped jackets, with a safe legacy dress fallback", () => {
  for (const style of ["casual", "jacket", "tourist"]) {
    const male = createCharacter({ bodyType: "male", style });
    const female = createCharacter({ bodyType: "female", style });
    const maleWardrobe = male.getObjectByName("wardrobe details"),
      femaleWardrobe = female.getObjectByName("wardrobe details");
    assert.notDeepEqual(
      Array.from(maleWardrobe.geometry.attributes.position.array),
      Array.from(femaleWardrobe.geometry.attributes.position.array),
    );
    if (style === "jacket") {
      const maleTop = male.getObjectByName("tailored top").geometry,
        femaleTop = female.getObjectByName("tailored top").geometry;
      maleTop.computeBoundingBox();
      femaleTop.computeBoundingBox();
      assert.ok(femaleTop.boundingBox.min.y > maleTop.boundingBox.min.y + 0.05);
      assert.ok(
        femaleTop.boundingBox.max.y - femaleTop.boundingBox.min.y <
          maleTop.boundingBox.max.y - maleTop.boundingBox.min.y,
      );
    } else {
      assert.ok(maleWardrobe.userData.features["collar and garment trim"]);
      assert.ok(
        femaleWardrobe.userData.features["scoop neckline and garment trim"],
      );
    }
    disposeCharacter(male);
    disposeCharacter(female);
  }
  const legacy = createCharacter({ bodyType: "male", style: "dress" });
  const casual = createCharacter({ bodyType: "male", style: "casual" });
  const dress = createCharacter({ bodyType: "female", style: "dress" });
  assert.equal(legacy.userData.style, "casual");
  assert.equal(legacy.userData.appearance.outfitStyle, "casual");
  for (const name of ["tailored top", "wardrobe details", "left thigh"])
    assert.deepEqual(
      Array.from(
        legacy.getObjectByName(name).geometry.attributes.position.array,
      ),
      Array.from(
        casual.getObjectByName(name).geometry.attributes.position.array,
      ),
    );
  assert.equal(legacy.getObjectByName("waist and skirt details"), undefined);
  assert.ok(
    dress.getObjectByName("waist and skirt details").userData.features.skirt,
  );
  disposeCharacter(legacy);
  disposeCharacter(casual);
  disposeCharacter(dress);
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

test("rounded knees remain visually sealed through walking and seated poses", () => {
  for (const options of [
    { bodyType: "male", style: "jacket" },
    { bodyType: "female", style: "dress" },
    { bodyType: "female", style: "tourist" },
  ]) {
    const actor = createCharacter(options);
    const ray = new Raycaster();
    const rig = actor.userData.rig;
    const checkKnees = () => {
      actor.updateMatrixWorld(true);
      for (const side of ["left", "right"]) {
        const center = rig[`${side}Knee`].getWorldPosition(new Vector3());
        for (const offset of [-0.025, 0, 0.025]) {
          ray.set(
            new Vector3(center.x, center.y + offset, 5),
            new Vector3(0, 0, -1),
          );
          assert.ok(
            ray.intersectObject(actor, true).length > 0,
            `${options.bodyType}/${options.style} ${side} knee stays covered`,
          );
        }
      }
    };
    checkKnees();
    for (let frame = 1; frame <= 90; frame++) {
      animateCharacter(actor, frame / 60, true);
      if (frame % 10 === 0) checkKnees();
    }
    rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -Math.PI / 2;
    rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = Math.PI / 2;
    checkKnees();
    disposeCharacter(actor);
  }
});

test("jackets reveal a shaped inner shirt and the face has a short integrated neckline", () => {
  for (const bodyType of ["male", "female"]) {
    const actor = createCharacter({ bodyType, style: "jacket" });
    const top = actor.getObjectByName("tailored top"),
      face = actor.getObjectByName("face");
    assert.equal(top.material.flatShading, false);
    assert.equal(face.material.flatShading, false);
    const topBounds = new Box3().setFromObject(top),
      faceBounds = new Box3().setFromObject(face);
    assert.ok(
      faceBounds.min.y - topBounds.max.y < 0.06,
      "neck connects close to the clothing",
    );
    const torso = actor.userData.rig.torso;
    const chest = torso.localToWorld(new Vector3(0, 0.22, 0));
    const ray = new Raycaster(
      new Vector3(chest.x, chest.y, 5),
      new Vector3(0, 0, -1),
    );
    const hit = ray.intersectObject(actor, true)[0];
    assert.equal(
      hit.object.name,
      "wardrobe details",
      "jacket front opens onto the inner shirt",
    );
    const color = hit.object.geometry.attributes.color;
    const palette = new (require("three").Color)("#f6f0e5");
    assert.ok(Math.abs(color.getX(hit.face.a) - palette.r) < 1e-6);
    assert.ok(Math.abs(color.getY(hit.face.a) - palette.g) < 1e-6);
    assert.ok(Math.abs(color.getZ(hit.face.a) - palette.b) < 1e-6);
    const details = actor.getObjectByName("facial details").geometry;
    details.computeBoundingBox();
    assert.ok(
      details.boundingBox.max.z < 0.11,
      "eyes and nose stay integrated with the face",
    );
    disposeCharacter(actor);
  }
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
  disposeCharacter(character);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(character.parent, null);
});

test("live wardrobe replacement preserves route, seated activity pose and badges without reusing normalized scale", () => {
  const old = createCharacter({
    height: 1.82,
    hairStyle: "short",
    phase: 0.65,
  });
  const parent = new Group();
  parent.add(old);
  old.name = "local traveller";
  old.position.set(17, 4.6, -32);
  old.rotation.set(0.03, 1.1, -0.04);
  animateCharacter(old, 2.25, true);
  old.userData.rig.hips.position.y = old.userData.restHipY - 0.42;
  old.userData.rig.torso.rotation.x = 0.13;
  old.userData.rig.leftLeg.rotation.x = -Math.PI / 2;
  old.userData.rig.rightLeg.rotation.x = -Math.PI / 2;
  old.userData.rig.leftKnee.rotation.x = Math.PI / 2;
  old.userData.rig.rightKnee.rotation.x = Math.PI / 2;
  old.userData.rig.rightElbow.rotation.x = -0.7;
  old.userData.activeZone = "café table";
  old.getObjectByName("face").userData.peer = { id: "shared visitor" };
  old.scale.multiplyScalar(0.84);
  const savedPosition = old.position.toArray();
  const savedRotation = old.quaternion.toArray();
  const savedMotion = old.userData.motion;
  const savedTime = old.userData.lastTime;
  const poses = Object.fromEntries(
    Object.entries(old.userData.rig).map(([key, value]: [string, any]) => [
      key,
      {
        rotation: value.quaternion.toArray(),
        position: value.position.toArray(),
        scale: value.scale.toArray(),
      },
    ]),
  );
  const ownedGeometries = new Set<any>(),
    ownedMaterials = new Set<any>();
  let geometryDisposals = 0,
    materialDisposals = 0,
    badgeDisposals = 0;
  old.traverse((node: any) => {
    if (!node.isMesh) return;
    ownedGeometries.add(node.geometry);
    ownedMaterials.add(node.material);
  });
  for (const geometry of ownedGeometries)
    geometry.addEventListener("dispose", () => geometryDisposals++);
  for (const material of ownedMaterials)
    material.addEventListener("dispose", () => materialDisposals++);
  const badge = new Mesh(
    new BoxGeometry(0.2, 0.05, 0.01),
    new MeshBasicMaterial(),
  );
  badge.name = "YOU badge";
  badge.position.set(0, 2.6, 0);
  badge.geometry.addEventListener("dispose", () => badgeDisposals++);
  badge.material.addEventListener("dispose", () => badgeDisposals++);
  old.add(badge);
  const appearance = {
    bodyType: "female",
    outfitStyle: "jacket",
    topColor: "#777791",
    bottomColor: "#4e504b",
    hairStyle: "curly",
    hairColor: "#6a4430",
    skinTone: "#d5af8b",
    shoeColor: "#292d31",
  };
  const replacement = replaceCharacterAppearance(old, appearance);
  const stand = createCharacter({
    bodyType: "female",
    height: 1.82,
    style: "jacket",
    hairStyle: "curly",
  });
  assert.notEqual(replacement, old);
  assert.equal(replacement.parent, parent);
  assert.equal(old.parent, null);
  assert.equal(replacement.name, "local traveller");
  assert.deepEqual(replacement.position.toArray(), savedPosition);
  assert.deepEqual(replacement.quaternion.toArray(), savedRotation);
  assert.deepEqual(replacement.scale.toArray(), stand.scale.toArray());
  assert.deepEqual(replacement.userData.appearance, appearance);
  assert.equal(replacement.userData.phase, 0.65);
  assert.equal(replacement.userData.motion, savedMotion);
  assert.equal(replacement.userData.lastTime, savedTime);
  assert.equal(replacement.userData.activeZone, "café table");
  assert.deepEqual(replacement.getObjectByName("face").userData.peer, {
    id: "shared visitor",
  });
  for (const [key, pose] of Object.entries(poses)) {
    const joint = replacement.userData.rig[key];
    assert.deepEqual(joint.quaternion.toArray(), pose.rotation, key);
    assert.deepEqual(joint.scale.toArray(), pose.scale, key);
    if (key !== "hips") {
      const oldRest = old.userData.restJointPositions[key];
      const newRest = replacement.userData.restJointPositions[key];
      const expected = pose.position.map(
        (value: number, i: number) => newRest[i] + value - oldRest[i],
      );
      for (let i = 0; i < 3; i++)
        assert.ok(
          Math.abs(joint.position.toArray()[i] - expected[i]) < 1e-9,
          key,
        );
    }
  }
  assert.ok(
    Math.abs(
      replacement.userData.rig.hips.position.y -
        replacement.userData.restHipY +
        0.42,
    ) < 1e-9,
  );
  assert.equal(badge.parent, replacement);
  assert.deepEqual(badge.position.toArray(), [0, 2.6, 0]);
  assert.equal(badgeDisposals, 0);
  assert.equal(geometryDisposals, ownedGeometries.size);
  assert.equal(materialDisposals, ownedMaterials.size);
  disposeCharacter(old);
  assert.equal(geometryDisposals, ownedGeometries.size);
  assert.equal(materialDisposals, ownedMaterials.size);
  disposeCharacter(replacement);
  assert.equal(badgeDisposals, 2);
  disposeCharacter(stand);
});
