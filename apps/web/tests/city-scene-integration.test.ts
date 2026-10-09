import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detailedCityLayerIds,
  cityRoadSurfaceLayers,
  cityActorSpaceIsClear,
  clearCityPlayerSpawn,
  exteriorPlayerCamera,
  planSceneryApproach,
} from "../lib/city-scene.js";
import {
  createNavigationWorld,
  navigationPointIsClear,
  moveWithCollisions,
} from "../lib/city-navigation.js";
import { createCharacter } from "../lib/characters.js";
import { sceneryActions } from "../lib/scenery-actions";
import { safeRoadRibbonGeometry } from "../lib/city-rendering.js";

const THREE = require("three");
const source = readFileSync(
  new URL("../lib/city-scene.js", import.meta.url),
  "utf8",
);
const method = (name: string, next: string) =>
  source.slice(
    source.indexOf(`  function ${name}(`),
    source.indexOf(`  function ${next}(`),
  );
const world = (overrides: any = {}) =>
  createNavigationWorld({
    target: { x: 0, z: 0 },
    radius: 80,
    projectGeo: ([x, z]: number[]) => ({ x, z }),
    elevationAt: () => 0,
    ...overrides,
  });

test("source ownership suppresses a complete long road without trimming its geometry or masking unrelated source ways", () => {
  const line = {
    id: 17,
    points: [
      [-300, 0],
      [400, 0],
    ],
  };
  const chunk = {
    roads: [line],
    surfaces: [
      {
        id: 23,
        ring: [
          [0, 0],
          [3, 0],
          [0, 3],
        ],
      },
    ],
  };
  const ids = detailedCityLayerIds([chunk]);
  assert.equal(ids.roads.has(17), true);
  assert.equal(ids.roads.has(18), false);
  assert.equal(ids.surfaces.has(23), true);
  assert.deepEqual(line.points, [
    [-300, 0],
    [400, 0],
  ]);
  assert.equal(detailedCityLayerIds([]).roads.size, 0);
});

test("mapped footways never share asphalt depth and sidewalk geometry stays outside the driving lanes", () => {
  const road = { kind: "primary", width: 8 };
  const footway = { kind: "footway", width: 2 };
  const context = {
    projectGeo: ([x, z]: number[]) => ({ x, z }),
    unprojectGeo: (x: number, z: number) => [x, z],
    geoY: () => 0,
  };
  const layers = cityRoadSurfaceLayers(road);
  assert.equal(layers.length, 3);
  const asphalt = layers[0];
  const pedestrian = cityRoadSurfaceLayers(footway)[0];
  assert.ok(asphalt.lift - pedestrian.lift >= 0.07);
  assert.equal(cityRoadSurfaceLayers(road, false).length, 1);
  for (const layer of layers.filter((layer: any) => layer.kind === "paving")) {
    const geometry = safeRoadRibbonGeometry(
      [
        [0, 0],
        [20, 0],
      ],
      layer.width,
      context,
      { side: layer.side, lift: layer.lift },
    );
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    assert.ok(
      box.min.z >= 4 || box.max.z <= -4,
      "paving must leave the entire carriageway empty",
    );
    geometry.dispose();
  }
  const crossed = safeRoadRibbonGeometry(
    [
      [10, -8],
      [10, 8],
    ],
    footway.width,
    context,
    { lift: pedestrian.lift },
  );
  const base = safeRoadRibbonGeometry(
    [
      [0, 0],
      [20, 0],
    ],
    road.width,
    context,
    { lift: asphalt.lift },
  );
  crossed.computeBoundingBox();
  base.computeBoundingBox();
  assert.ok(base.boundingBox.min.y > crossed.boundingBox.max.y + 0.07);
  crossed.dispose();
  base.dispose();
});

test("arrivals choose free pavement around current NPCs and vehicle capsules instead of spawning inside a person", () => {
  const navigation = world({
    buildings: [
      {
        id: "facade",
        height: 10,
        ring: [
          [-4, -2],
          [4, -2],
          [4, 0],
          [-4, 0],
        ],
      },
    ],
  });
  const preferred = { x: 0, z: 0.8 };
  const actors = [
    { id: "local", x: 0, y: 0, z: 0.8, radius: 0.36 },
    { id: "bus", x: 2, y: 0, z: 1, radius: 1.37 },
  ];
  assert.equal(cityActorSpaceIsClear({ ...preferred, y: 0 }, actors), false);
  const spawn = clearCityPlayerSpawn(navigation, preferred, actors);
  assert.ok(spawn);
  assert.equal(navigationPointIsClear(navigation, spawn), true);
  assert.equal(cityActorSpaceIsClear({ ...spawn, y: 0 }, actors), true);
  assert.ok(Math.hypot(spawn.x - preferred.x, spawn.z - preferred.z) < 3);
  assert.equal(
    cityActorSpaceIsClear({ ...preferred, y: 0 }, [{ ...actors[0], y: 8 }]),
    true,
  );
  assert.equal(
    clearCityPlayerSpawn(world({ waterAt: () => true }), preferred, actors),
    null,
  );
});

test("scenery approach finds an exterior path around mapped walls and reserved furniture", () => {
  const bench = {
    id: "bench:one",
    kind: "bench",
    name: "Garden bench",
    x: 5,
    z: 0,
    radius: 1.2,
    angle: 0,
    source: "authored",
  };
  const navigation = world({
    buildings: [
      {
        id: "wall",
        height: 8,
        ring: [
          [1, -2],
          [3, -2],
          [3, 2],
          [1, 2],
        ],
      },
    ],
    reservations: [bench],
  });
  const approach = planSceneryApproach(navigation, { x: 0, z: 0 }, bench);
  assert.ok(approach);
  assert.ok(approach.route.length > 1);
  assert.equal(navigationPointIsClear(navigation, approach.goal), true);
  let position = { x: 0, z: 0 };
  for (const next of approach.route) {
    const result = moveWithCollisions(navigation, position, {
      x: next.x - position.x,
      z: next.z - position.z,
    });
    assert.ok(Math.hypot(result.x - next.x, result.z - next.z) < 0.05);
    position = result;
  }
});

test("scenery cannot award a visit to an unreachable island or a distant object", () => {
  const island = world({ waterAt: (point: any) => point.x > 1 && point.x < 4 });
  assert.equal(
    planSceneryApproach(island, { x: 0, z: 0 }, { x: 8, z: 0, radius: 1 }),
    null,
  );
  assert.equal(
    planSceneryApproach(world(), { x: 0, z: 0 }, { x: 200, z: 0 }),
    null,
  );
  assert.equal(
    planSceneryApproach(world(), { x: 0, z: 0 }, { x: NaN, z: 0 }),
    null,
  );
});

test("street camera chooses an open exterior angle with the whole avatar in view", () => {
  const navigation = world({
    buildings: [
      {
        id: "facade",
        height: 20,
        ring: [
          [-8, -12],
          [8, -12],
          [8, -3],
          [-8, -3],
        ],
      },
    ],
  });
  const player = { position: { x: 0, y: 0.2, z: 0 }, rotation: { y: 0 } };
  const framed = exteriorPlayerCamera(navigation, player);
  assert.ok(framed.camera.y > framed.target.y + 3);
  assert.ok(Math.hypot(framed.camera.x, framed.camera.z) >= 8);
  assert.ok(framed.camera.z > -3 || Math.abs(framed.camera.x) > 8);
  assert.ok(Math.abs(framed.target.y - 1.35) < 1e-6);
});

function sceneryHarness() {
  const bench = {
    id: "bench:one",
    kind: "bench",
    name: "Garden bench",
    x: 4,
    z: 0,
    angle: 0,
    radius: 1.2,
    source: "authored",
  };
  const character = createCharacter();
  const env: any = {
    destroyed: false,
    player: character,
    playerTarget: new THREE.Vector3(),
    sceneryObjects: new Map([[bench.id, bench]]),
    sceneryTask: null,
    navigation: world({ reservations: [bench] }),
    walkRoute: [],
    travel: { active: false },
    indoor: { active: false },
    characterGallery: null,
    followPlayer: false,
    followState: { initialized: false },
    camera: new THREE.PerspectiveCamera(),
    controls: { target: new THREE.Vector3(), minDistance: 8 },
    motion: true,
    reduce: false,
    clearLocationFocus() {},
    framePlayer() {},
    unprojectGeo: (x: number, z: number) => [x, z],
    geoY: () => 0,
    planSceneryApproach,
    sceneryActions,
  };
  env.camera.position.set(0, 7, 11);
  const api = new Function(
    "THREE",
    "env",
    `with(env) {
    ${method("resetPlayerPose", "cancelScenery")}
    ${method("cancelScenery", "startWalking")}
    ${method("performScenery", "updateSceneryTask")}
    ${method("updateSceneryTask", "canvasLabel")}
    return {performScenery,updateSceneryTask,cancelScenery};
  }`,
  )(THREE, env);
  return { env, api, bench };
}

test("the actual scene action promise resolves only after physical arrival and its seated pose completes", async () => {
  const { env, api, bench } = sceneryHarness();
  const promise = api.performScenery(bench, "sit");
  let resolved = false;
  promise.then(() => {
    resolved = true;
  });
  api.updateSceneryTask(1, 1);
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(env.sceneryTask.phase, "walking");
  assert.ok(env.walkRoute.length);
  const goal = env.sceneryTask.goal;
  env.walkRoute = [];
  env.player.position.set(goal.x, 0.2, goal.z);
  api.updateSceneryTask(0.5, 1.5);
  assert.equal(env.sceneryTask.phase, "active");
  assert.equal(env.sceneryTask.mounted, true);
  assert.ok(env.player.userData.rig.leftLeg.rotation.x < -1);
  assert.equal(env.player.position.x, bench.x);
  assert.equal(resolved, false);
  api.updateSceneryTask(1.4, 2.9);
  assert.equal(await promise, true);
  assert.equal(env.sceneryTask, null);
  assert.equal(env.player.position.x, goal.x);
  assert.equal(env.player.userData.rig.leftLeg.rotation.x, 0);
});

test("cancelling a scenery action rejects the pending reward gate and restores a mounted avatar safely", async () => {
  const { env, api, bench } = sceneryHarness();
  const promise = api.performScenery(bench, "sit");
  const goal = env.sceneryTask.goal;
  env.walkRoute = [];
  env.player.position.set(goal.x, 0.2, goal.z);
  api.updateSceneryTask(0.5, 0.5);
  api.cancelScenery();
  assert.equal(await promise, false);
  assert.equal(env.sceneryTask, null);
  assert.equal(env.player.position.x, goal.x);
  assert.equal(env.player.userData.rig.leftLeg.rotation.x, 0);
  assert.equal(env.walkRoute.length, 0);
  assert.equal(await api.performScenery(bench, "invented-action"), false);
  assert.equal(
    await api.performScenery({ ...bench, id: "missing" }, "sit"),
    false,
  );
});

test("an actor that leaves and re-enters keeps its original full vehicle capsule width", () => {
  const actor = new THREE.Group();
  actor.position.set(4, 0, 7);
  actor.rotation.y = Math.PI / 2;
  const obstacle: any = { x: 0, z: 0, radius: 1.37 };
  const env: any = {
    collisionActors: [{ actor, obstacle, offset: 3.8, radius: 1.37 }],
    dynamicObstacles: [],
  };
  const update = new Function(
    "env",
    `with(env) {${method("updateCollisionActors", "resetPlayerPose")} return updateCollisionActors;}`,
  )(env);
  actor.visible = false;
  update();
  assert.equal(obstacle.radius, 0);
  assert.equal(env.dynamicObstacles.length, 0);
  actor.visible = true;
  update();
  assert.equal(obstacle.radius, 1.37);
  assert.equal(obstacle.x, 7.8);
  assert.equal(obstacle.z, 7);
  assert.equal(env.dynamicObstacles.length, 1);
});

test("scene actor circles retain elevation so a player can pass underneath an overpass vehicle", () => {
  const actor = new THREE.Group();
  actor.position.set(4, 8, 0);
  const obstacle: any = { id: "bus", x: 0, y: 0, z: 0, radius: 1.37 };
  const env: any = {
    collisionActors: [{ actor, obstacle, offset: 0, radius: 1.37 }],
    dynamicObstacles: [],
  };
  const update = new Function(
    "env",
    `with(env) {${method("updateCollisionActors", "resetPlayerPose")} return updateCollisionActors;}`,
  )(env);
  update();
  assert.equal(obstacle.y, 8);
  const navigation = world();
  const under = moveWithCollisions(
    navigation,
    { x: 0, y: 0, z: 0 },
    { x: 8, z: 0 },
    { dynamic: env.dynamicObstacles },
  );
  assert.equal(under.x, 8);
  actor.position.y = 0;
  update();
  const sameLevel = moveWithCollisions(
    navigation,
    { x: 0, y: 0, z: 0 },
    { x: 8, z: 0 },
    { dynamic: env.dynamicObstacles },
  );
  assert.ok(sameLevel.x < 4 - 1.37);
  actor.visible = false;
  update();
  assert.equal(
    moveWithCollisions(
      navigation,
      { x: 0, y: 0, z: 0 },
      { x: 8, z: 0 },
      { dynamic: env.dynamicObstacles },
    ).x,
    8,
  );
});

test("scene lifecycle cancels outstanding action promises before any focus, travel, interior or teardown", () => {
  for (const [name, next] of [
    ["setFocus", "loadOverview"],
    ["overview", "resize"],
    ["characters", "people"],
    ["setInterior", ""],
  ]) {
    const body = next
      ? method(name, next)
      : source.slice(source.indexOf(`  function ${name}(`));
    assert.ok(
      body.includes("cancelScenery()"),
      `${name} must cancel the action gate`,
    );
  }
  assert.ok(method("startTravel", "setTime").includes("cancelScenery()"));
  assert.match(source, /dispose\(\) \{\s+cancelScenery\(\)/);
  assert.ok(source.includes("junctions: traffic?.junctions || []"));
  assert.ok(source.includes("refreshRoadPaths();"));
  assert.ok(source.includes("externalVehicles: tramTraffic?.vehicles || []"));
  assert.ok(source.includes("externalVehicles: traffic?.vehicles || []"));
  assert.ok(source.includes("moveWithCollisions("));
  assert.ok(source.includes("yieldGroups.has(a.groupId)"));
});
