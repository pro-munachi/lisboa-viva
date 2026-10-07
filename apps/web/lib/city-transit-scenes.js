import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCharacter, animateCharacter } from "./characters";

// Original scenic interpretations. These are not surveyed terminals, real
// departure displays, operator assets or business floor plans.
const ZONES = {
  airport: [
    ["card", "Travel-card machine", -8.8, -3.8, -8, -1.5],
    ["check-in", "Flight desk", -2.2, -4.5, -2.5, -2.4],
    ["gate", "Departure gate", 6.8, -4.4, 5.4, -2.2],
  ],
  station: [
    ["card", "Travel-card machine", -8.8, 3.4, -7, 3.4],
    ["tickets", "Ticket machines", -4.6, -1.2, -3, 0.5],
    ["platform", "Train platform", 5.4, -3.7, 5.4, -1.7],
  ],
  "bus-stop": [
    ["card", "Travel-card point", -9.2, 1.3, -7.5, 1.3],
    ["timetable", "Route information", -4.7, -2.8, -4.7, -0.6],
    ["board", "Bus entrance", 7.4, -2.35, 7.4, -0.55],
  ],
};

function tileMap() {
  const size = 96,
    bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x % 24) - 12,
        v = (y % 24) - 12;
      const pattern =
        Math.abs(Math.abs(u) + Math.abs(v) - 8) < 1.8 || Math.abs(u * v) < 5;
      const seam = x % 24 === 0 || y % 24 === 0;
      const rgb = seam
        ? [189, 192, 174]
        : pattern
          ? [58, 115, 135]
          : [231, 233, 210];
      const at = (y * size + x) * 4;
      bytes.set([...rgb, 255], at);
    }
  const map = new THREE.DataTexture(bytes, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

export function createTransitScene(kind, { shirt = "#c58e59" } = {}) {
  if (!ZONES[kind]) throw new Error(`Unsupported transit scene: ${kind}`);
  const group = new THREE.Group();
  group.name = `ROAM original ${kind} scene`;
  const zones = ZONES[kind].map(([id, name, x, z, tx, tz]) => ({
    id,
    name,
    point: { x, z },
    target: { x: tx, z: tz },
  }));
  const spawn = { x: 0, z: 6.2 };
  const bounds = { minX: -11.6, minZ: -7.5, maxX: 11.6, maxZ: 7.5 };
  const obstacles = [],
    buckets = new Map(),
    hits = [];
  const mats = {
    floor: new THREE.MeshStandardMaterial({
      color: kind === "airport" ? "#dddccb" : "#c4c6bc",
      roughness: 0.85,
    }),
    plaster: new THREE.MeshStandardMaterial({
      color: "#e8e5d5",
      roughness: 0.92,
    }),
    blue: new THREE.MeshStandardMaterial({ color: "#366976", roughness: 0.7 }),
    sage: new THREE.MeshStandardMaterial({ color: "#7d9885", roughness: 0.86 }),
    dark: new THREE.MeshStandardMaterial({ color: "#263d47", roughness: 0.74 }),
    metal: new THREE.MeshStandardMaterial({
      color: "#8c9d9b",
      metalness: 0.45,
      roughness: 0.52,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: "#b49b60",
      metalness: 0.48,
      roughness: 0.48,
    }),
    wood: new THREE.MeshStandardMaterial({ color: "#a17a52", roughness: 0.89 }),
    ochre: new THREE.MeshStandardMaterial({
      color: "#cfa559",
      roughness: 0.88,
    }),
    white: new THREE.MeshStandardMaterial({
      color: "#f4f0df",
      roughness: 0.78,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: "#a9c5c3",
      transparent: true,
      opacity: 0.45,
      roughness: 0.22,
      side: THREE.DoubleSide,
    }),
    tiles: new THREE.MeshStandardMaterial({
      map: kind === "airport" ? tileMap() : null,
      roughness: 0.86,
      side: THREE.DoubleSide,
    }),
    screen: new THREE.MeshStandardMaterial({
      color: "#123c46",
      emissive: "#21646e",
      emissiveIntensity: 0.25,
      roughness: 0.55,
    }),
  };
  function add(
    geometry,
    material,
    x,
    y,
    z,
    zone = null,
    rotation = [0, 0, 0],
    ground = false,
  ) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    const key = `${material.uuid}:${zone || "decor"}:${ground ? "ground" : "prop"}`;
    if (!buckets.has(key))
      buckets.set(key, { material, zone, ground, geometries: [] });
    buckets.get(key).geometries.push(geometry);
  }
  const box = (
    x,
    y,
    z,
    w,
    h,
    d,
    mat = mats.plaster,
    zone = null,
    rotation = [0, 0, 0],
  ) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, zone, rotation);
  const cylinder = (
    x,
    y,
    z,
    radius,
    height,
    mat = mats.metal,
    zone = null,
    rotation = [0, 0, 0],
  ) =>
    add(
      new THREE.CylinderGeometry(radius, radius, height, 12),
      mat,
      x,
      y,
      z,
      zone,
      rotation,
    );
  function footprint(x, z, width, depth, zone = null) {
    obstacles.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      zone,
    });
  }
  function sign(text, x, y, z, width, height, zone = null) {
    let material = mats.dark;
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 768;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#263d47";
        context.fillRect(0, 0, 768, 256);
        context.fillStyle = "#f0eddc";
        context.textAlign = "center";
        context.textBaseline = "middle";
        const lines = text.split("\n");
        let size = lines.length > 1 ? 42 : 55;
        while (size > 22) {
          context.font = `600 ${size}px Arial`;
          if (lines.every((line) => context.measureText(line).width <= 720))
            break;
          size--;
        }
        lines.forEach((line, i) =>
          context.fillText(
            line,
            384,
            128 + (i - (lines.length - 1) / 2) * (size + 14),
          ),
        );
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        material = new THREE.MeshStandardMaterial({
          map,
          roughness: 0.86,
          side: THREE.DoubleSide,
        });
      }
    }
    add(new THREE.PlaneGeometry(width, height), material, x, y, z, zone);
  }
  function bench(x, z, width = 3.8, zone = null) {
    box(x, 0.62, z, width, 0.18, 0.72, mats.wood, zone);
    box(x, 1.07, z - 0.32, width, 0.65, 0.14, mats.wood, zone);
    for (const side of [-1, 1]) {
      box(
        x + side * (width / 2 - 0.35),
        0.31,
        z,
        0.14,
        0.62,
        0.55,
        mats.metal,
        zone,
      );
      box(
        x + side * (width / 2 - 0.15),
        0.95,
        z,
        0.1,
        0.1,
        0.7,
        mats.metal,
        zone,
      );
    }
    footprint(x, z, width + 0.1, 0.85, zone);
  }
  function machine(x, z, zone, title) {
    box(x, 0.18, z, 1.15, 0.36, 1.05, mats.dark, zone);
    box(x, 1.2, z, 1.05, 1.75, 0.78, mats.blue, zone);
    box(x, 1.55, z + 0.405, 0.73, 0.55, 0.035, mats.screen, zone);
    box(x, 1.03, z + 0.44, 0.45, 0.15, 0.08, mats.metal, zone);
    box(x + 0.34, 1.03, z + 0.47, 0.12, 0.22, 0.06, mats.ochre, zone);
    box(x, 0.61, z + 0.43, 0.64, 0.12, 0.07, mats.dark, zone);
    sign(title, x, 2.23, z + 0.42, 1.3, 0.35, zone);
    footprint(x, z, 1.25, 1.15, zone);
  }
  function bag(x, z, zone, color = mats.ochre) {
    box(x, 0.46, z, 0.46, 0.69, 0.34, color, zone);
    box(x, 0.87, z, 0.07, 0.17, 0.06, mats.metal, zone);
    box(x, 0.98, z, 0.34, 0.06, 0.08, mats.dark, zone);
    box(x, 0.46, z + 0.18, 0.035, 0.64, 0.035, mats.brass, zone);
    for (const side of [-1, 1])
      cylinder(x + side * 0.16, 0.07, z + 0.12, 0.06, 0.045, mats.dark, zone, [
        Math.PI / 2,
        0,
        0,
      ]);
    footprint(x, z, 0.52, 0.4, zone);
  }
  function plant(x, z) {
    cylinder(x, 0.34, z, 0.34, 0.65, mats.wood);
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      add(
        new THREE.ConeGeometry(0.16, 1.1, 5),
        mats.sage,
        x + Math.cos(angle) * 0.18,
        1.03,
        z + Math.sin(angle) * 0.18,
        null,
        [0.15 * Math.sin(angle), angle, 0.18 * Math.cos(angle)],
      );
    }
    footprint(x, z, 0.8, 0.8);
  }
  // One clear floor provides the raycast walking plane for every scene.
  add(
    new THREE.BoxGeometry(24, 0.02, 16),
    mats.floor,
    0,
    0,
    0,
    null,
    [0, 0, 0],
    true,
  );
  const people = [];

  if (kind === "airport") {
    add(new THREE.PlaneGeometry(24, 3.8), mats.plaster, 0, 1.9, -7.6);
    add(new THREE.PlaneGeometry(24, 0.7), mats.tiles, 0, 0.4, -7.56);
    for (let i = 0; i < 7; i++) {
      box(-10.4 + i * 3.45, 2.1, -7.45, 3.15, 2.2, 0.07, mats.glass);
      box(-12 + i * 3.45, 1.9, -7.35, 0.13, 3.8, 0.14, mats.metal);
    }
    sign("ROAM · LISBOA\nORIGINAL TERMINAL", 1, 3.12, -7.28, 7.5, 0.85);
    machine(-8.8, -3.8, "card", "TRAVEL CARD");
    box(-2.2, 0.72, -4.5, 5.2, 1.4, 1.6, mats.wood, "check-in");
    box(-2.2, 1.45, -4.5, 5.5, 0.13, 1.76, mats.white, "check-in");
    box(-2.2, 0.72, -3.67, 4.95, 0.64, 0.035, mats.tiles, "check-in");
    footprint(-2.2, -4.5, 5.5, 1.76, "check-in");
    for (const x of [-3.6, -0.8]) {
      box(x, 1.67, -4.5, 0.8, 0.48, 0.12, mats.dark, "check-in");
      cylinder(x, 1.51, -4.5, 0.06, 0.3, mats.metal, "check-in");
      box(x + 0.5, 1.53, -4.03, 0.35, 0.12, 0.22, mats.ochre, "check-in");
    }
    sign("FLIGHT DESK", -2.2, 2.8, -5.85, 4, 0.5, "check-in");
    for (const x of [-4.2, -0.4]) {
      for (const z of [-2.9, -0.5]) {
        cylinder(x, 0.47, z, 0.055, 0.93, mats.metal, "check-in");
        cylinder(x, 0.04, z, 0.18, 0.05, mats.dark, "check-in");
      }
      box(x, 0.9, -1.7, 0.035, 0.055, 2.4, mats.dark, "check-in");
      footprint(x, -1.7, 0.38, 2.78, "check-in");
    }
    for (const x of [5.9, 7.7]) {
      box(x, 0.98, -4.4, 0.45, 1.96, 0.55, mats.blue, "gate");
      footprint(x, -4.4, 0.55, 0.65, "gate");
    }
    box(6.8, 2.7, -4.4, 2.85, 0.45, 0.35, mats.dark, "gate");
    sign("GATE · ROAM", 6.8, 2.7, -4.2, 2.6, 0.36, "gate");
    box(6.8, 0.96, -4.4, 1.3, 0.9, 0.06, mats.glass, "gate");
    footprint(6.8, -4.4, 1.4, 0.15, "gate");
    sign(
      "JOURNEY BOARD\nROAM FLIGHT · PLAN YOUR TRIP",
      7,
      3.12,
      -7.23,
      5.2,
      0.85,
      "gate",
    );
    bench(5.8, 2.8, 4.6, "gate");
    bench(-7.5, 4, 3.4, "card");
    plant(-10.3, -6.4);
    plant(10.3, 3.6);
    bag(3.05, 3.5, "gate");
    bag(-1, -5.65, "check-in", mats.blue);
    people.push(
      {
        name: "Airport host",
        x: -2.2,
        z: -5.9,
        zone: "check-in",
        shirt: "#537a75",
        angle: 0,
      },
      {
        name: "Traveller",
        x: 2.4,
        z: 3.4,
        zone: "gate",
        shirt: "#b88359",
        angle: -0.6,
      },
    );
  } else if (kind === "station") {
    // Track and train are floor blockers; the platform remains clear and level.
    box(0, 0.025, -5.5, 24, 0.03, 4, mats.dark, "platform");
    footprint(0, -5.5, 24, 4, "platform");
    for (const z of [-4.3, -6.2])
      box(0, 0.08, z, 24, 0.08, 0.1, mats.metal, "platform");
    for (let i = 0; i < 24; i++)
      box(-11.5 + i, 0.04, -5.25, 0.18, 0.045, 2.65, mats.wood, "platform");
    box(0, 0.032, -3.26, 23.4, 0.022, 0.22, mats.ochre, "platform");
    box(0, 0.58, -5.15, 20.7, 0.5, 2.6, mats.blue, "platform");
    box(0, 3.03, -5.15, 20.7, 0.25, 2.65, mats.white, "platform");
    box(0, 1.95, -6.45, 20.7, 2.05, 0.13, mats.white, "platform");
    for (const [x, w] of [
      [-3, 14.5],
      [8.8, 3.1],
    ])
      box(x, 1.87, -3.83, w, 1.95, 0.11, mats.white, "platform");
    for (const x of [-10.3, 10.3])
      box(x, 1.85, -5.15, 0.13, 2.1, 2.65, mats.blue, "platform");
    for (let i = 0; i < 10; i++) {
      const x = -9.25 + i * 1.86;
      if (x > 4.3 && x < 6.7) continue;
      box(x, 2.15, -3.76, 1.42, 0.76, 0.06, mats.glass, "platform");
      box(x, 2.15, -3.72, 1.55, 0.89, 0.03, mats.dark, "platform");
      box(x, 2.15, -3.68, 1.37, 0.7, 0.035, mats.glass, "platform");
    }
    for (const x of [-8, -5, 5, 8])
      for (const z of [-3.97, -6.33])
        cylinder(x, 0.35, z, 0.33, 0.2, mats.dark, "platform", [
          Math.PI / 2,
          0,
          0,
        ]);
    // A visible doorway and step, without pretending the train interior is enterable.
    box(5.5, 1.8, -4.1, 1.65, 2.2, 0.3, mats.dark, "platform");
    box(5.5, 0.6, -3.65, 1.7, 0.15, 0.65, mats.metal, "platform");
    footprint(5.5, -3.65, 1.8, 0.7, "platform");
    for (const side of [-1, 1])
      box(
        5.5 + side * 0.88,
        1.85,
        -3.78,
        0.12,
        2.25,
        0.12,
        mats.brass,
        "platform",
      );
    sign("ROAM · REGIONAL", -0.8, 1.15, -3.74, 4.8, 0.4, "platform");
    machine(-8.8, 3.4, "card", "TRAVEL CARD");
    machine(-4.6, -1.2, "tickets", "TRAIN TICKETS");
    machine(-6.2, -1.2, "tickets", "ROAM ROUTES");
    bench(4.1, 3.4, 4.5, "platform");
    for (const x of [-10.9, 10.9]) {
      box(x, 1.8, -1.6, 0.2, 3.6, 0.2, mats.metal);
      footprint(x, -1.6, 0.28, 0.28);
    }
    box(0, 3.5, -1.6, 22.1, 0.18, 1.4, mats.blue);
    sign(
      "ROAM STATION\nSIMULATED JOURNEYS",
      1,
      2.8,
      -1.48,
      5.5,
      0.78,
      "tickets",
    );
    sign("PLATFORM · WAIT HERE", 7.8, 2.84, -1.46, 3.5, 0.48, "platform");
    bag(-7.05, 1.9, "tickets", mats.sage);
    plant(10.2, 5.6);
    people.push(
      {
        name: "Station attendant",
        x: 8.4,
        z: -0.2,
        zone: "platform",
        shirt: "#4f7379",
        angle: -0.65,
      },
      {
        name: "Train traveller",
        x: -6.4,
        z: 2,
        zone: "tickets",
        shirt: "#b88763",
        angle: 0.4,
      },
    );
  } else {
    box(4.8, 0.022, -4.2, 14.2, 0.025, 6.2, mats.dark, "board");
    box(0, 0.025, -1.08, 23.5, 0.03, 0.16, mats.white);
    // Parked broadside bus; a front-facing entrance is marked by its doorway.
    box(4.8, 0.56, -3.85, 12.2, 0.28, 2.9, mats.blue, "board");
    box(4.8, 0.92, -5.25, 12.1, 0.72, 0.13, mats.blue, "board");
    box(4.8, 2.76, -3.85, 12.2, 0.28, 2.9, mats.white, "board");
    box(4.8, 1.86, -5.25, 12.1, 1.45, 0.12, mats.white, "board");
    for (const [x, w] of [
      [2.6, 7.75],
      [9.55, 2.2],
    ]) {
      box(x, 0.92, -2.44, w, 0.72, 0.13, mats.blue, "board");
      box(x, 1.82, -2.44, w, 1.42, 0.13, mats.white, "board");
    }
    for (const x of [-1.25, 10.85])
      box(x, 1.78, -3.85, 0.14, 1.65, 2.85, mats.blue, "board");
    for (const x of [-0.3, 1.2, 2.7, 4.2, 5.7, 9.3]) {
      box(x, 2.03, -2.34, 1.3, 0.94, 0.09, mats.dark, "board");
      box(x, 2.03, -2.27, 1.18, 0.82, 0.035, mats.glass, "board");
    }
    for (const x of [1, 8.4])
      for (const z of [-2.45, -5.23])
        cylinder(x, 0.44, z, 0.43, 0.2, mats.dark, "board", [
          Math.PI / 2,
          0,
          0,
        ]);
    box(7.4, 1.74, -2.62, 1.5, 1.95, 0.35, mats.dark, "board");
    box(7.4, 0.37, -2.1, 1.65, 0.13, 0.6, mats.metal, "board");
    footprint(7.4, -2.1, 1.8, 0.7, "board");
    for (const x of [6.6, 8.2])
      box(x, 1.7, -2.38, 0.1, 2, 0.1, mats.brass, "board");
    sign("ROAM · LISBOA", 3, 1.1, -2.31, 3.8, 0.4, "board");
    footprint(4.8, -3.85, 12.4, 3.05, "board");
    // Shelter remains open towards the pavement and the visitor.
    for (const x of [-8.1, -1.7])
      for (const z of [-3.1, -1.05]) {
        box(x, 1.45, z, 0.12, 2.9, 0.12, mats.metal, "timetable");
        footprint(x, z, 0.24, 0.24, "timetable");
      }
    box(-4.9, 2.93, -2.08, 6.75, 0.18, 2.4, mats.blue, "timetable");
    box(-4.9, 1.4, -3.13, 6.3, 2.5, 0.07, mats.glass, "timetable");
    footprint(-4.9, -3.13, 6.45, 0.1, "timetable");
    bench(-5.4, -2.33, 4.3, "timetable");
    sign("ROAM · BUS STOP", -4.9, 2.65, -3.02, 4.3, 0.36, "timetable");
    box(-2.6, 1.56, -2.92, 1.1, 1.35, 0.14, mats.white, "timetable");
    sign(
      "ROAM ROUTES\nPLAN · WAIT · BOARD",
      -2.6,
      1.6,
      -2.82,
      1,
      0.95,
      "timetable",
    );
    machine(-9.2, 1.3, "card", "TRAVEL CARD");
    cylinder(-10.7, 1.65, -2.2, 0.07, 3.3, mats.metal, "timetable");
    cylinder(-10.7, 3.02, -2.2, 0.48, 0.08, mats.ochre, "timetable", [
      Math.PI / 2,
      0,
      0,
    ]);
    footprint(-10.7, -2.2, 0.22, 0.22, "timetable");
    bag(-0.15, 2.05, "board", mats.sage);
    plant(10.6, 5.5);
    people.push(
      {
        name: "Neighbourhood commuter",
        x: -0.85,
        z: 2,
        zone: "board",
        shirt: "#b48762",
        angle: -0.6,
      },
      {
        name: "Bus-stop host",
        x: -2,
        z: 1,
        zone: "timetable",
        shirt: "#5b8070",
        angle: 0.4,
      },
    );
  }

  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach((source) => source.dispose());
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.castShadow = !bucket.ground && bucket.material !== mats.glass;
    mesh.receiveShadow = true;
    if (bucket.zone) {
      mesh.userData.zone = bucket.zone;
      hits.push(mesh);
    }
    if (bucket.ground) mesh.userData.roomGround = true;
    group.add(mesh);
  }
  const residents = people.map((person, i) => {
    const resident = createCharacter({
      shirt: person.shirt || shirt,
      skin: i ? "#b88b69" : "#986746",
      trousers: "#344d50",
      style: i ? "tourist" : "local",
      hairStyle: i ? "curly" : "short",
      phase: i * 1.6,
    });
    resident.position.set(person.x, 0.02, person.z);
    resident.rotation.y = person.angle;
    resident.name = person.name;
    resident.userData.npc = {
      name: person.name,
      zone: person.zone,
      simulated: true,
    };
    resident.traverse((node) => {
      if (node.isMesh) node.userData.zone = person.zone;
    });
    footprint(person.x, person.z, 0.58, 0.58, person.zone);
    group.add(resident);
    return resident;
  });
  const focus = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.4, 32),
    new THREE.MeshBasicMaterial({
      color: "#547c6a",
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  focus.rotation.x = -Math.PI / 2;
  focus.userData.interiorFocus = true;
  group.add(focus);
  group.userData.room = {
    kind,
    width: 24,
    depth: 16,
    bounds,
    obstacles,
    approximate: true,
    transit: true,
  };
  group.userData.zones = zones;
  let poseTime = 0;
  function update(time, dt, motion, activeZoneId) {
    if (motion && Number.isFinite(dt))
      poseTime += THREE.MathUtils.clamp(dt, 0, 0.1);
    residents.forEach((resident, i) => {
      animateCharacter(resident, poseTime + i * 0.3, false);
      if (activeZoneId === people[i].zone && resident.userData.rig) {
        resident.userData.rig.rightArm.rotation.x = -0.35;
        resident.userData.rig.rightElbow.rotation.x = -0.7;
      }
    });
    const zone = zones.find((item) => item.id === activeZoneId);
    focus.visible = Boolean(zone);
    if (zone) focus.position.set(zone.target.x, 0.028, zone.target.z);
  }
  return {
    group,
    zones,
    spawn,
    actorSpawn: spawn,
    residents,
    update,
    bounds,
    obstacles,
    blockers: obstacles,
    hits,
  };
}
