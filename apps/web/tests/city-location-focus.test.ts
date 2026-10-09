import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createLocationFocus,
  locationCameraView,
  locationTreeObstacles,
} from "../lib/city-location-focus";
import { cityActorSpaceIsClear } from "../lib/city-scene.js";

const THREE = require("three");
const footprint = [
  { x: -6, z: -8 },
  { x: 6, z: -8 },
  { x: 6, z: 0 },
  { x: -6, z: 0 },
];
const framed = () =>
  locationCameraView({
    point: { x: 0, z: 0.1 },
    normal: { x: 0, z: 1 },
    groundY: 3,
    elevationAt: () => 3,
    footprints: [footprint],
  })!;

test("location arrival places the visitor in front of a mapped facade, clear of terraces, traffic and water", () => {
  const source = { x: 0, z: 0.1 },
    original = { ...source };
  const view = locationCameraView({
    point: source,
    normal: { x: 0, z: 1 },
    footprints: [footprint],
    reservations: [{ x: 0, z: 2.7, radius: 1.2 }],
    waterAt: (p: any) => p.z > 20,
    elevationAt: (p: any) => 3 + p.x * 0.01,
    safeAt: (p: any) => p.z < 5,
  })!;
  assert.ok(view);
  assert.deepEqual(source, original);
  assert.ok(view.player.z > 0.65 && view.player.z < 5);
  assert.ok(Math.hypot(view.player.x, view.player.z - 2.7) >= 1.85);
  assert.equal(view.player.y, 3 + view.player.x * 0.01 + 0.2);
  assert.ok(view.camera.z > 0 && view.camera.z <= 20);
  assert.equal(
    view.angle,
    Math.atan2(view.camera.x - view.player.x, view.camera.z - view.player.z),
  );
});

test("a generic terminal pin inside a footprint uses the closest exterior edge; enclosed or wet scenes fail safely", () => {
  const view = locationCameraView({
    point: { x: 0, z: -1 },
    footprints: [footprint],
  })!;
  assert.ok(view);
  assert.ok(
    view.player.z > 0.65,
    "the closest facade is the front edge, not the roof center",
  );
  assert.equal(
    locationCameraView({ point: { x: 0, z: 0 }, waterAt: () => true }),
    null,
  );
  assert.equal(locationCameraView({ point: { x: NaN, z: 0 } }), null);
});

test("beach arrivals stay inland and keep both the visitor and shoreline context in the camera view", () => {
  for (const aspect of [1.65, 0.46]) {
    const view = locationCameraView({
      point: { x: 0, z: 0 },
      waterAt: (p: any) => p.z >= 5,
      beachView: { seaward: { x: 0, z: 1 } },
      aspect,
    })!;
    assert.ok(view.player.z < 0 && view.camera.z < 0);
    const camera = new THREE.PerspectiveCamera(43, aspect, 0.3, 90000);
    camera.position.set(view.camera.x, view.camera.y, view.camera.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
    camera.updateMatrixWorld();
    for (const subject of [
      view.player,
      { ...view.player, y: view.player.y + 1.8 },
    ]) {
      const projected = new THREE.Vector3(
        subject.x,
        subject.y,
        subject.z,
      ).project(camera);
      assert.ok(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95);
    }
  }
});

function runtime(reducedMotion = false) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(43);
  camera.position.set(100, 90, 80);
  const controls = { target: new THREE.Vector3(10, 0, 10), update() {} };
  const player = new THREE.Group();
  const view = framed();
  player.position.set(view.player.x, view.player.y, view.player.z);
  return {
    scene,
    camera,
    controls,
    player,
    view,
    focus: createLocationFocus({ scene, camera, controls, reducedMotion }),
  };
}

test("camera selection settles after its full 650 ms zoom and superseding or interrupted shots resolve false", async () => {
  const { focus, camera, player, view, controls } = runtime();
  let completed = false;
  const shot = focus.start(view, player).then((value: boolean) => {
    completed = value;
    return value;
  });
  focus.update(0.3, player);
  await Promise.resolve();
  assert.equal(completed, false);
  assert.notDeepEqual(camera.position.toArray(), [
    view.camera.x,
    view.camera.y,
    view.camera.z,
  ]);
  focus.update(0.35, player);
  assert.equal(await shot, true);
  assert.deepEqual(camera.position.toArray(), [
    view.camera.x,
    view.camera.y,
    view.camera.z,
  ]);
  assert.deepEqual(controls.target.toArray(), [
    view.target.x,
    view.target.y,
    view.target.z,
  ]);
  const replaced = focus.start(view, player);
  const latest = focus.start(view, player);
  assert.equal(await replaced, false);
  focus.interrupt();
  assert.equal(await latest, false);
  assert.equal(focus.active, false);
  assert.equal(
    focus.ring.visible,
    true,
    "orbiting can retain the selected visitor ring",
  );
  const disposed = focus.start(view, player);
  focus.dispose();
  assert.equal(await disposed, false);
});

test("the ring follows replacement avatars, pulses only with motion and releases each owned resource once", async () => {
  const { focus, player, view, scene } = runtime(true);
  const geometry = focus.ring.geometry,
    material = focus.ring.material;
  let geometryDisposals = 0,
    materialDisposals = 0;
  geometry.addEventListener("dispose", () => geometryDisposals++);
  material.addEventListener("dispose", () => materialDisposals++);
  assert.equal(
    await focus.start(view, player),
    true,
    "reduced motion frames immediately",
  );
  focus.update(1, player, true);
  const steady = [focus.ring.scale.x, material.opacity];
  focus.update(3, player, true);
  assert.deepEqual([focus.ring.scale.x, material.opacity], steady);
  const replacement = new THREE.Group();
  replacement.position
    .copy(player.position)
    .add(new THREE.Vector3(0.3, 0.1, 0.2));
  focus.update(0.1, replacement);
  assert.ok(
    focus.ring.position.distanceTo(
      replacement.position.clone().add(new THREE.Vector3(0, 0.025, 0)),
    ) < 1e-9,
  );
  replacement.position.x += 3;
  focus.update(0.1, replacement);
  assert.equal(
    focus.ring.visible,
    false,
    "walking away clears the arrival ring",
  );
  focus.dispose();
  focus.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(scene.children.length, 0);
  const animated = runtime();
  animated.focus.start(animated.view, animated.player);
  animated.focus.update(0.3, animated.player, true);
  const bright = animated.focus.ring.material.opacity;
  animated.focus.update(0.3, animated.player, true);
  assert.notEqual(animated.focus.ring.material.opacity, bright);
  animated.focus.update(0.3, animated.player, false);
  const paused = [
    animated.focus.ring.scale.x,
    animated.focus.ring.material.opacity,
  ];
  animated.focus.update(3, animated.player, false);
  assert.deepEqual(
    [animated.focus.ring.scale.x, animated.focus.ring.material.opacity],
    paused,
  );
  animated.focus.clear();
  assert.equal(animated.focus.ring.visible, false);
  animated.focus.dispose();
});

// Execute the actual scene selection/lifecycle methods with real Three cameras
// and groups, leaving only the network loader stubbed. This catches completion
// ordering across overlapping chunk requests without needing a WebGL browser.
const sceneSource = readFileSync(
  new URL("../lib/city-scene.js", import.meta.url),
  "utf8",
);
function sceneHarness() {
  const { scene, camera, controls, focus: locationFocus, player } = runtime();
  const env: any = {
    scene,
    camera,
    controls: { ...controls, addEventListener() {} },
    locationFocus,
    player,
    pendingLocation: null,
    generation: 0,
    destroyed: false,
    focus: {},
    selectedHotspotId: null,
    pendingVenue: null,
    pendingTeleport: false,
    followPlayer: false,
    mode: "orbit",
    lastPlayerPosition: null,
    playerTarget: player.position.clone(),
    sceneryCancellations: 0,
    cancelScenery() {
      env.sceneryCancellations++;
    },
    walkRoute: [{ x: 20, z: 20 }],
    walkKeys: new Set(["w"]),
    followState: { initialized: true },
    characterGallery: null,
    manifest: {},
    venueMeshes: [],
    chunkCache: new Map(),
    chunkGroups: new Map(),
    roadPaths: [],
    dynamicObstacles: [],
    cityActorSpaceIsClear,
    coastline: null,
    options: { peers: [] },
    sun: {
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3() },
    },
    point3: ([x, z]: number[]) => new THREE.Vector3(x, 0, z),
    projectGeo: ([x, z]: number[]) => ({ x, z }),
    unprojectGeo: (x: number, z: number) => [x, z],
    geoY: () => 0,
    cancelTravel() {},
    restoreCity() {},
    refreshMarkers() {},
    setPeers() {},
    loadChunks() {},
    populate() {},
    locationCameraView,
    locationTreeObstacles,
    beachCameraView: () => null,
  };
  const block = (start: string, end: string) =>
    sceneSource.slice(sceneSource.indexOf(start), sceneSource.indexOf(end));
  const api = new Function(
    "THREE",
    "env",
    `with (env) {
    ${block("  function clearLocationFocus(", "  let travelPhase")}
    ${block("  function setFocus(", "  async function loadOverview(")}
    ${block("  function finishLocationFocus(", "  function frameVenue(")}
    return { setFocus, finishLocationFocus, interruptLocationFocus, clearLocationFocus };
  }`,
  )(THREE, env);
  return { env, api };
}

test("scene selection waits for loaded geography and the final shot; a stale load cannot open a replacement location", async () => {
  const { env, api } = sceneHarness();
  const old = api.setFocus({ id: "old", selectionId: "one", lng: 0, lat: 0 });
  assert.equal(env.sceneryCancellations, 1);
  assert.equal(env.walkRoute.length, 0);
  assert.equal(env.walkKeys.size, 0);
  assert.equal(env.followState.initialized, false);
  const oldTicket = env.generation;
  let opened = false;
  const latest = api
    .setFocus({ id: "cafe", selectionId: "two", lng: 10, lat: 20 })
    .then((complete: boolean) => {
      opened = complete;
      return complete;
    });
  assert.equal(await old, false);
  api.finishLocationFocus(oldTicket);
  assert.equal(env.pendingLocation.started, false);
  await Promise.resolve();
  assert.equal(opened, false);
  api.finishLocationFocus(env.generation);
  env.locationFocus.update(0.4, env.player);
  await Promise.resolve();
  assert.equal(opened, false);
  env.locationFocus.update(0.25, env.player);
  assert.equal(await latest, true);
  assert.equal(env.pendingLocation, null);
  assert.equal(env.locationFocus.ring.visible, true);
  await api.setFocus({ peerId: "friend", lng: 1, lat: 2 });
  assert.equal(env.locationFocus.ring.visible, false);
  env.locationFocus.dispose();
});

test("selecting Walk before initial geography finishes keeps follow framing, while peer shots retain their own camera", async () => {
  const { env, api } = sceneHarness();
  env.mode = "walk";
  env.followPlayer = true;
  let framed = 0;
  env.loadChunks = async () => {
    // The real population loader uses this flag to frame a newly spawned avatar.
    if (env.followPlayer) framed++;
  };
  await api.setFocus({ lng: -9.13, lat: 38.7166, name: "Graça" });
  assert.equal(env.followPlayer, true);
  assert.equal(
    framed,
    1,
    "the asynchronous ready focus must honor Walk selected during loading",
  );
  await api.setFocus({ peerId: "friend", lng: -9.13, lat: 38.7166 });
  assert.equal(
    env.followPlayer,
    false,
    "peer framing must not be replaced with an avatar follow shot",
  );
  assert.equal(framed, 1);
  env.locationFocus.dispose();
});

test("a gesture or teardown during loading settles the location promise without late framing", async () => {
  const { env, api } = sceneHarness();
  const shot = api.setFocus({
    id: "museum",
    selectionId: "museum-one",
    lng: 0,
    lat: 0,
  });
  const ticket = env.generation;
  api.interruptLocationFocus();
  assert.equal(await shot, false);
  api.finishLocationFocus(ticket);
  assert.equal(env.locationFocus.active, false);
  const closing = api.setFocus({
    id: "park",
    selectionId: "park-one",
    lng: 1,
    lat: 1,
  });
  api.clearLocationFocus();
  assert.equal(await closing, false);
  env.locationFocus.dispose();
});

test("a narrow entrance-side pavement is preferred over crossing the road and terrace furniture remains clear", () => {
  const view = locationCameraView({
    point: { x: 0, z: 0.1 },
    normal: { x: 0, z: 1 },
    footprints: [footprint],
    reservations: [{ x: 0, z: 1.3, radius: 1.1 }],
    safeAt: (p: any) => p.z < 1.45 || p.z > 6,
  })!;
  assert.ok(view);
  assert.ok(
    view.player.z < 1.45,
    "stay on the location's pavement rather than the opposite side of the road",
  );
  assert.ok(Math.hypot(view.player.x, view.player.z - 1.3) >= 1.75);
});

test("large terminal footprints and instanced tree crowns do not put the avatar indoors or the camera behind a canopy", () => {
  const terminal = [
    { x: -220, z: -240 },
    { x: 220, z: -240 },
    { x: 220, z: 240 },
    { x: -220, z: 240 },
  ];
  const exterior = locationCameraView({
    point: { x: 0, z: 200 },
    footprints: [terminal],
  })!;
  assert.ok(exterior);
  assert.ok(
    exterior.player.z > 240,
    "containing footprints still matter when every corner is farther than 130 m",
  );
  const group = new THREE.Group(),
    canopy = new THREE.InstancedMesh(
      new THREE.SphereGeometry(2.5, 8, 6),
      new THREE.MeshBasicMaterial(),
      1,
    ),
    matrix = new THREE.Matrix4().makeTranslation(-3.5, 4.8, 6);
  canopy.name = "Cypress silhouettes";
  canopy.setMatrixAt(0, matrix);
  group.add(canopy);
  const obstacles = locationTreeObstacles([group], { x: 0, z: 0 });
  assert.equal(obstacles.length, 1);
  const unblocked = locationCameraView({
    point: { x: 0, z: 0.1 },
    footprints: [footprint],
  })!;
  const blocked = locationCameraView({
    point: { x: 0, z: 0.1 },
    footprints: [footprint],
    obstacles,
  })!;
  assert.ok(blocked);
  assert.notDeepEqual(
    blocked.camera,
    unblocked.camera,
    "use the alternative side when a crown blocks the arrival shot",
  );
  assert.ok(blocked.camera.x > 0);
  canopy.geometry.dispose();
  canopy.material.dispose();
});

test("the scene includes a containing terminal even when every footprint corner is more than 130 m away", async () => {
  const { env, api } = sceneHarness();
  env.chunkCache.set("terminal", {
    buildings: [
      {
        ring: [
          [-220, -240],
          [220, -240],
          [220, 240],
          [-220, 240],
          [-220, -240],
        ],
      },
    ],
  });
  const arrival = api.setFocus({
    id: "airport",
    selectionId: "airport-outer-edge",
    lng: 0,
    lat: 200,
  });
  api.finishLocationFocus(env.generation);
  env.locationFocus.update(0.65, env.player);
  assert.equal(await arrival, true);
  assert.ok(
    env.player.position.z > 240,
    "the avatar cannot stand inside the large terminal footprint",
  );
  env.locationFocus.dispose();
});

test("portrait arrival keeps the whole avatar and foot circle above the mobile options sheet and restores normal framing", async () => {
  for (const aspect of [390 / 844, 360 / 800]) {
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(43, aspect, 0.3, 90000),
      controls = {
        target: new THREE.Vector3(),
        update() {
          camera.lookAt(this.target);
          camera.updateMatrixWorld();
        },
      },
      player = new THREE.Group(),
      view = locationCameraView({
        point: { x: 0, z: 0.1 },
        footprints: [footprint],
        aspect,
      })!,
      focus = createLocationFocus({ scene, camera, controls });
    player.position.set(view.player.x, view.player.y, view.player.z);
    camera.position.set(100, 90, 80);
    const arrival = focus.start(view, player);
    focus.update(0.65, player);
    assert.equal(await arrival, true);
    for (const [label, subject] of [
      ["feet", { ...view.player, y: view.player.y + 0.025 }],
      ["head", { ...view.player, y: view.player.y + 1.85 }],
    ] as const) {
      const projected = new THREE.Vector3(
          subject.x,
          subject.y,
          subject.z,
        ).project(camera),
        top = (1 - projected.y) / 2;
      assert.ok(
        top > 0.08 && top < 0.4,
        `${label} must remain above the sheet at 40% of screen height (actual ${top})`,
      );
      assert.ok(Math.abs(projected.x) < 0.95);
    }
    assert.equal(camera.view.enabled, true);
    camera.aspect = 844 / 390;
    camera.updateProjectionMatrix();
    focus.update(0.01, player);
    assert.equal(
      camera.view.enabled,
      false,
      "landscape returns to the proven desktop composition",
    );
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    focus.update(0.01, player);
    assert.equal(
      camera.view.enabled,
      true,
      "rotating back to portrait restores the room above its sheet",
    );
    focus.clear();
    assert.equal(
      camera.view.enabled,
      false,
      "leaving the arrival resets the projection for travel and interiors",
    );
    focus.dispose();
  }
});
