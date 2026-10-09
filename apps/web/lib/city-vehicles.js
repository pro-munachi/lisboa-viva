import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Original, metre-scaled street vehicles. +Z is the front, matching the city's
// road sampler. These are recognisable silhouettes, not licensed vehicle assets.
export const CITY_VEHICLE_DIMENSIONS = Object.freeze({
  sedan: { width: 1.78, length: 4.45, height: 1.52 },
  hatchback: { width: 1.74, length: 3.92, height: 1.58 },
  taxi: { width: 1.82, length: 4.62, height: 1.65 },
  bus: { width: 2.5, length: 10.5, height: 3.18 },
  tram: { width: 2.2, length: 8.2, height: 3.7 },
});

function panel(points) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 1; i < points.length - 1; i++)
    positions.push(...points[0], ...points[i], ...points[i + 1]);
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function loft(rings) {
  const vertices = [];
  // A chamfered cross-section creates a rounded bonnet, belt line and shoulders.
  const section = (r) => [
    [-r.w * 0.82, r.bottom, r.z],
    [-r.w, r.bottom + 0.14, r.z],
    [-r.w, r.top - 0.12, r.z],
    [-r.w * 0.85, r.top, r.z],
    [r.w * 0.85, r.top, r.z],
    [r.w, r.top - 0.12, r.z],
    [r.w, r.bottom + 0.14, r.z],
    [r.w * 0.82, r.bottom, r.z],
  ];
  const ps = rings.map(section);
  for (let n = 1; n < ps.length; n++)
    for (let k = 0; k < 8; k++) {
      const next = (k + 1) % 8;
      vertices.push(...ps[n - 1][k], ...ps[n][k], ...ps[n][next]);
      vertices.push(...ps[n - 1][k], ...ps[n][next], ...ps[n - 1][next]);
    }
  for (const [ring, reverse] of [
    [ps[0], false],
    [ps.at(-1), true],
  ])
    for (let k = 1; k < 7; k++)
      vertices.push(
        ...ring[0],
        ...(reverse ? ring[k + 1] : ring[k]),
        ...(reverse ? ring[k] : ring[k + 1]),
      );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function createCityVehicle({
  kind = "sedan",
  color = "#d9dfde",
  operator = "carris",
  articulated = false,
} = {}) {
  if (!CITY_VEHICLE_DIMENSIONS[kind]) kind = "sedan";
  const group = new THREE.Group();
  group.name = `street-${kind}`;
  const dimensions = { ...CITY_VEHICLE_DIMENSIONS[kind] };
  if (kind === "bus" && operator === "metropolitana") dimensions.length = 12;
  group.userData.vehicle = {
    kind,
    operator: kind === "bus" ? operator : null,
    ...dimensions,
  };
  const palette = {
    body:
      kind === "bus" || kind === "tram"
        ? "#f3c92f"
        : kind === "taxi"
          ? "#242e31"
          : color,
    glass: "#29495a",
    rubber: "#202a30",
    trim: "#b9c8cd",
    white: "#fff1ca",
    red: "#d64543",
    amber: "#ffb72d",
    cream: kind === "taxi" ? "#7ecfb8" : "#f2efdc",
  };
  const buckets = new Map();
  const partBuckets = [],
    wheels = [],
    doors = [];
  let activeBuckets = buckets,
    activeOrigin = null;
  const part = (name, origin, metadata, build) => {
    const target = new THREE.Group(),
      geometryBuckets = new Map();
    target.name = name;
    target.position.set(...origin);
    Object.assign(target.userData, metadata);
    const previousBuckets = activeBuckets,
      previousOrigin = activeOrigin;
    activeBuckets = geometryBuckets;
    activeOrigin = origin;
    build();
    activeBuckets = previousBuckets;
    activeOrigin = previousOrigin;
    group.add(target);
    partBuckets.push({ target, buckets: geometryBuckets });
    return target;
  };
  const add = (geometry, material, x = 0, y = 0, z = 0, rotation) => {
    if (rotation)
      geometry.applyMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)),
      );
    geometry.translate(x, y, z);
    if (activeOrigin)
      geometry.translate(-activeOrigin[0], -activeOrigin[1], -activeOrigin[2]);
    const nonindexed = geometry.index ? geometry.toNonIndexed() : geometry;
    if (nonindexed !== geometry) geometry.dispose();
    for (const attr of Object.keys(nonindexed.attributes))
      if (!["position", "normal"].includes(attr))
        nonindexed.deleteAttribute(attr);
    if (!activeBuckets.has(material)) activeBuckets.set(material, []);
    activeBuckets.get(material).push(nonindexed);
  };
  const box = (w, h, d, mat, x, y, z) =>
    add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const wheelBits = (x, z, radius, width, y = radius) => {
    add(
      new THREE.CylinderGeometry(radius, radius, width, 18),
      "rubber",
      x,
      y,
      z,
      [0, 0, Math.PI / 2],
    );
    add(
      new THREE.CylinderGeometry(
        radius * 0.56,
        radius * 0.56,
        width + 0.015,
        14,
      ),
      "trim",
      x,
      y,
      z,
      [0, 0, Math.PI / 2],
    );
    for (let n = 0; n < 5; n++) {
      const a = (n * Math.PI * 2) / 5;
      add(
        new THREE.SphereGeometry(radius * 0.055, 5, 4),
        "rubber",
        x + Math.sign(x) * (width / 2 + 0.015),
        y + Math.cos(a) * radius * 0.28,
        z + Math.sin(a) * radius * 0.28,
      );
    }
  };
  const wheel = (x, z, radius, width, y = radius) => {
    if (!articulated) return wheelBits(x, z, radius, width, y);
    wheels.push(
      part("rolling wheel", [x, y, z], { spinAxis: "x", radius }, () =>
        wheelBits(x, z, radius, width, y),
      ),
    );
  };
  const light = (x, y, z, rear = false) =>
    box(
      kind === "bus" ? 0.28 : 0.38,
      0.13,
      0.045,
      rear ? "red" : "white",
      x,
      y,
      z,
    );
  // Simple vector pixels keep the destination display legible without a canvas
  // texture or a DOM dependency. It deliberately says CITY, not a live route.
  const glyphs = {
    C: ["111", "100", "100", "100", "111"],
    I: ["111", "010", "010", "010", "111"],
    T: ["111", "010", "010", "010", "010"],
    Y: ["101", "101", "010", "010", "010"],
    2: ["111", "001", "111", "100", "111"],
    8: ["111", "101", "111", "101", "111"],
  };
  const sign = (word, y, z, pixel = 0.055) => {
    const extent = word.length * pixel * 4;
    [...word].forEach((letter, n) =>
      glyphs[letter]?.forEach((row, j) =>
        [...row].forEach((on, i) => {
          if (on === "1")
            box(
              pixel * 0.7,
              pixel * 0.7,
              0.012,
              "amber",
              -extent / 2 + (n * 4 + i) * pixel,
              y + (2 - j) * pixel,
              z,
            );
        }),
      ),
    );
  };

  if (kind === "bus") {
    const half = dimensions.length / 2;
    add(
      loft([
        { z: -half, w: 1.1, bottom: 0.35, top: 2.95 },
        { z: -half + 0.35, w: 1.25, bottom: 0.32, top: 3.1 },
        { z: half - 0.7, w: 1.25, bottom: 0.32, top: 3.1 },
        { z: half - 0.1, w: 1.16, bottom: 0.37, top: 2.97 },
        { z: half, w: 1.1, bottom: 0.43, top: 2.68 },
      ]),
      "body",
    );
    // Rounded front windscreen, a separate lower bumper, side windows, pillars,
    // doors and rooftop air-conditioning distinguish a low-floor city bus.
    add(
      panel([
        [-1.04, 1.05, half + 0.012],
        [1.04, 1.05, half + 0.012],
        [1.08, 2.6, half - 0.095],
        [-1.08, 2.6, half - 0.095],
      ]),
      "glass",
    );
    box(2.05, 0.34, 0.035, "rubber", 0, 2.72, half - 0.08);
    sign("CITY", 2.73, half - 0.055, 0.068);
    box(2.25, 0.21, 0.17, "rubber", 0, 0.49, half + 0.06);
    box(1.94, 0.08, 0.03, "trim", 0, 0.7, half + 0.11);
    for (const x of [-0.83, 0.83]) {
      light(x, 0.78, half + 0.09);
      light(x, 0.76, -half - 0.02, true);
    }
    const count = Math.floor((dimensions.length - 1.6) / 1.05);
    for (const side of [-1, 1]) {
      for (let n = 0; n < count; n++) {
        const z = -half + 0.86 + n * 1.05;
        box(0.023, 1.14, 0.92, "glass", side * 1.257, 2.05, z);
        box(0.028, 0.042, 0.88, "trim", side * 1.271, 2.18, z);
      }
      box(
        0.055,
        0.15,
        dimensions.length - 0.9,
        "rubber",
        side * 1.265,
        0.73,
        -0.1,
      );
      box(0.24, 0.38, 0.12, "rubber", side * 1.46, 2.14, half - 0.26);
      box(0.09, 0.09, 0.6, "body", side * 1.3, 2.39, half - 0.49);
    }
    for (const z of [half - 1.3, -0.4]) {
      const buildDoor = () => {
        box(0.04, 2.03, 1.15, "rubber", -1.285, 1.47, z);
        for (const dz of [-0.28, 0.28])
          box(0.05, 1.76, 0.45, "glass", -1.31, 1.52, z + dz);
        box(0.07, 0.05, 0.045, "amber", -1.36, 1.05, z + 0.48);
      };
      if (articulated) {
        // A dark entry recess remains behind the sliding glazed door.
        box(0.028, 2.0, 1.12, "rubber", -1.27, 1.47, z);
        doors.push(
          part(
            "sliding boarding door",
            [-1.285, 1.47, z],
            { closedX: z, slideAxis: "z", slideDistance: -1.24 },
            buildDoor,
          ),
        );
      } else buildDoor();
    }
    for (const x of [-1.19, 1.19])
      for (const z of [half - 2.0, -half + 2.15]) wheel(x, z, 0.48, 0.27);
    box(1.55, 0.18, 2.25, "cream", 0, 3.11, -1.45);
    for (let n = 0; n < 7; n++)
      box(1.34, 0.015, 0.025, "rubber", 0, 3.205, -2.15 + n * 0.2);
    // A lower pale ribbon differentiates the regional visual variant. Operator
    // names refer to inspiration, not an exact liveried or tracked fleet model.
    if (operator === "metropolitana")
      for (const side of [-1, 1])
        box(
          0.028,
          0.24,
          dimensions.length - 1.0,
          "cream",
          side * 1.274,
          1.17,
          -0.1,
        );
  } else if (kind === "tram") {
    add(
      loft([
        { z: -4.1, w: 0.87, bottom: 0.42, top: 2.83 },
        { z: -3.78, w: 1.1, bottom: 0.4, top: 2.99 },
        { z: 3.78, w: 1.1, bottom: 0.4, top: 2.99 },
        { z: 4.1, w: 0.87, bottom: 0.42, top: 2.83 },
      ]),
      "body",
    );
    add(
      loft([
        { z: -4.12, w: 0.92, bottom: 2.78, top: 3.05 },
        { z: -3.68, w: 1.12, bottom: 2.82, top: 3.18 },
        { z: 3.68, w: 1.12, bottom: 2.82, top: 3.18 },
        { z: 4.12, w: 0.92, bottom: 2.78, top: 3.05 },
      ]),
      "cream",
    );
    for (const side of [-1, 1]) {
      for (let n = 0; n < 7; n++)
        box(0.025, 1.0, 0.77, "glass", side * 1.11, 2.06, -2.96 + n * 0.98);
      box(0.025, 0.11, 7.52, "cream", side * 1.119, 1.49, 0);
      box(0.03, 1.78, 0.82, "rubber", side * 1.12, 1.39, 3.43);
      for (const dz of [-0.2, 0.2])
        box(0.032, 1.25, 0.34, "glass", side * 1.145, 1.6, 3.43 + dz);
    }
    for (const z of [-4.115, 4.115]) {
      box(1.46, 1.0, 0.022, "glass", 0, 2.08, z);
      box(1.57, 0.23, 0.03, "rubber", 0, 2.74, z);
      box(1.53, 0.15, 0.23, "rubber", 0, 0.61, z);
      add(
        new THREE.CylinderGeometry(0.12, 0.12, 0.04, 14),
        "white",
        0,
        1.12,
        z + Math.sign(z) * 0.04,
        [Math.PI / 2, 0, 0],
      );
    }
    sign("28", 2.75, 4.143, 0.04);
    for (const x of [-0.82, 0.82])
      for (const z of [-2.25, 2.25]) wheel(x, z, 0.36, 0.2);
    box(0.05, 0.53, 0.05, "rubber", 0, 3.43, -0.4);
    box(0.05, 0.05, 1.45, "rubber", 0, 3.66, -0.3);
    box(0.83, 0.05, 0.06, "trim", 0, 3.7, -1.0);
  } else {
    const half = dimensions.length / 2;
    const hatch = kind === "hatchback";
    add(
      loft([
        { z: -half, w: 0.76, bottom: 0.35, top: 0.85 },
        { z: -half + 0.3, w: dimensions.width / 2, bottom: 0.29, top: 0.98 },
        { z: -0.92, w: dimensions.width / 2, bottom: 0.3, top: 1.03 },
        { z: 0.94, w: dimensions.width / 2, bottom: 0.3, top: 0.99 },
        { z: half - 0.25, w: 0.82, bottom: 0.35, top: 0.84 },
        { z: half, w: 0.71, bottom: 0.39, top: 0.7 },
      ]),
      "body",
    );
    const back = hatch ? -1.42 : -1.3;
    const rearRoof = hatch ? -0.98 : -0.68;
    const top = hatch ? 1.54 : 1.47;
    add(
      loft([
        { z: back, w: 0.79, bottom: 0.85, top: 1.04 },
        { z: rearRoof, w: 0.66, bottom: 0.87, top },
        { z: 0.45, w: 0.67, bottom: 0.88, top },
        { z: 1.04, w: 0.79, bottom: 0.84, top: 1.06 },
      ]),
      kind === "taxi" ? "cream" : "body",
    );
    add(
      panel([
        [-0.755, 1.04, 1.049],
        [0.755, 1.04, 1.049],
        [0.636, top - 0.055, 0.452],
        [-0.636, top - 0.055, 0.452],
      ]),
      "glass",
    );
    add(
      panel([
        [0.756, 1.0, back - 0.009],
        [-0.756, 1.0, back - 0.009],
        [-0.635, top - 0.055, rearRoof - 0.009],
        [0.635, top - 0.055, rearRoof - 0.009],
      ]),
      "glass",
    );
    for (const side of [-1, 1]) {
      if (!(articulated && kind === "taxi" && side === 1))
        add(
          panel([
            [side * 0.798, 1.04, 0.98],
            [side * 0.684, top - 0.075, 0.41],
            [side * 0.675, top - 0.075, -0.12],
            [side * 0.796, 1.04, -0.12],
          ]),
          "glass",
        );
      add(
        panel([
          [side * 0.798, 1.04, -0.22],
          [side * 0.677, top - 0.075, -0.22],
          [side * 0.675, top - 0.075, rearRoof + 0.065],
          [side * 0.798, 1.04, back + 0.1],
        ]),
        "glass",
      );
      box(0.022, 0.03, 2.02, "trim", side * 0.809, 1.018, -0.1);
      box(
        0.022,
        0.015,
        1.27,
        "rubber",
        side * (dimensions.width / 2 + 0.004),
        0.71,
        -0.1,
      );
      for (const z of [-0.68, 0.4])
        box(
          0.028,
          0.028,
          0.17,
          "trim",
          side * (dimensions.width / 2 + 0.012),
          0.9,
          z,
        );
      box(0.16, 0.11, 0.27, "body", side * 0.944, 1.055, 0.8);
      for (const z of [-half + 0.87, half - 0.8])
        wheel(side * (dimensions.width / 2 - 0.045), z, 0.315, 0.2);
    }
    for (const x of [-0.53, 0.53]) {
      light(x, 0.73, half + 0.018);
      light(x, 0.77, -half - 0.018, true);
    }
    box(1.26, 0.13, 0.032, "rubber", 0, 0.55, half + 0.025);
    for (let n = 0; n < 4; n++)
      box(0.84, 0.012, 0.018, "trim", 0, 0.515 + n * 0.024, half + 0.045);
    for (const z of [-half - 0.038, half + 0.05])
      box(0.35, 0.1, 0.018, "white", 0, 0.42, z);
    if (kind === "taxi") {
      box(0.47, 0.16, 0.24, "white", 0, 1.59, -0.12);
      box(0.36, 0.06, 0.013, "amber", 0, 1.605, 0.008);
      if (articulated) {
        box(0.018, 0.56, 1.12, "rubber", 0.899, 0.72, 0.41);
        const door = part(
          "hinged passenger door",
          [0.91, 0, 0.98],
          { closedX: 0.41, hingeAxis: "y", openAngle: -1.05 },
          () => {
            add(
              panel([
                [0.924, 0.43, -0.14],
                [0.924, 1.02, -0.14],
                [0.924, 0.99, 0.95],
                [0.924, 0.43, 0.95],
              ]),
              "body",
            );
            add(
              panel([
                [0.798, 1.04, 0.98],
                [0.684, top - 0.075, 0.41],
                [0.675, top - 0.075, -0.12],
                [0.796, 1.04, -0.12],
              ]),
              "glass",
            );
            box(0.022, 0.03, 1.04, "trim", 0.809, 1.018, 0.43);
            box(0.035, 0.03, 0.18, "trim", 0.94, 0.9, 0.05);
          },
        );
        doors.push(door);
      }
    }
  }
  let triangles = 0;
  const materials = new Map();
  for (const { target, buckets: geometryBuckets } of [
    { target: group, buckets },
    ...partBuckets,
  ])
    for (const [name, geometries] of geometryBuckets) {
      const geometry = mergeGeometries(geometries, false);
      for (const item of geometries) item.dispose();
      if (!materials.has(name))
        materials.set(
          name,
          new THREE.MeshStandardMaterial({
            color: palette[name],
            roughness: name === "glass" ? 0.23 : name === "trim" ? 0.35 : 0.7,
            metalness: name === "trim" ? 0.55 : name === "body" ? 0.12 : 0,
            side: name === "glass" ? THREE.DoubleSide : THREE.FrontSide,
            emissive: ["white", "red", "amber"].includes(name)
              ? palette[name]
              : "#000000",
            emissiveIntensity: name === "amber" ? 0.25 : 0.12,
          }),
        );
      const material = materials.get(name);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${kind}-${name}`;
      mesh.castShadow = !["glass", "white", "red", "amber"].includes(name);
      mesh.receiveShadow = true;
      mesh.userData.vehiclePart = name;
      target.add(mesh);
      triangles += geometry.getAttribute("position").count / 3;
    }
  let drawCalls = 0;
  group.traverse((node) => {
    if (node.isMesh) drawCalls++;
  });
  group.userData.vehicle.drawCalls = drawCalls;
  group.userData.vehicle.triangles = triangles;
  if (articulated) {
    group.userData.wheels = wheels;
    group.userData.doors = doors;
  }
  return group;
}
