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

function setup(reducedMotion = false, callbacks: any = {}, options: any = {}) {
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
    ...options,
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
        : []) {
      resources.add(mat);
      for (const key of ["map", "bumpMap", "roughnessMap"])
        if (mat[key]) resources.add(mat[key]);
    }
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

test("the original aircraft has a complete transport silhouette while airport detail stays bounded", () => {
  const env = setup();
  env.runtime.start(sequence("flight"));
  const tableau = stage(env),
    plane = tableau.getObjectByName("arrival-plane"),
    airport = tableau.getObjectByName("illustrative airport airside");
  const named = (name: string) => {
    const nodes: any[] = [];
    plane.traverse((node: any) => {
      if (node.name === name) nodes.push(node);
    });
    return nodes;
  };
  assert.equal(named("turbofan nacelle").length, 2);
  assert.equal(named("engine fan").length, 2);
  assert.equal(named("upswept winglet").length, 2);
  assert.equal(named("cockpit glazing").length, 2);
  assert.equal(named("cabin window").length, 40);
  assert.equal(named("main gear tyre").length, 4);
  assert.equal(named("nose gear tyre").length, 2);
  assert.equal(named("original ROAM livery").length, 2);
  assert.equal(airport.userData.illustrative, true);
  assert.equal(airport.userData.runwayTop, 0.1);
  assert.ok(
    airport.children.some(
      (node: any) => node.name === "batched airport scenery",
    ),
  );
  const airframe = plane.getObjectByName("tapered airframe");
  airframe.geometry.computeBoundingBox();
  const bodySize = airframe.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(bodySize.x > 36 && bodySize.x < 39);
  assert.ok(bodySize.y > 3.5 && bodySize.y < 4.1);
  assert.equal(airframe.material.vertexColors, true);
  const colors = airframe.geometry.getAttribute("color");
  assert.ok(
    Array.from(colors.array).some(
      (value, index) => index % 3 === 0 && Number(value) < 0.1,
    ),
    "the cobalt belly is baked into the white airframe",
  );
  const geometry = new Set<any>(),
    materials = new Set<any>();
  let meshes = 0;
  tableau.traverse((node: any) => {
    if (!node.isMesh) return;
    meshes++;
    geometry.add(node.geometry);
    materials.add(node.material);
    if (node.material.map) {
      assert.equal(node.material.map.isDataTexture, true);
      assert.equal(node.material.map.image.width, 128);
      assert.equal(node.material.map.image.height, 128);
    }
  });
  // Bound scene complexity independently of the number of airport lamps,
  // terminal mullions and runway stripes; they share merged material batches.
  assert.ok(meshes <= 200, `${meshes} draw objects`);
  assert.ok(geometry.size <= 64, `${geometry.size} geometries`);
  assert.ok(materials.size <= 64, `${materials.size} materials`);
  const vertices = [...geometry].reduce(
    (sum, value) => sum + value.attributes.position.count,
    0,
  );
  assert.ok(vertices <= 25_000, `${vertices} unique vertices`);
  env.runtime.dispose();
});

test("landing flares onto the main wheels, settles the nose and decelerates before the mapped-city cut", () => {
  const env = setup();
  env.runtime.start(sequence("flight"));
  const tableau = stage(env),
    plane = tableau.getObjectByName("arrival-plane"),
    runway = tableau.getObjectByName("runway asphalt");
  let elapsed = 0;
  const at = (time: number) => {
    env.runtime.update(time - elapsed);
    elapsed = time;
    tableau.updateMatrixWorld(true);
  };
  // Use actual transformed tyre vertices. A transformed cached AABB expands
  // when a cylinder spins and cannot measure tyre-to-runway contact.
  const tyreBottom = (name: string) => {
    const bottoms: number[] = [];
    plane.traverse((node: any) => {
      if (node.name === name)
        bottoms.push(new THREE.Box3().setFromObject(node, true).min.y);
    });
    return Math.min(...bottoms);
  };
  tableau.updateMatrixWorld(true);
  const runwayTop = new THREE.Box3().setFromObject(runway, true).max.y;
  assert.equal(tableau.userData.flightShot, "approach");
  at(3.5);
  assert.equal(tableau.userData.flightShot, "flare");
  assert.ok(tyreBottom("main gear tyre") > runwayTop + 1);
  at(4.4);
  assert.equal(tableau.userData.flightShot, "touchdown");
  assert.ok(plane.rotation.z > 0.06);
  assert.ok(Math.abs(tyreBottom("main gear tyre") - runwayTop) < 0.01);
  assert.ok(tyreBottom("nose gear tyre") > runwayTop + 1);
  at(5.4);
  assert.equal(tableau.userData.flightShot, "rollout");
  assert.equal(plane.rotation.z, 0);
  assert.ok(Math.abs(tyreBottom("main gear tyre") - runwayTop) < 0.01);
  assert.ok(Math.abs(tyreBottom("nose gear tyre") - runwayTop) < 0.01);
  const x54 = plane.position.x;
  at(6.4);
  const x64 = plane.position.x;
  at(7.4);
  assert.ok(plane.position.x - x64 < x64 - x54);
  assert.equal(tableau.visible, true);
  at(8.2);
  assert.equal(tableau.visible, false);
  const point = env.projectGeo([destination.lng, destination.lat]);
  assert.deepEqual(env.controls.target.toArray(), [
    point.x,
    env.geoY([destination.lng, destination.lat]),
    point.z,
  ]);
  at(10.5);
  assert.equal(env.finishes.length, 1);
  exactDestination(env);
  env.runtime.dispose();
});

test("flight framing keeps the full airframe visible on desktop and portrait screens", () => {
  for (const aspect of [1.5, 390 / 844]) {
    for (const departure of [false, true]) {
      const env = setup();
      env.camera.aspect = aspect;
      env.camera.updateProjectionMatrix();
      env.runtime.start(sequence("flight", "framing", { departure }));
      const tableau = stage(env),
        plane = tableau.getObjectByName("arrival-plane");
      let elapsed = 0;
      for (const time of [0, 3.5, 4.4, 5.4, 7.6]) {
        if (time > elapsed) env.runtime.update(time - elapsed);
        elapsed = time;
        tableau.updateMatrixWorld(true);
        env.camera.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(plane, true);
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z]) {
              const point = new THREE.Vector3(x, y, z).project(env.camera);
              assert.ok(
                Math.abs(point.x) < 1 &&
                  Math.abs(point.y) < 1 &&
                  point.z > -1 &&
                  point.z < 1,
                `aircraft clipped at ${time}s, aspect ${aspect}, departure ${departure}`,
              );
            }
      }
      env.runtime.dispose();
    }
  }
});

test("departure accelerates before rotation then climbs and retracts the gear", () => {
  const env = setup();
  env.runtime.start(sequence("flight", "departure", { departure: true }));
  const tableau = stage(env),
    plane = tableau.getObjectByName("arrival-plane"),
    gear = plane.getObjectByName("landing gear");
  const initialY = plane.position.y;
  assert.equal(tableau.userData.flightShot, "taxi");
  env.runtime.update(2.5);
  assert.equal(tableau.userData.flightShot, "takeoff-roll");
  assert.equal(plane.position.y, initialY);
  const startX = plane.position.x;
  env.runtime.update(0.5);
  const firstDistance = plane.position.x - startX,
    nextX = plane.position.x;
  env.runtime.update(0.5);
  assert.ok(plane.position.x - nextX > firstDistance);
  env.runtime.update(1);
  assert.equal(tableau.userData.flightShot, "rotation");
  assert.ok(plane.position.y > initialY);
  assert.ok(plane.rotation.z > 0);
  assert.equal(gear.visible, true);
  env.runtime.update(2);
  assert.equal(tableau.userData.flightShot, "climb");
  assert.ok(plane.position.y > initialY + 10);
  assert.equal(gear.visible, false);
  env.runtime.dispose();
});

test("flight lighting accepts a bounded time-of-day snapshot without changing aircraft identity", () => {
  for (const input of [0, 1, 9, NaN]) {
    let reads = 0;
    const env = setup(
      false,
      {},
      {
        night() {
          reads++;
          return input;
        },
      },
    );
    env.runtime.start(sequence("flight"));
    const tableau = stage(env),
      sun = tableau.children.find((node: any) => node.isDirectionalLight),
      fill = tableau.children.find((node: any) => node.isHemisphereLight);
    const normalized = Number.isFinite(input) ? Math.min(1, input) : 0;
    assert.ok(Math.abs(sun.intensity - (1.35 - normalized * 0.8)) < 1e-8);
    assert.ok(Math.abs(fill.intensity - (0.95 + normalized * 0.35)) < 1e-8);
    assert.equal(reads, 1);
    env.runtime.update(1);
    assert.equal(reads, 1);
    const plane = tableau.getObjectByName("arrival-plane");
    assert.equal(plane.userData.aircraft.original, true);
    const nav = plane.getObjectByName("wing navigation light");
    assert.ok(nav.material.emissiveIntensity > 1);
    env.runtime.dispose();
  }
});

test("detailed flight resources are disposed exactly once on replacement, cancel and skip", () => {
  const env = setup();
  for (const operation of ["replace", "cancel", "skip"]) {
    env.runtime.start(sequence("flight", operation));
    const tableau = stage(env),
      verify = auditStage(tableau);
    env.runtime.update(4.5);
    if (operation === "replace") {
      env.runtime.start(sequence("flight", "replacement"));
      verify();
      const nextVerify = auditStage(stage(env));
      env.runtime.cancel();
      nextVerify();
    } else if (operation === "cancel") env.runtime.cancel();
    else env.runtime.skip();
    verify();
    assert.equal(tableau.parent, null);
  }
  assert.deepEqual(
    env.finishes.map((event) => event.id),
    ["skip"],
  );
  env.runtime.dispose();
});

test("flight view changes preserve the running timeline and saved seated appearance", () => {
  const appearance = {
    bodyType: "female",
    outfitStyle: "jacket",
    topColor: "#42b894",
    bottomColor: "#30324a",
    hairStyle: "bun",
    hairColor: "#b98452",
    skinTone: "#5b3d30",
    shoeColor: "#292d31",
  };
  const env = setup();
  assert.equal(env.runtime.setView("cabin"), false);
  env.runtime.start(sequence("flight", "views", { appearance }));
  const tableau = stage(env),
    plane = tableau.getObjectByName("arrival-plane"),
    airport = tableau.getObjectByName("illustrative airport airside");
  assert.equal(env.runtime.view, "outside");
  assert.equal(
    tableau.getObjectByName("original ROAM flight cabin"),
    undefined,
  );
  env.runtime.update(3.5);
  const pose = plane.position.toArray(),
    exteriorCamera = env.camera.position.toArray(),
    phases = env.phases.map((event) => event.phase);
  assert.equal(env.runtime.setView("unknown"), false);
  assert.equal(env.runtime.setView("cabin"), true);
  const cabin = tableau.getObjectByName("original ROAM flight cabin"),
    avatar = cabin.getObjectByName("traveller");
  assert.equal(env.runtime.view, "cabin");
  assert.deepEqual(plane.position.toArray(), pose);
  assert.deepEqual(
    env.phases.map((event) => event.phase),
    phases,
  );
  assert.equal(plane.visible, false);
  assert.equal(airport.visible, false);
  assert.equal(cabin.visible, true);
  assert.equal(avatar.visible, true);
  assert.equal(avatar.userData.activity, "seated");
  assert.equal(avatar.userData.flightSeat, "3A");
  assert.equal(avatar.userData.bodyType, "female");
  assert.equal(avatar.userData.style, "jacket");
  assert.equal(avatar.userData.hairStyle, "bun");
  for (const [name, color] of [
    ["tailored top", "42b894"],
    ["pelvis", "30324a"],
    ["bun hair", "b98452"],
    ["face", "5b3d30"],
    ["left shoe", "292d31"],
  ])
    assert.equal(
      avatar.getObjectByName(name).material.color.getHexString(),
      color,
    );
  assert.equal(env.runtime.setView("seat"), true);
  assert.equal(avatar.visible, false);
  assert.deepEqual(plane.position.toArray(), pose);
  assert.equal(env.runtime.setView("outside"), true);
  assert.deepEqual(env.camera.position.toArray(), exteriorCamera);
  assert.equal(plane.visible, true);
  assert.equal(airport.visible, true);
  assert.equal(cabin.visible, false);
  assert.equal(env.runtime.setView("cabin"), true);
  assert.equal(tableau.getObjectByName("original ROAM flight cabin"), cabin);
  env.runtime.update(1);
  assert.equal(tableau.userData.flightShot, "touchdown");
  assert.ok(plane.position.x > pose[0]);
  assert.equal(env.runtime.setView("seat"), true);
  env.runtime.update(3.7);
  assert.equal(tableau.visible, false);
  const mapCamera = env.camera.position.toArray();
  assert.equal(env.runtime.setView("outside"), false);
  assert.equal(env.runtime.setView("cabin"), false);
  assert.deepEqual(env.camera.position.toArray(), mapCamera);
  env.runtime.update(2.3);
  assert.equal(env.finishes.length, 1);
  exactDestination(env);
  assert.equal(env.runtime.setView("seat"), false);
  env.runtime.dispose();
});

test("the lazy cabin has bounded rounded furnishings and clear immersive/window camera views", () => {
  for (const aspect of [1.5, 390 / 844]) {
    const env = setup();
    env.camera.aspect = aspect;
    env.camera.updateProjectionMatrix();
    env.runtime.start(sequence("flight"));
    assert.equal(env.runtime.setView("cabin"), true);
    const tableau = stage(env),
      cabin = tableau.getObjectByName("original ROAM flight cabin");
    assert.equal(cabin.userData.illustrative, true);
    assert.equal(cabin.userData.seatLayout, "3+3");
    assert.equal(cabin.userData.seats, 30);
    assert.equal(cabin.userData.decorativePassengers, 7);
    const crew = cabin.getObjectByName("decorative cabin crew");
    assert.ok(crew);
    const geometry = new Set<any>(),
      materials = new Set<any>();
    let meshes = 0;
    tableau.traverse((node: any) => {
      if (!node.isMesh) return;
      meshes++;
      geometry.add(node.geometry);
      materials.add(node.material);
      for (const attribute of Object.values(node.geometry.attributes) as any[])
        assert.ok(Array.from(attribute.array).every(Number.isFinite));
    });
    assert.ok(meshes <= 280, `${meshes} lazy-cabin meshes`);
    assert.ok(geometry.size <= 160, `${geometry.size} lazy-cabin geometries`);
    assert.ok(materials.size <= 130, `${materials.size} lazy-cabin materials`);
    const vertices = [...geometry].reduce(
      (sum, value) => sum + value.attributes.position.count,
      0,
    );
    assert.ok(vertices <= 200_000, `${vertices} lazy-cabin vertices`);
    tableau.updateMatrixWorld(true);
    env.camera.updateMatrixWorld(true);
    // An immersive camera sits inside the room rather than framing the room's
    // exterior bounding box. The crew face must be visible down the aisle.
    const head = crew
        .getObjectByName("head")
        .getWorldPosition(new THREE.Vector3()),
      projected = head.clone().project(env.camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1);
    const headDirection = head.clone().sub(env.camera.position),
      headDistance = headDirection.length(),
      headRay = new THREE.Raycaster(
        env.camera.position,
        headDirection.normalize(),
        0,
        headDistance - 0.14,
      );
    assert.equal(
      headRay.intersectObject(cabin.getObjectByName("cabin furniture"), true)
        .length,
      0,
    );
    const cameraBounds = new THREE.Box3().setFromObject(cabin, true);
    assert.ok(cameraBounds.containsPoint(env.camera.position));
    const ceiling = cabin
      .getObjectByName("cabin furniture")
      .children.find(
        (node: any) =>
          node.isMesh && node.material.color.getHexString() === "c3c5b9",
      );
    assert.ok(ceiling);
    assert.ok(
      Array.from(ceiling.geometry.attributes.normal.array).some(
        (value, index) => index % 3 === 1 && Number(value) < -0.9,
      ),
    );
    assert.equal(env.runtime.setView("seat"), true);
    // The first-person camera turns toward the oval window from seat 3A.
    // Seatbacks and nearby passengers must not cover that view.
    const target = env.controls.target.clone(),
      direction = target.clone().sub(env.camera.position),
      distance = direction.length(),
      ray = new THREE.Raycaster(
        env.camera.position,
        direction.normalize(),
        0,
        distance - 0.05,
      );
    assert.equal(
      ray.intersectObject(cabin.getObjectByName("cabin furniture"), true)
        .length,
      0,
    );
    assert.ok(cabin.getObjectByName("original oval sky window"));
    env.runtime.dispose();
  }
});

test("flight cabin switching is static under reduced motion and all lazily created resources dispose once", () => {
  const reduced = setup(true);
  reduced.runtime.start(sequence("flight"));
  reduced.runtime.setView("cabin");
  const tableau = stage(reduced),
    camera = reduced.camera.position.toArray(),
    verify = auditStage(tableau);
  reduced.runtime.update(0.4);
  assert.deepEqual(reduced.camera.position.toArray(), camera);
  assert.equal(reduced.runtime.setView("seat"), true);
  const seatCamera = reduced.camera.position.toArray();
  reduced.runtime.update(0.2);
  assert.deepEqual(reduced.camera.position.toArray(), seatCamera);
  reduced.runtime.update(0.1);
  assert.equal(reduced.runtime.setView("cabin"), false);
  exactDestination(reduced);
  reduced.runtime.update(0.3);
  verify();
  assert.equal(reduced.finishes.length, 1);
  reduced.runtime.dispose();
  for (const method of ["skip", "cancel", "replace"]) {
    const env = setup();
    env.runtime.start(sequence("flight"));
    env.runtime.setView("seat");
    const cleanup = auditStage(stage(env));
    if (method === "replace") env.runtime.start(sequence("bus", "replacement"));
    else if (method === "skip") env.runtime.skip();
    else env.runtime.cancel();
    cleanup();
    if (method === "replace") assert.equal(env.runtime.setView("cabin"), false);
    env.runtime.dispose();
  }
});

test("flight lighting layers and view FOV restore the original camera on every exit", () => {
  for (const reduced of [false, true]) {
    for (const exit of ["cancel", "skip", "arrive"]) {
      const env = setup(reduced);
      env.camera.layers.enable(3);
      env.camera.fov = 48;
      env.camera.updateProjectionMatrix();
      const original = env.camera.layers.mask;
      env.runtime.start(sequence("flight"));
      const isolated = env.camera.layers.mask;
      assert.notEqual(isolated, original);
      stage(env).traverse((node: any) =>
        assert.equal(node.layers.mask, isolated),
      );
      env.runtime.setView("cabin");
      assert.equal(env.camera.fov, 52);
      stage(env).traverse((node: any) =>
        assert.equal(node.layers.mask, isolated),
      );
      env.runtime.setView("seat");
      assert.equal(env.camera.fov, 65);
      if (exit === "cancel") env.runtime.cancel();
      else if (exit === "skip") env.runtime.skip();
      else {
        env.runtime.update(reduced ? 0.7 : 8.2);
        assert.equal(stage(env).visible, false);
        assert.equal(env.camera.layers.mask, original);
        assert.equal(env.camera.fov, 48);
        env.runtime.update(3);
      }
      assert.equal(env.camera.layers.mask, original);
      assert.equal(env.camera.fov, 48);
      env.runtime.dispose();
    }
  }
});

test("the shared flight environment survives journey changes and disposes once with the runtime", async () => {
  let resolve: (texture: any) => void = () => {};
  const pending = new Promise<any>((done) => {
      resolve = done;
    }),
    env = setup(false, {}, { loadEnvironment: () => pending }),
    texture = new THREE.DataTexture(new Uint16Array(16), 2, 2);
  let disposed = 0;
  texture.addEventListener("dispose", () => disposed++);
  env.runtime.start(sequence("flight"));
  resolve(texture);
  await new Promise((done) => setImmediate(done));
  const airframe = stage(env).getObjectByName("tapered airframe"),
    sky = stage(env).getObjectByName("original flight sky");
  assert.equal(airframe.material.envMap, texture);
  assert.equal(sky.material.map, texture);
  assert.equal(sky.material.vertexColors, false);
  env.runtime.skip();
  assert.equal(disposed, 0);
  env.runtime.start(sequence("flight", "next"));
  assert.equal(
    stage(env).getObjectByName("tapered airframe").material.envMap,
    texture,
  );
  env.runtime.setView("cabin");
  const avatar = stage(env).getObjectByName("traveller");
  assert.ok(avatar);
  env.runtime.dispose();
  env.runtime.dispose();
  assert.equal(disposed, 1);
});

test("late or failed flight environment loads preserve cleanup and generated sky fallback", async () => {
  let resolve: (texture: any) => void = () => {};
  const pending = new Promise<any>((done) => {
      resolve = done;
    }),
    env = setup(false, {}, { loadEnvironment: () => pending }),
    texture = new THREE.DataTexture(new Uint16Array(16), 2, 2);
  let disposed = 0;
  texture.addEventListener("dispose", () => disposed++);
  env.runtime.dispose();
  resolve(texture);
  await new Promise((done) => setImmediate(done));
  assert.equal(disposed, 1);
  const fallback = setup(
    false,
    {},
    { loadEnvironment: () => Promise.reject(new Error("unavailable")) },
  );
  fallback.runtime.start(sequence("flight"));
  await new Promise((done) => setImmediate(done));
  assert.equal(
    stage(fallback).getObjectByName("original flight sky").material.map,
    null,
  );
  assert.equal(
    stage(fallback).getObjectByName("original flight sky").material
      .vertexColors,
    true,
  );
  fallback.runtime.dispose();
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
    planePosition = plane.position.clone(),
    fan = plane.getObjectByName("engine fan"),
    gear = plane.getObjectByName("landing gear");
  env.runtime.update(0.4);
  assert.deepEqual(env.camera.position.toArray(), camera.toArray());
  assert.deepEqual(plane.position.toArray(), planePosition.toArray());
  assert.equal(fan.rotation.x, 0);
  assert.equal(gear.position.y, 0);
  assert.equal(gear.visible, true);
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

test("boarding preserves the saved body type, clothing, hair and skin identity", () => {
  const env = setup();
  const appearance = {
    bodyType: "female",
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
  assert.equal(avatar.userData.bodyType, "female");
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
