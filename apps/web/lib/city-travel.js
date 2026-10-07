import * as THREE from "three";
import { createCharacter, animateCharacter } from "./characters.js";

// Small original transit tableaux illustrate a journey; they are not bookings,
// surveyed terminal interiors, live transport positions or operating timetables.
const MODES = new Set([
  "flight",
  "metro",
  "train",
  "bus",
  "tram",
  "taxi",
  "walk",
  "cycle",
]);
const clamp = (value, low = 0, high = 1) =>
  Math.max(low, Math.min(high, value));
const smooth = (value) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};
const mix = (a, b, t) => a + (b - a) * t;

function vector(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function createKit() {
  const geometries = new Set(),
    materials = new Map();
  const remember = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const boxGeometry = remember(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeometry = remember(new THREE.CylinderGeometry(1, 1, 1, 12));
  const sphereGeometry = remember(new THREE.SphereGeometry(1, 12, 8));
  function material(color, glass = false) {
    const key = `${color}:${glass}`;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: glass ? 0.34 : 0.72,
          metalness: glass ? 0.16 : 0.02,
        }),
      );
    return materials.get(key);
  }
  function mesh(parent, geometry, color, position, scale, glass = false) {
    const result = new THREE.Mesh(geometry, material(color, glass));
    result.position.set(...position);
    result.scale.set(...scale);
    result.castShadow = result.receiveShadow = true;
    parent.add(result);
    return result;
  }
  const box = (parent, color, position, scale, glass = false) =>
    mesh(parent, boxGeometry, color, position, scale, glass);
  const cylinder = (parent, color, position, scale) =>
    mesh(parent, cylinderGeometry, color, position, scale);
  const sphere = (parent, color, position, scale) =>
    mesh(parent, sphereGeometry, color, position, scale);
  function wedge(parent, color, vertices) {
    const shape = new THREE.BufferGeometry();
    const positions = [];
    // A thin triangular prism, shared only within this original model.
    const faces = [
      [0, 2, 1],
      [3, 4, 5],
      [0, 1, 4, 0, 4, 3],
      [1, 2, 5, 1, 5, 4],
      [2, 0, 3, 2, 3, 5],
    ];
    // Reverse mirrored triangular prisms so both wings keep outward normals.
    const normal = new THREE.Vector3(...vertices[1])
      .sub(new THREE.Vector3(...vertices[0]))
      .cross(
        new THREE.Vector3(...vertices[2]).sub(
          new THREE.Vector3(...vertices[0]),
        ),
      );
    const extrusion = new THREE.Vector3(...vertices[3]).sub(
      new THREE.Vector3(...vertices[0]),
    );
    const reverse = normal.dot(extrusion) < 0;
    for (const face of faces)
      for (let i = 0; i < face.length; i += 3) {
        for (const index of reverse
          ? [face[i], face[i + 2], face[i + 1]]
          : [face[i], face[i + 1], face[i + 2]])
          positions.push(...vertices[index]);
      }
    shape.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    shape.computeVertexNormals();
    return mesh(parent, remember(shape), color, [0, 0, 0], [1, 1, 1]);
  }
  function adopt(group) {
    group.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const mat of Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : [])
        materials.set(`owned:${mat.uuid}`, mat);
    });
  }
  return {
    box,
    cylinder,
    sphere,
    wedge,
    adopt,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      geometries.clear();
      materials.clear();
    },
  };
}

function traveller(kit, shirt = "#ff876e", appearance = null) {
  const color = (value, fallback) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : fallback;
  const group = createCharacter({
    // The caller's merged appearance carries the selected per-trip top colour;
    // the remaining saved identity stays the same when boarding a vehicle.
    shirt: color(appearance?.topColor, color(shirt, "#ff876e")),
    trousers: color(appearance?.bottomColor, "#34444f"),
    hair: color(appearance?.hairColor, "#302823"),
    skin: color(appearance?.skinTone, "#b87550"),
    shoes: color(appearance?.shoeColor, "#eee8df"),
    style: ["casual", "jacket", "dress", "tourist"].includes(
      appearance?.outfitStyle,
    )
      ? appearance.outfitStyle
      : "tourist",
    hairStyle: ["short", "curly", "bob", "bun"].includes(appearance?.hairStyle)
      ? appearance.hairStyle
      : "short",
  });
  group.name = "traveller";
  kit.adopt(group);
  return {
    group,
    animate(time, walking) {
      animateCharacter(group, time, walking);
    },
  };
}

function wheel(kit, group, x, z, radius = 0.48, y = radius) {
  const tyre = kit.cylinder(group, "#293543", [x, y, z], [radius, 0.2, radius]);
  tyre.rotation.x = Math.PI / 2;
  const hub = kit.cylinder(
    group,
    "#c6d0d4",
    [x, y, z + (z > 0 ? 0.12 : -0.12)],
    [radius * 0.5, 0.04, radius * 0.5],
  );
  hub.rotation.x = Math.PI / 2;
  return tyre;
}

function plane(kit) {
  const group = new THREE.Group();
  group.name = "arrival-plane";
  const fuselage = kit.cylinder(group, "#f2f0e8", [0, 3.4, 0], [1.7, 24, 1.7]);
  fuselage.rotation.z = Math.PI / 2;
  const nose = kit.sphere(group, "#f2f0e8", [12, 3.4, 0], [3.4, 1.68, 1.68]);
  nose.name = "plane-nose";
  kit.sphere(group, "#345b75", [13.5, 4.1, 0], [1.6, 0.65, 1.35]);
  const tail = kit.sphere(group, "#f2f0e8", [-12, 3.4, 0], [3.2, 1.2, 1.2]);
  tail.name = "plane-tail";
  for (const sign of [-1, 1]) {
    kit.wedge(group, "#d9e2e4", [
      [4, 2.9, sign * 1.1],
      [-7, 2.9, sign * 1.1],
      [-8, 2.9, sign * 14],
      [4, 3.2, sign * 1.1],
      [-7, 3.2, sign * 1.1],
      [-8, 3.2, sign * 14],
    ]);
    kit.wedge(group, "#ff876e", [
      [-9, 3.6, sign * 0.8],
      [-14, 3.6, sign * 0.8],
      [-14, 3.6, sign * 6],
      [-9, 3.8, sign * 0.8],
      [-14, 3.8, sign * 0.8],
      [-14, 3.8, sign * 6],
    ]);
    const engine = kit.cylinder(
      group,
      "#c8d3d7",
      [-2, 1.9, sign * 5.5],
      [0.95, 4, 0.95],
    );
    engine.rotation.z = Math.PI / 2;
    const intake = kit.cylinder(
      group,
      "#384b59",
      [0.04, 1.9, sign * 5.5],
      [0.73, 0.08, 0.73],
    );
    intake.rotation.z = Math.PI / 2;
    for (let x = -9; x < 10; x += 1.8)
      kit.box(
        group,
        "#355e75",
        [x, 3.9, sign * 1.57],
        [0.65, 0.65, 0.12],
        true,
      );
    wheel(kit, group, -4, sign * 1.7, 0.55, 0.55);
    kit.cylinder(group, "#758b96", [-4, 1.6, sign], [0.12, 2.2, 0.12]);
    kit.box(group, "#758b96", [-4, 0.95, sign * 1.35], [0.16, 0.17, 0.8]);
  }
  kit.wedge(group, "#385cf2", [
    [-13, 3.5, -0.12],
    [-9, 3.5, -0.12],
    [-14, 9.2, -0.12],
    [-13, 3.5, 0.12],
    [-9, 3.5, 0.12],
    [-14, 9.2, 0.12],
  ]);
  wheel(kit, group, 10, 0, 0.45, 0.45);
  kit.cylinder(group, "#758b96", [10, 1.4, 0], [0.1, 1.5, 0.1]);
  return { group, doors: [], wheels: [] };
}

function railVehicle(kit, mode) {
  const group = new THREE.Group();
  group.name = `${mode}-carriages`;
  const doors = [],
    wheels = [];
  const count = mode === "tram" ? 1 : 3;
  const base = mode === "tram" ? "#eec24f" : "#f1efe5";
  const stripe =
    mode === "metro" ? "#375af0" : mode === "train" ? "#43a893" : "#bd654c";
  for (let car = 0; car < count; car++) {
    const x = (car - Math.floor(count / 2)) * 11.4;
    kit.box(group, base, [x, 1.1, 0], [10.5, 1.5, 3.6]);
    kit.box(group, stripe, [x, 0.9, 0], [10.55, 0.55, 3.65]);
    kit.box(group, "#e2e4db", [x, 3.3, 0], [10.5, 0.4, 3.7]);
    kit.box(group, base, [x - 5.04, 2.35, 0], [0.35, 1.5, 3.6]);
    kit.box(group, base, [x + 5.04, 2.35, 0], [0.35, 1.5, 3.6]);
    for (const sign of [-1, 1])
      for (const windowX of [-3.4, -0.4, 2.7]) {
        const isDoor =
          car === Math.floor(count / 2) && windowX === -3.4 && sign === -1;
        const panel = kit.box(
          group,
          isDoor ? stripe : "#345b70",
          [x + windowX, 2.35, sign * 1.77],
          [isDoor ? 1.55 : 2.2, isDoor ? 2.0 : 1.12, 0.12],
          !isDoor,
        );
        if (isDoor) {
          panel.userData.closedX = panel.position.x;
          doors.push(panel);
        } else
          kit.box(
            group,
            base,
            [x + windowX + 1.32, 2.36, sign * 1.77],
            [0.43, 1.5, 0.15],
          );
      }
    for (const axle of [-3.7, 3.7])
      for (const sign of [-1, 1])
        wheels.push(wheel(kit, group, x + axle, sign * 1.6, 0.45));
    if (car < count - 1)
      kit.box(group, "#43515a", [x + 5.7, 1.9, 0], [0.9, 2.3, 2.85]);
  }
  const front = (count - Math.floor(count / 2) - 1) * 11.4 + 5.23;
  kit.box(group, "#315570", [front, 2.6, 0], [0.12, 1, 2.7], true);
  for (const z of [-1.1, 1.1])
    kit.box(group, "#ffde8b", [front + 0.1, 1.43, z], [0.14, 0.3, 0.38]);
  return { group, doors, wheels, doorX: -3.4 };
}

function roadVehicle(kit, mode) {
  const group = new THREE.Group();
  group.name = `${mode}-vehicle`;
  const bus = mode === "bus",
    length = bus ? 9 : 4.8,
    width = bus ? 2.9 : 2;
  const base = bus ? "#40ad98" : "#f4d17a";
  kit.box(
    group,
    base,
    [0, bus ? 1.2 : 0.92, 0],
    [length, bus ? 1.45 : 0.9, width],
  );
  kit.box(
    group,
    "#f3eee1",
    [bus ? 0 : -0.45, bus ? 2.63 : 1.64, 0],
    [bus ? length : 2.6, bus ? 1.42 : 1.06, width - 0.08],
  );
  kit.box(
    group,
    base,
    [bus ? 0 : -0.45, bus ? 3.36 : 2.21, 0],
    [bus ? length : 2.65, 0.2, width],
  );
  const doors = [],
    wheels = [];
  for (const sign of [-1, 1]) {
    for (const x of bus ? [-3.2, -1.2, 0.8] : [-1.3, 0.15])
      kit.box(
        group,
        "#31566d",
        [x, bus ? 2.65 : 1.75, sign * (width / 2)],
        [bus ? 1.5 : 1.1, bus ? 1.12 : 0.65, 0.06],
        true,
      );
    for (const x of bus ? [-3.0, 3.0] : [-1.55, 1.55])
      wheels.push(wheel(kit, group, x, sign * (width / 2), bus ? 0.6 : 0.45));
  }
  const doorX = bus ? 3.1 : 0.15;
  const door = kit.box(
    group,
    bus ? "#274d60" : base,
    [doorX, bus ? 1.87 : 1.14, -width / 2 - 0.04],
    [bus ? 1.5 : 1.3, bus ? 2.25 : 1.35, 0.1],
  );
  door.userData.closedX = doorX;
  doors.push(door);
  kit.box(
    group,
    "#31566d",
    [length / 2 + 0.01, bus ? 2.56 : 1.74, 0],
    [0.08, bus ? 1.16 : 0.55, width - 0.2],
    true,
  );
  for (const z of [-width * 0.33, width * 0.33])
    kit.box(group, "#ffe7a7", [length / 2 + 0.03, 1.02, z], [0.09, 0.24, 0.34]);
  if (!bus) kit.box(group, "#375af0", [-0.4, 2.39, 0], [0.55, 0.22, 0.3]);
  return { group, doors, wheels, doorX };
}

function bicycle(kit) {
  const group = new THREE.Group();
  group.name = "city-bicycle";
  const wheels = [
    wheel(kit, group, -0.8, 0, 0.56),
    wheel(kit, group, 0.8, 0, 0.56),
  ];
  for (const [a, b] of [
    [
      [-0.8, 0.56, 0],
      [0, 1.3, 0],
    ],
    [
      [0, 1.3, 0],
      [0.4, 0.55, 0],
    ],
    [
      [0.4, 0.55, 0],
      [-0.8, 0.56, 0],
    ],
    [
      [0.4, 0.55, 0],
      [0.65, 1.35, 0],
    ],
    [
      [0.65, 1.35, 0],
      [0, 1.3, 0],
    ],
    [
      [0.65, 1.35, 0],
      [0.8, 0.56, 0],
    ],
  ]) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      tube = kit.cylinder(
        group,
        "#f7856e",
        start.clone().add(end).multiplyScalar(0.5).toArray(),
        [0.055, start.distanceTo(end), 0.055],
      );
    tube.quaternion.setFromUnitVectors(
      vector(0, 1, 0),
      end.sub(start).normalize(),
    );
  }
  kit.box(group, "#354361", [0, 1.4, 0], [0.4, 0.12, 0.23]);
  kit.box(group, "#354361", [0.7, 1.45, 0], [0.12, 0.08, 0.7]);
  return { group, doors: [], wheels, doorX: 0 };
}

function stageScenery(kit, stage, mode) {
  if (mode === "flight") {
    kit.box(stage, "#97ae92", [0, -0.15, 0], [300, 0.25, 105]);
    kit.box(stage, "#5a6670", [0, 0.02, 0], [270, 0.16, 27]);
    for (let x = -122; x < 125; x += 20)
      kit.box(stage, "#fff2d5", [x, 0.13, 0], [10, 0.03, 0.7]);
    for (const sign of [-1, 1])
      for (let x = -120; x <= 120; x += 24)
        kit.box(stage, "#e8c47c", [x, 0.22, sign * 14.4], [0.55, 0.25, 0.55]);
    kit.box(stage, "#cedee0", [-75, 5.3, 34], [35, 10, 14]);
    kit.box(stage, "#4c8298", [-75, 8.9, 26.9], [33, 2.8, 0.2], true);
    kit.box(stage, "#375af0", [-63, 11, 34], [8, 1.2, 10]);
    return;
  }
  const rail = ["metro", "train", "tram"].includes(mode);
  kit.box(stage, "#abc3b0", [18, -0.18, 0], [150, 0.28, 34]);
  kit.box(
    stage,
    rail ? "#7f8c8c" : "#64717c",
    [18, 0.02, 0],
    [145, 0.16, rail ? 4.9 : 7],
  );
  kit.box(stage, "#e6d7bd", [2, 0.32, -6.4], [62, 0.7, 7.2]);
  kit.box(stage, "#edc97a", [2, 0.7, -2.96], [62, 0.03, 0.3]);
  if (rail)
    for (const z of [-1.3, 1.3])
      kit.box(stage, "#475969", [18, 0.14, z], [145, 0.16, 0.13]);
  for (const x of [-15, 10, 35]) {
    kit.box(stage, "#65706e", [x, 2.7, -8.7], [0.16, 5, 0.16]);
    kit.box(stage, "#fff1bd", [x + 0.7, 5.1, -8.7], [1.5, 0.15, 0.36]);
  }
  // Keep the shelter behind the boarding-camera sight lines, rather than
  // placing a broad roof directly between the camera and carriage doors.
  kit.box(stage, "#375af0", [-20, 4.1, -6.2], [10, 0.28, 6.7]);
  for (const x of [-24, -16])
    kit.box(stage, "#476071", [x, 2.4, -8.7], [0.21, 3.7, 0.21]);
  kit.box(stage, "#ff987e", [-20, 1.15, -7], [5.5, 0.25, 1.4]);
  for (const x of [-22, -18])
    kit.box(stage, "#475c63", [x, 0.82, -7], [0.16, 0.5, 0.9]);
  for (const x of [22, 45]) {
    kit.cylinder(stage, "#887557", [x, 1.5, -12.6], [0.2, 3, 0.2]);
    kit.sphere(stage, "#709c88", [x, 4.3, -12.6], [2, 2.7, 2]);
  }
}

function makeTableau(mode, shirt, appearance) {
  const kit = createKit(),
    stage = new THREE.Group();
  stage.name = "roam-travel";
  stageScenery(kit, stage, mode);
  const vehicle =
    mode === "flight"
      ? plane(kit)
      : ["metro", "train", "tram"].includes(mode)
        ? railVehicle(kit, mode)
        : ["bus", "taxi"].includes(mode)
          ? roadVehicle(kit, mode)
          : mode === "cycle"
            ? bicycle(kit)
            : null;
  if (vehicle) stage.add(vehicle.group);
  const avatar = mode === "flight" ? null : traveller(kit, shirt, appearance);
  if (avatar) {
    avatar.group.position.set(vehicle?.doorX || 0, 0.7, -7);
    avatar.group.rotation.y = Math.PI;
    stage.add(avatar.group);
  }
  const fill = new THREE.HemisphereLight("#f7f4df", "#859991", 2.1);
  stage.add(fill);
  const sun = new THREE.DirectionalLight("#ffecd0", 2);
  sun.position.set(-30, 55, 25);
  stage.add(sun);
  return { kit, stage, vehicle, avatar, lights: [fill, sun] };
}

function validPoint(point) {
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180
  );
}

export function createTravelRuntime({
  scene,
  camera,
  controls,
  projectGeo,
  geoY,
  onPhase,
  onFinish,
  reducedMotion = false,
}) {
  let current = null,
    destroyed = false;
  const destinationPoint = (point) => {
    const coordinates = [point.lng, point.lat],
      projected = projectGeo(coordinates),
      elevation = geoY(coordinates);
    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.z) ||
      !Number.isFinite(elevation)
    )
      return null;
    return vector(projected.x, elevation, projected.z);
  };
  const savedCamera = () => ({
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: controls.target.clone(),
    enabled: controls.enabled,
    damping: controls.enableDamping,
  });
  function placeCamera(position, target) {
    camera.position.copy(position);
    controls.target.copy(target);
    camera.lookAt(target);
  }
  function cleanup(state) {
    state.tableau.stage.removeFromParent();
    state.tableau.lights.forEach((light) => light.dispose());
    state.tableau.stage.clear();
    state.tableau.kit.dispose();
  }
  function announce(state, phase) {
    if (state.phases.has(phase)) return;
    state.phases.add(phase);
    const mode = state.sequence.mode,
      place = state.sequence.to.name || "your destination";
    const labels = {
      boarding:
        mode === "flight"
          ? state.sequence.departure
            ? "Preparing for take-off"
            : "Approaching the airport"
          : mode === "walk"
            ? "Setting off on foot"
            : mode === "cycle"
              ? "Getting ready to ride"
              : `Boarding the ${mode}`,
      travelling:
        mode === "flight"
          ? state.sequence.departure
            ? "Taking off"
            : "Landing in the city"
          : mode === "walk"
            ? "Walking through the city"
            : mode === "cycle"
              ? "Cycling to your next stop"
              : `On the ${mode}`,
      arriving: `Arriving at ${place}`,
    };
    onPhase?.({ id: state.sequence.id, phase, label: labels[phase] });
  }
  function restoreControls(state) {
    controls.enabled = state.saved.enabled;
    controls.enableDamping = state.saved.damping;
  }
  function cancel() {
    if (!current) return false;
    const state = current;
    current = null;
    cleanup(state);
    camera.position.copy(state.saved.position);
    camera.quaternion.copy(state.saved.quaternion);
    controls.target.copy(state.saved.target);
    restoreControls(state);
    controls.update?.();
    return true;
  }
  function finish(state) {
    if (current !== state) return;
    for (const phase of ["boarding", "travelling", "arriving"]) {
      if (phase === "arriving" && !state.phases.has(phase)) {
        state.tableau.stage.visible = false;
        placeCamera(state.destinationCamera, state.destination);
      }
      announce(state, phase);
      if (current !== state) return;
    }
    current = null;
    cleanup(state);
    restoreControls(state);
    placeCamera(state.destinationCamera, state.destination);
    controls.update?.();
    onFinish?.({ id: state.sequence.id, to: state.sequence.to });
  }
  function frame(state) {
    const { tableau, sequence, anchor, elapsed, duration } = state;
    const mode = sequence.mode,
      reduced = state.reduced;
    const local = (x, y, z) => vector(anchor.x + x, anchor.y + y, anchor.z + z);
    let position, target;
    if (mode === "flight") {
      const departure = !!sequence.departure;
      const progress = clamp(elapsed / 7.7);
      const x = reduced
        ? 0
        : departure
          ? mix(-65, 105, smooth(progress))
          : mix(-115, 62, smooth(progress));
      const y = reduced
        ? 0
        : departure
          ? 34 * smooth((progress - 0.25) / 0.75)
          : 34 * (1 - smooth(progress / 0.64));
      tableau.vehicle.group.position.set(x, y, 0);
      tableau.vehicle.group.rotation.z = reduced
        ? 0
        : departure
          ? 0.13 * Math.sin(progress * Math.PI)
          : -0.09 * Math.sin(progress * Math.PI);
      target = local(x, y + 3.3, 0);
      position = local(x + 44, y + 27, 42);
    } else {
      const boardingEnd = 2.75,
        transitEnd = duration - 2.3;
      const riding = clamp(
        (elapsed - boardingEnd) / (transitEnd - boardingEnd),
      );
      const x = reduced ? 0 : 72 * smooth(riding);
      if (tableau.vehicle) {
        tableau.vehicle.group.position.x = x;
        for (const wheel of tableau.vehicle.wheels)
          wheel.rotation.y = riding * -18;
        for (const door of tableau.vehicle.doors)
          door.position.x =
            door.userData.closedX +
            (reduced ? 0 : 1.4 * (1 - smooth((elapsed - 1.9) / 0.75)));
      }
      if (tableau.avatar) {
        const pedestrian = mode === "walk",
          cyclist = mode === "cycle";
        const board = reduced ? 0 : smooth(elapsed / boardingEnd);
        tableau.avatar.group.visible =
          pedestrian || cyclist || elapsed < boardingEnd;
        tableau.avatar.group.position.set(
          (tableau.vehicle?.doorX || 0) + x,
          pedestrian ? 0.7 : cyclist && elapsed >= boardingEnd ? 0.45 : 0.7,
          pedestrian
            ? -5
            : cyclist && elapsed >= boardingEnd
              ? 0
              : mix(-7, 0, board),
        );
        tableau.avatar.group.rotation.y =
          pedestrian || (cyclist && elapsed >= boardingEnd)
            ? Math.PI / 2
            : Math.PI;
        if (cyclist && elapsed >= boardingEnd)
          tableau.avatar.group.rotation.z = -0.12;
        tableau.avatar.animate(
          reduced ? 0 : elapsed,
          !reduced && (pedestrian || cyclist || elapsed < boardingEnd),
        );
        if (cyclist && elapsed >= boardingEnd) {
          const rig = tableau.avatar.group.userData.rig;
          rig.leftLeg.rotation.x = -0.8 + Math.sin(elapsed * 8) * 0.35;
          rig.rightLeg.rotation.x = -0.8 - Math.sin(elapsed * 8) * 0.35;
          rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = 0.9;
          rig.leftArm.rotation.x = rig.rightArm.rotation.x = -1.05;
          rig.torso.rotation.x = 0.2;
        }
      }
      target = local(x, 1.7, mode === "walk" ? -5 : 0);
      position = local(x + 20, 11, -29);
      if (elapsed < 3.5 && !["walk", "cycle"].includes(mode)) {
        const wide = smooth((elapsed - 2.2) / 1.3);
        target.lerp(local(tableau.vehicle?.doorX || 0, 1.5, -3), 1 - wide);
        position.lerp(
          local((tableau.vehicle?.doorX || 0) + 7, 4.5, -11),
          1 - wide,
        );
      }
    }
    if (reduced) {
      if (!state.staticCameraPlaced) {
        placeCamera(position, target);
        state.staticCameraPlaced = true;
      }
      return;
    }
    const arrivalStart = duration - 2.3;
    if (elapsed >= arrivalStart) {
      const arrival = smooth((elapsed - arrivalStart) / 2.3);
      // A cinematic cut above the real destination avoids sweeping through
      // invented scenery across the distance between two mapped places.
      position = state.destination.clone().add(
        state.destinationCamera
          .clone()
          .sub(state.destination)
          .multiplyScalar(mix(2.7, 1, arrival)),
      );
      target = state.destination.clone();
      tableau.stage.visible = false;
    }
    placeCamera(position, target);
  }
  return {
    start(sequence) {
      if (
        destroyed ||
        !sequence ||
        typeof sequence.id !== "string" ||
        !sequence.id ||
        !MODES.has(sequence.mode) ||
        !validPoint(sequence.from) ||
        !validPoint(sequence.to)
      )
        return false;
      const destination = destinationPoint(sequence.to),
        origin = destinationPoint(sequence.from);
      if (!destination || !origin) return false;
      cancel();
      const reduced =
        typeof reducedMotion === "function"
          ? !!reducedMotion()
          : !!reducedMotion;
      const duration = reduced
        ? 1
        : sequence.mode === "flight"
          ? 10.5
          : ["metro", "train"].includes(sequence.mode)
            ? 9.5
            : 9;
      const anchor =
        sequence.mode === "flight" && !sequence.departure
          ? destination.clone()
          : origin.clone();
      const range =
        Number.isFinite(sequence.to.range) && sequence.to.range > 0
          ? sequence.to.range
          : 160;
      const tableau = makeTableau(
        sequence.mode,
        sequence.shirt,
        sequence.appearance,
      );
      tableau.stage.position.copy(anchor);
      tableau.stage.userData.sequenceId = sequence.id;
      scene.add(tableau.stage);
      const state = {
        sequence,
        tableau,
        anchor,
        destination,
        destinationCamera: destination
          .clone()
          .add(vector(range * 0.7, range * 0.72, range * 0.85)),
        saved: savedCamera(),
        duration,
        elapsed: 0,
        phases: new Set(),
        reduced,
        staticCameraPlaced: false,
      };
      current = state;
      controls.enabled = false;
      controls.enableDamping = false;
      announce(state, "boarding");
      if (current === state) frame(state);
      return true;
    },
    update(dt) {
      const state = current;
      if (!state || !Number.isFinite(dt) || dt <= 0) return;
      state.elapsed = Math.min(
        state.duration,
        state.elapsed + clamp(dt, 0, 60),
      );
      if (state.elapsed >= (state.reduced ? 0.34 : 2.75))
        announce(state, "travelling");
      if (current !== state) return;
      if (state.elapsed >= (state.reduced ? 0.68 : state.duration - 2.3)) {
        if (state.reduced) {
          state.tableau.stage.visible = false;
          placeCamera(state.destinationCamera, state.destination);
        } else frame(state);
        announce(state, "arriving");
      }
      if (current !== state) return;
      if (state.elapsed >= state.duration) finish(state);
      else frame(state);
    },
    skip() {
      if (!current) return false;
      finish(current);
      return true;
    },
    cancel,
    dispose() {
      if (destroyed) return;
      cancel();
      destroyed = true;
    },
    get active() {
      return !!current;
    },
  };
}
