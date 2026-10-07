import { test } from "node:test";
import assert from "node:assert/strict";
import { createTravelRuntime } from "../lib/city-travel.js";

const THREE = require("three");
const origin = { lng: -9.144, lat: 38.723, name: "Rossio", range: 110 };
const destination = { lng: -9.163, lat: 38.707, name: "Santos", range: 130 };
const modes = [
  "flight",
  "metro",
  "train",
  "bus",
  "tram",
  "taxi",
  "walk",
  "cycle",
];

function setup(reducedMotion = false, callbacks: any = {}) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(45);
  camera.position.set(11, 22, 33);
  camera.lookAt(4, 5, 6);
  const controls = {
    target: new THREE.Vector3(4, 5, 6),
    enabled: true,
    enableDamping: true,
    update() {},
  };
  const phases: any[] = [],
    finishes: any[] = [];
  const projectGeo = ([lng, lat]: number[]) => ({
    x: (lng + 9.15) * 85000,
    z: (38.72 - lat) * 111000,
  });
  const geoY = ([lng, lat]: number[]) =>
    15 + (lng + 9.15) * 20 + (lat - 38.72) * 15;
  const runtime = createTravelRuntime({
    scene,
    camera,
    controls,
    projectGeo,
    geoY,
    reducedMotion,
    onPhase(value: any) {
      phases.push(value);
      callbacks.onPhase?.(value);
    },
    onFinish(value: any) {
      finishes.push(value);
      callbacks.onFinish?.(value);
    },
  });
  return {
    scene,
    camera,
    controls,
    projectGeo,
    geoY,
    phases,
    finishes,
    runtime,
  };
}
function sequence(mode = "metro", id = "qa-journey", extra: any = {}) {
  return {
    id,
    mode,
    from: origin,
    to: destination,
    shirt: "#fa876e",
    ...extra,
  };
}
function stage(env: any) {
  return env.scene.getObjectByName("roam-travel");
}
function exactDestination(env: any) {
  const point = env.projectGeo([destination.lng, destination.lat]),
    y = env.geoY([destination.lng, destination.lat]);
  assert.deepEqual(env.controls.target.toArray(), [point.x, y, point.z]);
  assert.deepEqual(env.camera.position.toArray(), [
    point.x + destination.range * 0.7,
    y + destination.range * 0.72,
    point.z + destination.range * 0.85,
  ]);
}
function auditStage(root: any) {
  const resources = new Set<any>();
  const lights = new Map<any, number>();
  root.traverse((node: any) => {
    if (node.isLight) {
      lights.set(node, 0);
      const original = node.dispose.bind(node);
      node.dispose = () => {
        lights.set(node, lights.get(node)! + 1);
        original();
      };
    }
    if (node.geometry) resources.add(node.geometry);
    for (const mat of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : [])
      resources.add(mat);
  });
  const counts = new Map<any, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener("dispose", () =>
      counts.set(resource, counts.get(resource)! + 1),
    );
  }
  return () => {
    assert.ok(counts.size > 10);
    for (const count of counts.values()) assert.equal(count, 1);
    for (const count of lights.values()) assert.equal(count, 1);
  };
}

test("every original transport mode finishes once with ordered phases and the mapped destination camera", () => {
  for (const mode of modes) {
    const env = setup();
    assert.equal(env.runtime.start(sequence(mode)), true);
    assert.equal(env.runtime.active, true);
    assert.equal(env.controls.enabled, false);
    assert.equal(env.controls.enableDamping, false);
    assert.deepEqual(
      env.phases.map((event) => event.phase),
      ["boarding"],
    );
    const tableau = stage(env),
      verify = auditStage(tableau);
    let meshes = 0;
    tableau.traverse((node: any) => {
      if (!node.geometry) return;
      meshes++;
      assert.ok(node.geometry.attributes.position.count > 0);
      for (const attribute of Object.values(node.geometry.attributes) as any[])
        assert.ok(Array.from(attribute.array).every(Number.isFinite));
      assert.ok(node.position.toArray().every(Number.isFinite));
      assert.ok(
        node.scale
          .toArray()
          .every((value: number) => Number.isFinite(value) && value > 0),
      );
    });
    assert.ok(meshes >= 15);
    for (let i = 0; i < 110; i++) {
      env.runtime.update(0.1);
      assert.ok(env.camera.position.toArray().every(Number.isFinite));
      assert.ok(env.controls.target.toArray().every(Number.isFinite));
      assert.ok(env.camera.quaternion.toArray().every(Number.isFinite));
    }
    assert.equal(env.runtime.active, false);
    assert.equal(stage(env), undefined);
    assert.equal(env.finishes.length, 1);
    assert.equal(env.finishes[0].id, "qa-journey");
    assert.equal(env.finishes[0].to, destination);
    assert.deepEqual(
      env.phases.map((event) => event.phase),
      ["boarding", "travelling", "arriving"],
    );
    assert.equal(env.controls.enabled, true);
    assert.equal(env.controls.enableDamping, true);
    exactDestination(env);
    env.runtime.update(200);
    env.runtime.skip();
    env.runtime.dispose();
    env.runtime.dispose();
    assert.equal(env.finishes.length, 1);
    verify();
  }
});

test("flight arrival descends onto a runway at the destination, while departure takes off from the origin", () => {
  for (const departure of [false, true]) {
    const env = setup();
    env.runtime.start(
      sequence("flight", "flight", { departure, arrival: !departure }),
    );
    const tableau = stage(env),
      plane = tableau.getObjectByName("arrival-plane");
    const anchor = departure ? origin : destination,
      expected = env.projectGeo([anchor.lng, anchor.lat]);
    assert.deepEqual(tableau.position.toArray(), [
      expected.x,
      env.geoY([anchor.lng, anchor.lat]),
      expected.z,
    ]);
    const initialY = plane.position.y,
      initialX = plane.position.x;
    env.runtime.update(5.5);
    assert.ok(plane.position.x > initialX);
    if (departure) assert.ok(plane.position.y > initialY);
    else assert.ok(plane.position.y < initialY);
    assert.ok(plane.position.y >= 0);
    const planeBounds = new THREE.Box3().setFromObject(plane),
      size = planeBounds.getSize(new THREE.Vector3());
    assert.ok(size.x > 25 && size.z > 25 && size.y > 7);
    env.runtime.dispose();
  }
});

test("the current adult avatar visibly boards the rail doorway before the carriage moves", () => {
  const env = setup();
  env.runtime.start(sequence("metro"));
  const tableau = stage(env),
    avatar = tableau.getObjectByName("traveller"),
    train = tableau.getObjectByName("metro-carriages");
  assert.equal(avatar.userData.style, "tourist");
  assert.ok(avatar.userData.rig.leftKnee);
  const initialZ = avatar.position.z;
  assert.equal(avatar.visible, true);
  assert.equal(train.position.x, 0);
  env.runtime.update(1.4);
  assert.ok(avatar.position.z > initialZ && avatar.position.z < 0);
  assert.equal(avatar.visible, true);
  assert.equal(train.position.x, 0);
  env.runtime.update(2.1);
  assert.equal(avatar.visible, false);
  assert.ok(train.position.x > 0);
  env.runtime.dispose();
});

test("arrival publishes the real destination target before revealing the mapped city", () => {
  let env: ReturnType<typeof setup>;
  env = setup(false, {
    onPhase(event: any) {
      if (event.phase !== "arriving") return;
      const point = env.projectGeo([destination.lng, destination.lat]);
      assert.deepEqual(env.controls.target.toArray(), [
        point.x,
        env.geoY([destination.lng, destination.lat]),
        point.z,
      ]);
      assert.equal(stage(env).visible, false);
    },
  });
  env.runtime.start(sequence());
  env.runtime.update(7.2);
  assert.equal(env.runtime.active, true);
  const highDistance = env.camera.position.distanceTo(env.controls.target);
  env.runtime.update(1);
  assert.ok(env.camera.position.distanceTo(env.controls.target) < highDistance);
  env.runtime.skip();
  exactDestination(env);
  env.runtime.dispose();
});

test("reduced motion holds a static preview then cuts to destination and completes within one second", () => {
  const env = setup(true);
  env.runtime.start(sequence("flight"));
  const tableau = stage(env),
    plane = tableau.getObjectByName("arrival-plane"),
    camera = env.camera.position.clone(),
    planePosition = plane.position.clone();
  env.runtime.update(0.4);
  assert.deepEqual(env.camera.position.toArray(), camera.toArray());
  assert.deepEqual(plane.position.toArray(), planePosition.toArray());
  assert.equal(tableau.visible, true);
  env.runtime.update(0.3);
  assert.equal(tableau.visible, false);
  exactDestination(env);
  env.runtime.update(0.3);
  assert.equal(env.runtime.active, false);
  assert.equal(env.finishes.length, 1);
  assert.deepEqual(
    env.phases.map((event) => event.phase),
    ["boarding", "travelling", "arriving"],
  );
  env.runtime.dispose();
});

test("skip, replacement and cancel clean their resources and preserve exactly-once completion semantics", () => {
  const env = setup(),
    savedPosition = env.camera.position.clone(),
    savedTarget = env.controls.target.clone(),
    savedQuaternion = env.camera.quaternion.clone();
  env.runtime.start(sequence("bus", "first"));
  const first = stage(env),
    firstCleanup = auditStage(first);
  env.runtime.update(1);
  env.runtime.start(sequence("train", "second"));
  firstCleanup();
  assert.equal(first.parent, null);
  assert.equal(env.finishes.length, 0);
  assert.equal(env.scene.children.length, 1);
  const secondCleanup = auditStage(stage(env));
  env.runtime.update(2);
  assert.equal(env.runtime.cancel(), true);
  assert.equal(env.runtime.active, false);
  assert.equal(env.finishes.length, 0);
  secondCleanup();
  assert.deepEqual(env.camera.position.toArray(), savedPosition.toArray());
  assert.deepEqual(env.camera.quaternion.toArray(), savedQuaternion.toArray());
  assert.deepEqual(env.controls.target.toArray(), savedTarget.toArray());
  assert.equal(env.controls.enabled, true);
  assert.equal(env.controls.enableDamping, true);
  env.runtime.start(sequence("taxi", "third"));
  const thirdCleanup = auditStage(stage(env));
  assert.equal(env.runtime.skip(), true);
  assert.equal(env.runtime.skip(), false);
  thirdCleanup();
  exactDestination(env);
  assert.equal(env.finishes.length, 1);
  assert.equal(env.finishes[0].id, "third");
  env.runtime.dispose();
  assert.equal(env.runtime.start(sequence()), false);
  assert.equal(env.runtime.cancel(), false);
});

test("invalid routes and time deltas cannot interrupt a valid journey or create nonfinite camera positions", () => {
  const env = setup();
  env.runtime.start(sequence());
  const tableau = stage(env),
    camera = env.camera.position.clone();
  for (const next of [
    sequence("unknown"),
    sequence("bus", ""),
    sequence("bus", "bad", { from: { lng: NaN, lat: 0 } }),
    sequence("bus", "bad", { to: { lng: 0, lat: 91 } }),
  ])
    assert.equal(env.runtime.start(next), false);
  assert.equal(stage(env), tableau);
  for (const dt of [0, -2, NaN, Infinity]) env.runtime.update(dt);
  assert.deepEqual(env.camera.position.toArray(), camera.toArray());
  assert.equal(env.phases.length, 1);
  env.runtime.update(10000);
  assert.equal(env.finishes.length, 1);
  exactDestination(env);
  env.runtime.dispose();
});

test("phase or completion callbacks may cancel or replace a sequence without leaking or finishing the replaced journey", () => {
  let env: ReturnType<typeof setup>;
  env = setup(false, {
    onPhase(event: any) {
      if (event.id === "old" && event.phase === "arriving")
        env.runtime.start(sequence("bus", "replacement"));
    },
    onFinish(event: any) {
      if (event.id === "replacement")
        env.runtime.start(sequence("walk", "follow-on"));
    },
  });
  env.runtime.start(sequence("metro", "old"));
  const cleanup = auditStage(stage(env));
  env.runtime.update(7.3);
  cleanup();
  assert.equal(env.runtime.active, true);
  assert.equal(stage(env).userData.sequenceId, "replacement");
  assert.equal(env.finishes.length, 0);
  env.runtime.skip();
  assert.equal(env.runtime.active, true);
  assert.equal(stage(env).userData.sequenceId, "follow-on");
  assert.deepEqual(
    env.finishes.map((event) => event.id),
    ["replacement"],
  );
  env.runtime.dispose();
  assert.equal(stage(env), undefined);
});

test("skip respects a phase callback cancellation and exposes destination coordinates before its arriving callback", () => {
  let env: ReturnType<typeof setup>;
  env = setup(false, {
    onPhase(event: any) {
      if (event.id === "cancel-on-skip" && event.phase === "travelling")
        env.runtime.cancel();
      if (event.phase === "arriving") exactDestination(env);
    },
  });
  env.runtime.start(sequence("bus", "cancel-on-skip"));
  const cleanup = auditStage(stage(env));
  env.runtime.skip();
  cleanup();
  assert.equal(env.runtime.active, false);
  assert.equal(env.finishes.length, 0);
  env.runtime.start(sequence("train", "complete-skip"));
  env.runtime.skip();
  assert.equal(env.finishes.length, 1);
  exactDestination(env);
  env.runtime.dispose();
});

test("platform scenery leaves the boarding doorway and traveller visible from the close and widening camera shots", () => {
  for (const mode of ["metro", "train", "bus", "tram"]) {
    const env = setup();
    env.runtime.start(sequence(mode));
    const tableau = stage(env),
      avatar = tableau.getObjectByName("traveller");
    const vehicle = tableau.children.find(
      (child: any) =>
        child.name === `${mode}-carriages` || child.name === `${mode}-vehicle`,
    );
    const scenery = tableau.children.filter(
      (child: any) => child !== avatar && child !== vehicle && !child.isLight,
    );
    const door = vehicle.children.find((child: any) =>
      Number.isFinite(child.userData.closedX),
    );
    let previousTime = 0;
    for (const time of [0, 1.2, 2.4, 3.4]) {
      if (time > previousTime) env.runtime.update(time - previousTime);
      previousTime = time;
      tableau.updateMatrixWorld(true);
      env.camera.updateMatrixWorld(true);
      const targets = [door.getWorldPosition(new THREE.Vector3())];
      if (avatar.visible)
        targets.push(avatar.localToWorld(new THREE.Vector3(0, 1.15, 0)));
      for (const target of targets) {
        const projected = target.clone().project(env.camera);
        assert.ok(
          Math.abs(projected.x) < 1 &&
            Math.abs(projected.y) < 1 &&
            projected.z > -1 &&
            projected.z < 1,
          `${mode} boarding subject outside the camera view at ${time}s`,
        );
        const direction = target.clone().sub(env.camera.position),
          distance = direction.length();
        const ray = new THREE.Raycaster(
          env.camera.position,
          direction.normalize(),
          0,
          distance - 0.05,
        );
        assert.equal(
          ray.intersectObjects(scenery, true).length,
          0,
          `${mode} boarding sight line blocked at ${time}s`,
        );
      }
    }
    env.runtime.dispose();
  }
});

test("boarding preserves the saved outfit, hair and skin identity with the chosen trip top colour", () => {
  const env = setup();
  const appearance = {
    outfitStyle: "jacket",
    topColor: "#42b894",
    bottomColor: "#30324a",
    hairStyle: "bun",
    hairColor: "#b98452",
    skinTone: "#5b3d30",
    shoeColor: "#292d31",
  };
  env.runtime.start(
    sequence("train", "saved-identity", { appearance, shirt: "#f15b50" }),
  );
  const avatar = stage(env).getObjectByName("traveller");
  assert.equal(avatar.userData.style, "jacket");
  assert.equal(avatar.userData.hairStyle, "bun");
  assert.equal(
    avatar.getObjectByName("tailored top").material.color.getHexString(),
    "42b894",
  );
  assert.equal(
    avatar.getObjectByName("pelvis").material.color.getHexString(),
    "30324a",
  );
  assert.equal(
    avatar.getObjectByName("bun hair").material.color.getHexString(),
    "b98452",
  );
  assert.equal(
    avatar.getObjectByName("face").material.color.getHexString(),
    "5b3d30",
  );
  const colors = new Set<string>();
  avatar.traverse((node: any) => {
    if (node.material) colors.add(node.material.color.getHexString());
  });
  assert.ok(colors.has("292d31"));
  const cleanup = auditStage(stage(env));
  env.runtime.skip();
  cleanup();
  env.runtime.start(
    sequence("bus", "invalid-identity", {
      appearance: {
        ...appearance,
        topColor: "bad",
        hairColor: "bad",
        outfitStyle: "bad",
        hairStyle: "bad",
      },
      shirt: "#ffce45",
    }),
  );
  const fallback = stage(env).getObjectByName("traveller");
  assert.equal(
    fallback.getObjectByName("tailored top").material.color.getHexString(),
    "ffce45",
  );
  assert.equal(fallback.userData.style, "tourist");
  assert.equal(fallback.userData.hairStyle, "short");
  assert.equal(
    fallback.getObjectByName("short hair").material.color.getHexString(),
    "302823",
  );
  env.runtime.dispose();
});
