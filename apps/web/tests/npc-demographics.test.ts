import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NPC_CATEGORIES,
  NPC_CATEGORY_SOURCE,
  demographicProfile,
  applyLocalDemographicVisuals,
  poseLocalDemographic,
} from "../lib/npc-demographics.js";
import {
  createCharacter,
  animateCharacter,
  disposeCharacter,
} from "../lib/characters.js";
const { Box3 } = require("three");

test("scenic category catalogue matches the user's CSV and uses explicit simulated roles", () => {
  const rows = readFileSync(
    new URL("../../../data/npc_demographic_categories.csv", import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",").slice(0, 2));
  assert.deepEqual(
    NPC_CATEGORIES.map(({ id, name }) => [id, name]),
    rows,
  );
  assert.equal(NPC_CATEGORIES.length, 8);
  for (const category of NPC_CATEGORIES) {
    const profile = demographicProfile(category.id, "lisbon-pedestrian-27");
    assert.equal(profile.categoryId, category.id);
    assert.equal(profile.categoryName, category.name);
    assert.equal(profile.source, NPC_CATEGORY_SOURCE);
    assert.equal(profile.simulated, true);
    assert.match(profile.label, /^Simulated · /);
    assert.ok(profile.speed >= 0.66 && profile.speed <= 1.25);
    for (let seed = 0; seed < 64; seed++) {
      const variant = demographicProfile(category.id, seed);
      assert.ok(
        variant.character.bodyType !== "male" ||
          variant.character.style !== "dress",
        `${category.id}/${seed} male outfit is supported`,
      );
    }
  }
});

test("stable authored profiles keep gender and body type independent of colors or hairstyle", () => {
  for (const [categoryId, gender, bodyType] of [
    ["DEMO_001", "man", "male"],
    ["DEMO_002", "woman", "female"],
  ]) {
    const hairstyles = new Set(),
      skinTones = new Set();
    for (let seed = 0; seed < 64; seed++) {
      const profile = demographicProfile(categoryId, `person-${seed}`);
      assert.deepEqual(
        profile,
        demographicProfile(categoryId, `person-${seed}`),
      );
      assert.equal(profile.gender, gender);
      assert.equal(profile.character.bodyType, bodyType);
      hairstyles.add(profile.character.hairStyle);
      skinTones.add(profile.character.skin);
    }
    assert.equal(hairstyles.size, 4);
    assert.ok(skinTones.size >= 5);
  }
  const child = demographicProfile("DEMO_003", "family-child", {
    groupRole: "child",
    gender: "unspecified",
  });
  assert.equal(child.gender, "unspecified");
  assert.equal(child.role, "child");
  assert.ok(["male", "female"].includes(child.character.bodyType));
});

test("local child proportions are grounded without changing the adult account height contract", () => {
  const profile = demographicProfile("DEMO_003", "small-child", {
    groupRole: "child",
  });
  const accountActor = createCharacter({ height: profile.height });
  const child = createCharacter(profile.character);
  applyLocalDemographicVisuals(child, profile);
  const bounds = new Box3().setFromObject(child);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - profile.height) < 1e-6);
  assert.ok(profile.height < 1.4);
  assert.equal(accountActor.userData.height, 1.4);
  assert.equal(child.userData.height, profile.height);
  assert.ok(
    child.userData.rig.head.scale.x > accountActor.userData.rig.head.scale.x,
  );
  assert.ok(
    child.userData.rig.leftLeg.scale.y <
      accountActor.userData.rig.leftLeg.scale.y,
  );
  const before = bounds.max.y;
  applyLocalDemographicVisuals(child, profile);
  assert.equal(new Box3().setFromObject(child).max.y, before);
  for (const actor of [accountActor, child]) disposeCharacter(actor);
});

test("authored props add at most two batched meshes and dispose with their actor", () => {
  for (const prop of [
    "none",
    "tote",
    "scarf",
    "apron",
    "camera",
    "cane",
    "staff-uniform",
    "stroller",
    "scooter",
  ]) {
    const profile = {
      ...demographicProfile("DEMO_006", prop),
      prop,
      moving: true,
    };
    const actor = createCharacter(profile.character);
    let initialMeshes = 0;
    actor.traverse((node: any) => {
      if (node.isMesh) initialMeshes++;
    });
    applyLocalDemographicVisuals(actor, profile);
    const geometryResources = new Set<any>(),
      materialResources = new Set<any>();
    let meshCount = 0,
      vertices = 0;
    actor.traverse((node: any) => {
      if (!node.isMesh) return;
      meshCount++;
      vertices += node.geometry.attributes.position.count;
      geometryResources.add(node.geometry);
      materialResources.add(node.material);
      for (const value of node.geometry.attributes.position.array)
        assert.ok(Number.isFinite(value), `${prop} has finite geometry`);
    });
    assert.ok(meshCount <= initialMeshes + 2, `${prop} mesh batching`);
    assert.ok(meshCount <= 22, `${prop}: ${meshCount} meshes`);
    assert.ok(vertices < 30_000, `${prop}: ${vertices} vertices`);
    applyLocalDemographicVisuals(actor, profile);
    let reappliedMeshes = 0;
    actor.traverse((node: any) => {
      if (node.isMesh) reappliedMeshes++;
    });
    assert.equal(reappliedMeshes, meshCount, `${prop} is applied only once`);
    let disposedGeometries = 0,
      disposedMaterials = 0;
    for (const geometry of geometryResources)
      geometry.addEventListener("dispose", () => disposedGeometries++);
    for (const material of materialResources)
      material.addEventListener("dispose", () => disposedMaterials++);
    disposeCharacter(actor);
    disposeCharacter(actor);
    assert.equal(disposedGeometries, geometryResources.size);
    assert.equal(disposedMaterials, materialResources.size);
  }
});

test("stroller stance overrides arm swings while route placement and feet remain grounded", () => {
  const profile = demographicProfile("DEMO_003", "caregiver", {
    groupRole: "stroller-caregiver",
    gender: "woman",
  });
  const actor = createCharacter(profile.character);
  applyLocalDemographicVisuals(actor, profile);
  const stroller = actor.getObjectByName("scenic compact stroller");
  assert.ok(stroller);
  const bounds = new Box3().setFromObject(stroller);
  assert.ok(bounds.min.y >= 0);
  assert.ok(bounds.max.z - bounds.min.z > 0.6);
  actor.position.set(80, 5, -20);
  actor.rotation.y = 1.6;
  for (let i = 1; i <= 90; i++) {
    animateCharacter(actor, i / 60, true);
    poseLocalDemographic(actor, profile, i / 60);
    assert.equal(actor.userData.rig.leftArm.rotation.x, -0.62);
    assert.equal(actor.userData.rig.rightArm.rotation.x, -0.62);
  }
  assert.deepEqual(actor.position.toArray(), [80, 5, -20]);
  assert.equal(actor.rotation.y, 1.6);
  disposeCharacter(actor);
});

test("elder and scooter poses are composed after animation without accumulating per frame", () => {
  for (const profile of [
    demographicProfile("DEMO_005", "elder"),
    { ...demographicProfile("DEMO_004", "teen"), prop: "scooter" },
  ]) {
    const actor = createCharacter(profile.character);
    applyLocalDemographicVisuals(actor, profile);
    for (let frame = 0; frame < 60; frame++) {
      animateCharacter(actor, 1, false);
      poseLocalDemographic(actor, { ...profile, moving: false }, 1);
      assert.ok(
        Math.abs(actor.userData.rig.hips.position.y - actor.userData.restHipY) <
          0.101,
      );
      assert.ok(Math.abs(actor.userData.rig.torso.rotation.x) < 0.04);
      if (profile.prop === "scooter") {
        assert.equal(actor.userData.rig.leftLeg.rotation.x, 0);
        assert.equal(actor.userData.rig.rightLeg.rotation.x, 0);
      }
    }
    disposeCharacter(actor);
  }
});

test("market and café neighbours use contextual workwear instead of unrelated staff roles", () => {
  const marketRoles = new Set<string>(),
    cafeRoles = new Set<string>();
  for (let seed = 0; seed < 80; seed++) {
    const shopper = demographicProfile("DEMO_006", `market-${seed}`, {
      context: "market",
    });
    marketRoles.add(shopper.role);
    assert.ok(["shopper", "neighbour", "market-vendor"].includes(shopper.role));
    if (shopper.role === "shopper") assert.equal(shopper.prop, "tote");
    if (shopper.role === "market-vendor") assert.equal(shopper.prop, "apron");
    const cafe = demographicProfile("DEMO_006", `cafe-${seed}`, {
      context: "café",
    });
    cafeRoles.add(cafe.role);
    if (cafe.role === "café-worker") assert.equal(cafe.prop, "apron");
  }
  assert.deepEqual(
    marketRoles,
    new Set(["shopper", "neighbour", "market-vendor"]),
  );
  assert.ok(cafeRoles.has("café-worker"));
  const marketStaff = demographicProfile("DEMO_008", "mercado-worker", {
    context: "market",
  });
  assert.equal(marketStaff.role, "market-staff");
  assert.equal(marketStaff.prop, "apron");
  const transitStaff = demographicProfile("DEMO_008", "station-worker", {
    context: "transit",
  });
  assert.equal(transitStaff.role, "transit-staff");
  assert.equal(transitStaff.prop, "staff-uniform");
});
