import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { createCharacter, animateCharacter } from "./characters.js";
import { createTravelMaterials } from "./travel-materials.js";

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
const FLIGHT_LAYER = 7;
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

function createKit(textured = false) {
  const geometries = new Set(),
    materials = new Map();
  const surfaces = textured ? createTravelMaterials() : null;
  const ownedTextures = new Set();
  let environment = null;
  const remember = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const boxGeometry = remember(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeometry = remember(new THREE.CylinderGeometry(1, 1, 1, 20));
  const sphereGeometry = remember(new THREE.SphereGeometry(1, 20, 12));
  const ringGeometry = remember(new THREE.TorusGeometry(1, 0.07, 8, 28));
  const roundedGeometry = remember(new RoundedBoxGeometry(1, 1, 1, 1, 0.16));
  function material(color, glass = false, vertexColors = false) {
    const key = `${color}:${glass}:${vertexColors}`;
    const surface = vertexColors
      ? "aircraft"
      : ["#244c61", "#293a56", "#3d6171"].includes(color)
        ? "fabric"
        : ["#45525d", "#6b7c81", "#9eaaa7"].includes(color)
          ? "asphalt"
          : color === "#424f58"
            ? "carpet"
            : null;
    if (!materials.has(key)) {
      const Constructor = vertexColors
        ? THREE.MeshPhysicalMaterial
        : THREE.MeshStandardMaterial;
      const glazing = [
        "#25445e",
        "#24435a",
        "#507b8f",
        "#477385",
        "#4c7186",
      ].includes(color);
      materials.set(
        key,
        new Constructor({
          color,
          roughness:
            surface === "fabric"
              ? 0.94
              : vertexColors
                ? 0.31
                : glazing
                  ? 0.16
                  : glass
                    ? 0.34
                    : 0.72,
          metalness: vertexColors ? 0 : glazing ? 0.12 : glass ? 0.16 : 0.02,
          vertexColors,
          ...(vertexColors
            ? { clearcoat: 0.55, clearcoatRoughness: 0.23 }
            : {}),
          ...(surface && surfaces
            ? {
                ...surfaces[surface],
                bumpScale:
                  surface === "aircraft"
                    ? 0.008
                    : surface === "asphalt"
                      ? 0.035
                      : 0.015,
              }
            : {}),
          envMap: environment,
          envMapIntensity: 0.3,
        }),
      );
    }
    return materials.get(key);
  }
  function mesh(
    parent,
    geometry,
    color,
    position,
    scale,
    glass = false,
    vertexColors = false,
  ) {
    const result = new THREE.Mesh(
      geometry,
      material(color, glass, vertexColors),
    );
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
  const ring = (parent, color, position, scale) =>
    mesh(parent, ringGeometry, color, position, scale, true);
  const rounded = (parent, color, position, scale) =>
    mesh(parent, roundedGeometry, color, position, scale);
  function basic(
    parent,
    geometry,
    color,
    position,
    scale,
    vertexColors = false,
    side = THREE.FrontSide,
  ) {
    const key = `basic:${color}:${vertexColors}:${side}`;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshBasicMaterial({ color, vertexColors, side }),
      );
    const result = new THREE.Mesh(geometry, materials.get(key));
    result.position.set(...position);
    result.scale.set(...scale);
    parent.add(result);
    return result;
  }
  function prism(parent, color, points, offset = [0, 0.18, 0]) {
    const vertices = [
      ...points,
      ...points.map((point) => point.map((v, i) => v + offset[i])),
    ];
    const positions = [],
      count = points.length;
    const normal = vector(...points[1])
      .sub(vector(...points[0]))
      .cross(vector(...points[2]).sub(vector(...points[0])));
    const reverse = normal.dot(vector(...offset)) < 0;
    const triangle = (a, b, c) => {
      for (const index of reverse ? [a, c, b] : [a, b, c])
        positions.push(...vertices[index]);
    };
    for (let i = 1; i < count - 1; i++) {
      triangle(0, i + 1, i);
      triangle(count, count + i, count + i + 1);
    }
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      triangle(i, next, next + count);
      triangle(i, next + count, i + count);
    }
    const geometry = remember(new THREE.BufferGeometry());
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    return mesh(parent, geometry, color, [0, 0, 0], [1, 1, 1], true);
  }
  function profile(points, sides = 28) {
    const geometry = remember(
      new THREE.LatheGeometry(
        points.map(([x, radius]) => new THREE.Vector2(radius, x)),
        sides,
      ),
    );
    geometry.rotateZ(-Math.PI / 2);
    return geometry;
  }
  function text(parent, value, color, position, pixel = 0.12, facing = 1) {
    // Original small block lettering, made from geometry; no downloaded decals.
    const glyphs = {
      R: ["1110", "1001", "1001", "1110", "1010", "1001", "1001"],
      O: ["0110", "1001", "1001", "1001", "1001", "1001", "0110"],
      A: ["0110", "1001", "1001", "1111", "1001", "1001", "1001"],
      M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
      L: ["1000", "1000", "1000", "1000", "1000", "1000", "1111"],
      I: ["111", "010", "010", "010", "010", "010", "111"],
      S: ["0111", "1000", "1000", "0110", "0001", "0001", "1110"],
    };
    const positions = [];
    let cursor = 0;
    for (const letter of value) {
      const rows = glyphs[letter];
      if (!rows) {
        cursor += 4;
        continue;
      }
      rows.forEach((row, y) =>
        [...row].forEach((bit, x) => {
          if (bit !== "1") return;
          const a = [(cursor + x) * pixel * facing, -y * pixel, 0];
          const b = [(cursor + x + 0.88) * pixel * facing, -y * pixel, 0];
          const c = [
            (cursor + x + 0.88) * pixel * facing,
            -(y + 0.88) * pixel,
            0,
          ];
          const d = [(cursor + x) * pixel * facing, -(y + 0.88) * pixel, 0];
          for (const point of [a, c, b, a, d, c]) positions.push(...point);
        }),
      );
      cursor += rows[0].length + 1;
    }
    const geometry = remember(new THREE.BufferGeometry());
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    return mesh(parent, geometry, color, position, [1, 1, 1]);
  }
  function batch(group, name = "batched airport scenery") {
    // Static airport furniture is merged by shared material so richer scenery
    // does not create a draw call for each runway lamp, stripe or facade mullion.
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(),
      groups = new Map();
    group.traverse((node) => {
      if (!node.isMesh || node.userData.keepSeparate) return;
      const geometry = node.geometry.index
        ? node.geometry.toNonIndexed()
        : node.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld));
      // Primitive UVs are unused here; use one consistent layout across models.
      const textured =
        node.material.map ||
        node.material.bumpMap ||
        node.material.roughnessMap;
      if (textured && !geometry.attributes.uv)
        geometry.setAttribute(
          "uv",
          new THREE.Float32BufferAttribute(
            new Float32Array(geometry.attributes.position.count * 2),
            2,
          ),
        );
      for (const name of Object.keys(geometry.attributes))
        if (!["position", "normal", ...(textured ? ["uv"] : [])].includes(name))
          geometry.deleteAttribute(name);
      const list = groups.get(node.material) || [];
      list.push(geometry);
      groups.set(node.material, list);
    });
    const originals = [];
    group.traverse((node) => {
      if (node.isMesh && !node.userData.keepSeparate) originals.push(node);
    });
    originals.forEach((node) => node.removeFromParent());
    for (const [mat, geometries] of groups) {
      const geometry = remember(mergeGeometries(geometries, false));
      geometries.forEach((value) => value.dispose());
      const result = new THREE.Mesh(geometry, mat);
      result.castShadow = result.receiveShadow = true;
      result.name = name;
      group.add(result);
    }
  }
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
  function adopt(group, shared = false) {
    const remapped = new Map();
    group.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (shared && node.material && !Array.isArray(node.material)) {
        const original = node.material;
        if (!remapped.has(original)) {
          const key = `actor:${original.color.getHexString()}:${original.roughness}:${original.flatShading}`;
          const existing = materials.get(key);
          if (existing) {
            remapped.set(original, existing);
            original.dispose();
          } else {
            materials.set(key, original);
            remapped.set(original, original);
          }
        }
        node.material = remapped.get(original);
        return;
      }
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
    rounded,
    basic,
    ring,
    wedge,
    prism,
    profile,
    text,
    mesh,
    remember,
    ownTexture(texture) {
      ownedTextures.add(texture);
      return texture;
    },
    batch,
    adopt,
    setEnvironment(texture) {
      environment = texture;
      materials.forEach((mat) => {
        if (!mat.isMeshStandardMaterial) return;
        mat.envMap = texture;
        mat.envMapIntensity = 0.3;
        mat.needsUpdate = true;
      });
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      geometries.clear();
      materials.clear();
      surfaces?.dispose();
      ownedTextures.forEach((texture) => texture.dispose());
      ownedTextures.clear();
    },
  };
}

function traveller(kit, shirt = "#ff876e", appearance = null, shared = false) {
  const color = (value, fallback) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : fallback;
  const group = createCharacter({
    // Keep the account's saved look when boarding a vehicle.
    bodyType: appearance?.bodyType === "female" ? "female" : "male",
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
  kit.adopt(group, shared);
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
  const centreY = 4.5;
  const body = kit.profile([
    [-18.5, 0],
    [-17.7, 0.18],
    [-15.6, 0.65],
    [-13.2, 1.15],
    [-10.8, 1.65],
    [-8.5, 1.84],
    [10.7, 1.84],
    [13.5, 1.65],
    [15.6, 1.2],
    [17.3, 0.67],
    [18.1, 0.23],
    [18.45, 0],
  ]);
  const colors = [],
    white = new THREE.Color("#f8f7f1"),
    belly = new THREE.Color("#315be6");
  for (let i = 0; i < body.attributes.position.count; i++) {
    const color = body.attributes.position.getY(i) < -0.72 ? belly : white;
    colors.push(color.r, color.g, color.b);
  }
  body.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const fuselage = kit.mesh(
    group,
    body,
    "#ffffff",
    [0, centreY, 0],
    [1, 1, 1],
    true,
    true,
  );
  fuselage.name = "tapered airframe";
  const gear = new THREE.Group();
  gear.name = "landing gear";
  group.add(gear);
  const wheels = [],
    fans = [],
    navigation = [];
  for (const sign of [-1, 1]) {
    const wing = kit.prism(
      group,
      "#e6eaec",
      [
        [3.5, 3.25, sign * 1.4],
        [-6.8, 3.25, sign * 1.4],
        [-6, 3.95, sign * 17.6],
        [-2.4, 3.95, sign * 17.6],
      ],
      [0, 0.19, 0],
    );
    wing.name = sign < 0 ? "left swept wing" : "right swept wing";
    const winglet = kit.prism(
      group,
      "#315be6",
      [
        [-2.4, 4.04, sign * 17.6],
        [-3.1, 6.18, sign * 18.3],
        [-5.5, 6.18, sign * 18.3],
        [-6, 4.04, sign * 17.6],
      ],
      [0, 0, sign * 0.12],
    );
    winglet.name = "upswept winglet";
    const flap = kit.prism(
      group,
      "#b3c1c8",
      [
        [-5.6, 3.5, sign * 2.4],
        [-6.5, 3.5, sign * 2.4],
        [-5.98, 3.98, sign * 14.1],
        [-5.12, 3.98, sign * 14.1],
      ],
      [0, 0.05, 0],
    );
    flap.name = "trailing flap";
    kit.prism(
      group,
      "#ed997d",
      [
        [-11.1, 4.8, sign * 0.8],
        [-17.3, 4.8, sign * 0.8],
        [-17.1, 5.2, sign * 6.65],
        [-14.4, 5.2, sign * 6.65],
      ],
      [0, 0.13, 0],
    ).name = "tail stabilizer";
    const engineZ = sign * 5.6,
      engineY = 2.25;
    kit.box(group, "#aab9c1", [-0.55, 3.1, engineZ], [2.5, 1.5, 0.35]).name =
      "engine pylon";
    const nacelle = kit.mesh(
      group,
      kit.profile(
        [
          [-2.4, 0.72],
          [-2.15, 0.91],
          [-1.3, 1.09],
          [0.65, 1.15],
          [1.5, 1.08],
        ],
        24,
      ),
      "#f4f5f0",
      [-0.2, engineY, engineZ],
      [1, 1, 1],
      true,
    );
    nacelle.name = "turbofan nacelle";
    const intakeRing = kit.ring(
      group,
      "#c9d7dd",
      [1.3, engineY, engineZ],
      [1.05, 1.05, 1.05],
    );
    intakeRing.rotation.y = Math.PI / 2;
    intakeRing.name = "metal intake lip";
    const intake = kit.cylinder(
      group,
      "#162b3e",
      [1.27, engineY, engineZ],
      [1.0, 0.16, 1.0],
    );
    intake.rotation.z = Math.PI / 2;
    intake.name = "recessed engine intake";
    const fanPositions = [];
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const point = (radius, offset) => [
        0,
        Math.cos(angle + offset) * radius,
        Math.sin(angle + offset) * radius,
      ];
      for (const pointValue of [
        point(0.22, 0),
        point(0.9, 0.13),
        point(0.82, 0.33),
      ])
        fanPositions.push(...pointValue);
    }
    const fanGeometry = kit.remember(new THREE.BufferGeometry());
    fanGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(fanPositions, 3),
    );
    fanGeometry.computeVertexNormals();
    const fan = kit.mesh(
      group,
      fanGeometry,
      "#8fa5b3",
      [1.365, engineY, engineZ],
      [1, 1, 1],
      true,
    );
    fan.name = "engine fan";
    fans.push(fan);
    kit.sphere(
      group,
      "#d5e0e4",
      [1.48, engineY, engineZ],
      [0.26, 0.25, 0.25],
    ).name = "fan spinner";
    const exhaust = kit.cylinder(
      group,
      "#344855",
      [-2.65, engineY, engineZ],
      [0.63, 0.12, 0.63],
    );
    exhaust.rotation.z = Math.PI / 2;
    exhaust.name = "engine exhaust";
    for (let x = -9; x <= 10; x += 0.97) {
      const rim = kit.sphere(
        group,
        "#d1dbdf",
        [x, 5.13, sign * 1.748],
        [0.28, 0.37, 0.055],
      );
      rim.name = "cabin window surround";
      const pane = kit.sphere(
        group,
        "#25445e",
        [x, 5.13, sign * 1.787],
        [0.225, 0.305, 0.037],
      );
      pane.name = "cabin window";
    }
    for (const x of [-11.4, 11.3]) {
      const z = sign * (x > 0 ? 1.775 : 1.525);
      const door = kit.box(group, "#c0cdd1", [x, 4.65, z], [0.93, 2.05, 0.045]);
      door.name = "passenger door outline";
      kit.box(
        group,
        "#f1f2ec",
        [x, 4.65, z + sign * 0.03],
        [0.82, 1.91, 0.045],
      );
      kit.box(
        group,
        "#25445e",
        [x, 5.12, z + sign * 0.06],
        [0.33, 0.45, 0.035],
      );
      kit.box(
        group,
        "#81949d",
        [x + 0.22, 4.38, z + sign * 0.07],
        [0.15, 0.055, 0.04],
      );
    }
    const cockpit = kit.prism(
      group,
      "#24435a",
      [
        [11.9, 5.56, sign * 1.5],
        [13.65, 5.39, sign * 1.39],
        [14.35, 4.94, sign * 1.46],
        [12.0, 4.95, sign * 1.77],
      ],
      [0, 0, sign * 0.04],
    );
    cockpit.name = "cockpit glazing";
    kit.text(
      group,
      "ROAM",
      "#315be6",
      [sign > 0 ? 2.1 : 5.2, 4.55, sign * 1.849],
      0.15,
      sign,
    ).name = "original ROAM livery";
    for (const z of [sign * 2.03, sign * 2.52])
      wheels.push(wheel(kit, gear, -3.8, z, 0.58, 0.63));
    kit.cylinder(gear, "#8da0ab", [-3.8, 1.67, sign * 1.7], [0.12, 2.08, 0.12]);
    kit.box(gear, "#b3c1c8", [-3.8, 0.78, sign * 2.1], [0.17, 0.18, 1.0]);
    const lamp = kit.sphere(
      group,
      sign < 0 ? "#ef5568" : "#55d5aa",
      [-4.8, 4.25, sign * 17.75],
      [0.18, 0.1, 0.16],
    );
    lamp.material.emissive.copy(lamp.material.color);
    lamp.material.emissiveIntensity = 1.6;
    lamp.name = "wing navigation light";
    navigation.push(lamp);
  }
  const fin = kit.prism(
    group,
    "#315be6",
    [
      [-11.8, 5.4, -0.15],
      [-14.6, 11.4, -0.15],
      [-16.5, 11.4, -0.15],
      [-17.3, 5.2, -0.15],
    ],
    [0, 0, 0.3],
  );
  fin.name = "swept vertical tail";
  for (const sign of [-1, 1]) {
    kit.prism(
      group,
      "#a7e1cf",
      [
        [-13.5, 7.7, sign * 0.165],
        [-15.1, 10.2, sign * 0.165],
        [-16.1, 7.7, sign * 0.165],
      ],
      [0, 0, sign * 0.02],
    ).name = "original tail compass mark";
    wheels.push(wheel(kit, gear, 12.4, sign * 0.23, 0.4, 0.45));
  }
  kit.cylinder(gear, "#8da0ab", [12.4, 1.54, 0], [0.1, 2.1, 0.1]);
  kit.box(gear, "#b3c1c8", [12.4, 0.65, 0], [0.14, 0.18, 0.6]);
  wheels.forEach((tyre, index) => {
    tyre.name = index < 4 ? "main gear tyre" : "nose gear tyre";
  });
  group.userData.aircraft = {
    original: true,
    engines: 2,
    mainWheels: 4,
    noseWheels: 2,
    cabinWindows: 40,
  };
  return { group, doors: [], wheels, fans, navigation, gear };
}

function flightCabin(kit, shirt, appearance, night) {
  const group = new THREE.Group(),
    furniture = new THREE.Group();
  group.name = "original ROAM flight cabin";
  furniture.name = "cabin furniture";
  group.add(furniture);
  const seatXs = [-3.4, -2.1, -0.8, 0.5, 1.8],
    seatZs = [-1.5, -1.02, -0.54, 0.54, 1.02, 1.5];
  kit.box(furniture, "#747e82", [0, -0.055, 0], [10.7, 0.16, 3.88]);
  kit.box(furniture, "#424f58", [0, 0.032, 0], [10.6, 0.016, 0.6]);
  for (const x of seatXs)
    for (const z of seatZs) {
      const fabric = Math.abs(z) > 1.2 ? "#244c61" : "#293a56";
      kit.box(furniture, "#889699", [x - 0.07, 0.26, z], [0.24, 0.4, 0.29]);
      kit.rounded(furniture, fabric, [x, 0.43, z], [0.56, 0.14, 0.43]);
      const back = kit.rounded(
        furniture,
        fabric,
        [x - 0.25, 0.84, z],
        [0.12, 0.82, 0.44],
      );
      back.rotation.z = -0.1;
      kit.rounded(
        furniture,
        "#3d6171",
        [x - 0.24, 1.19, z],
        [0.16, 0.18, 0.38],
      );
      kit.rounded(
        furniture,
        "#d5cdb9",
        [x - 0.22, 1.21, z],
        [0.17, 0.09, 0.24],
      );
      kit.rounded(
        furniture,
        "#718087",
        [x - 0.33, 0.78, z],
        [0.028, 0.19, 0.26],
      );
      for (const sign of [-1, 1])
        kit.rounded(
          furniture,
          "#899a9e",
          [x + 0.03, 0.65, z + sign * 0.225],
          [0.43, 0.055, 0.04],
        );
    }
  const windowGeometry = kit.remember(new RoundedBoxGeometry(1, 1, 1, 1, 0.26));
  const skyColors = [],
    skyTop = new THREE.Color(night > 0.5 ? "#283d65" : "#75b2d0"),
    skyBottom = new THREE.Color(night > 0.5 ? "#576576" : "#dce4d7");
  for (let i = 0; i < windowGeometry.attributes.position.count; i++) {
    const color = skyBottom
      .clone()
      .lerp(skyTop, clamp(windowGeometry.attributes.position.getY(i) + 0.5));
    skyColors.push(color.r, color.g, color.b);
  }
  windowGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(skyColors, 3),
  );
  for (const sign of [-1, 1]) {
    kit.box(furniture, "#c6c9bc", [0, 0.43, sign * 1.9], [10.7, 0.86, 0.12]);
    kit.rounded(
      furniture,
      "#d3d2c3",
      [0, 1.99, sign * 1.83],
      [10.7, 0.58, 0.26],
    );
    kit.rounded(
      furniture,
      "#c2c5ba",
      [0, 1.92, sign * 1.48],
      [10.55, 0.43, 0.57],
    );
    for (const x of seatXs) {
      kit.rounded(
        furniture,
        "#e5dfcf",
        [x, 1.31, sign * 1.848],
        [0.73, 0.83, 0.1],
      );
      const sky = kit.basic(
        furniture,
        windowGeometry,
        "#ffffff",
        [x, 1.31, sign * 1.784],
        [0.57, 0.65, 0.035],
        true,
      );
      sky.name = "original oval sky window";
      sky.userData.keepSeparate = true;
      kit.rounded(
        furniture,
        "#a9b1ab",
        [x, 1.87, sign * 1.187],
        [0.23, 0.035, 0.035],
      );
      kit.box(
        furniture,
        "#d3d2c3",
        [x + 0.63, 1.3, sign * 1.9],
        [0.49, 0.87, 0.12],
      );
    }
    const strip = kit.rounded(
      furniture,
      "#ffdbaf",
      [0, 2.145, sign * 1.1],
      [10.55, 0.035, 0.065],
    );
    strip.material.emissive.set("#ffd19d");
    strip.material.emissiveIntensity = 0.8;
  }
  // A continuous inward-facing curved ceiling completes the cabin volume.
  const positions = [],
    segments = 18;
  for (let i = 0; i < segments; i++) {
    const edge = (index, x) => {
      const z = -1.94 + (index / segments) * 3.88;
      return [x, 1.94 + Math.cos(((z / 1.94) * Math.PI) / 2) * 0.52, z];
    };
    for (const point of [
      edge(i, -5.35),
      edge(i, 5.35),
      edge(i + 1, 5.35),
      edge(i, -5.35),
      edge(i + 1, 5.35),
      edge(i + 1, -5.35),
    ])
      positions.push(...point);
  }
  const ceiling = kit.remember(new THREE.BufferGeometry());
  ceiling.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  ceiling.computeVertexNormals();
  kit.mesh(furniture, ceiling, "#c3c5b9", [0, 0, 0], [1, 1, 1]).name =
    "continuous curved cabin ceiling";
  kit.box(furniture, "#c6c9bc", [-5.3, 1.12, 0], [0.12, 2.3, 3.88]);
  kit.rounded(furniture, "#bfc3b8", [4.9, 1.2, 1.12], [0.3, 2.35, 1.56]);
  kit.rounded(furniture, "#48656b", [4.73, 1.22, 1.12], [0.055, 1.65, 1.1]);
  kit.rounded(furniture, "#a7b3ac", [4.88, 0.84, -1.15], [0.35, 1.7, 1.45]);
  kit.rounded(furniture, "#869c9e", [0.4, 0.46, -0.13], [0.53, 0.71, 0.41]);
  kit.rounded(furniture, "#db9d7e", [0.4, 0.86, -0.13], [0.57, 0.065, 0.45]);
  for (const z of [-0.25, 0]) {
    kit.cylinder(furniture, "#e8e1ca", [0.38, 0.94, z], [0.055, 0.11, 0.055]);
    wheel(kit, furniture, 0.25, z, 0.08, 0.11);
  }
  const sit = (person, x, z) => {
    person.group.position.set(
      x,
      0.56 - person.group.userData.restHipY * person.group.scale.y,
      z,
    );
    person.group.rotation.y = Math.PI / 2;
    const rig = person.group.userData.rig;
    rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -1.45;
    rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = 1.45;
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = -0.5;
    rig.leftElbow.rotation.x = rig.rightElbow.rotation.x = -0.6;
    person.group.userData.activity = "seated";
  };
  const passengers = [
    {
      x: -3.4,
      z: 0.54,
      bodyType: "female",
      topColor: "#d89270",
      hairStyle: "bob",
      skinTone: "#c88d69",
    },
    {
      x: -2.1,
      z: -0.54,
      bodyType: "male",
      topColor: "#d4ad4d",
      hairStyle: "curly",
      skinTone: "#704933",
    },
    {
      x: -2.1,
      z: 1.5,
      bodyType: "male",
      topColor: "#589b85",
      hairStyle: "short",
      skinTone: "#e0b28c",
    },
    {
      x: -0.8,
      z: 1.02,
      bodyType: "female",
      topColor: "#9e829b",
      hairStyle: "bun",
      skinTone: "#925f43",
    },
    {
      x: 0.5,
      z: -1.02,
      bodyType: "female",
      topColor: "#589b85",
      hairStyle: "bob",
      skinTone: "#c88d69",
    },
    {
      x: 0.5,
      z: 0.54,
      bodyType: "male",
      topColor: "#d89270",
      hairStyle: "short",
      skinTone: "#e0b28c",
    },
    {
      x: 1.8,
      z: 1.5,
      bodyType: "female",
      topColor: "#d4ad4d",
      hairStyle: "curly",
      skinTone: "#704933",
    },
  ];
  for (const passenger of passengers) {
    const person = traveller(kit, passenger.topColor, passenger, true);
    person.group.name = "decorative cabin passenger";
    person.group.userData.decorative = true;
    sit(person, passenger.x, passenger.z);
    person.group.userData.rig.head.rotation.y = passenger.z > 0 ? -0.2 : 0.2;
    furniture.add(person.group);
  }
  const crew = traveller(
    kit,
    "#344d68",
    {
      bodyType: "female",
      outfitStyle: "jacket",
      hairStyle: "bun",
      skinTone: "#ab7858",
      shoeColor: "#34444f",
    },
    true,
  );
  crew.group.name = "decorative cabin crew";
  crew.group.userData.decorative = true;
  crew.group.position.set(-0.3, 0.05, 0.08);
  crew.group.rotation.y = Math.PI / 2;
  furniture.add(crew.group);
  kit.batch(furniture, "batched cabin furnishings");
  const avatar = traveller(kit, shirt, appearance);
  sit(avatar, -0.8, -1.5);
  avatar.group.userData.flightSeat = "3A";
  group.add(avatar.group);
  const panorama = new THREE.Group();
  panorama.name = "original window flight panorama";
  group.add(panorama);
  kit.box(panorama, "#8da98d", [-0.8, 1.055, -1.755], [0.46, 0.105, 0.018]);
  for (const x of [-0.96, -0.87, -0.78, -0.69]) {
    kit.box(panorama, "#c1bdac", [x, 1.07, -1.738], [0.032, 0.07, 0.012]);
    kit.box(
      panorama,
      "#7b8983",
      [x + 0.036, 1.053, -1.728],
      [0.008, 0.11, 0.008],
    );
  }
  const wing = kit.prism(
    group,
    "#bcc6c9",
    [
      [-1.025, 1.12, -1.709],
      [-0.84, 1.09, -1.709],
      [-0.58, 1.19, -1.709],
      [-0.69, 1.225, -1.709],
    ],
    [0, 0, 0.016],
  );
  wing.name = "original window wing section";
  kit.prism(
    group,
    "#315be6",
    [
      [-0.69, 1.225, -1.69],
      [-0.64, 1.29, -1.69],
      [-0.59, 1.285, -1.69],
      [-0.58, 1.19, -1.69],
    ],
    [0, 0, 0.012],
  );

  const lights = [-2.3, 2.6].map((x) => {
    const light = new THREE.PointLight("#ffe1ba", 1.4, 9, 1.5);
    light.position.set(x, 2.23, 0);
    group.add(light);
    return light;
  });
  group.userData.illustrative = true;
  group.userData.seatLayout = "3+3";
  group.userData.seats = seatXs.length * seatZs.length;
  group.userData.decorativePassengers = passengers.length;
  return { group, avatar, lights, panorama };
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

function airportScenery(kit, stage, night) {
  const airport = new THREE.Group();
  airport.name = "illustrative airport airside";
  stage.add(airport);
  const ground = kit.box(
    airport,
    "#759c7d",
    [0, -0.16, 28],
    [1800, 0.26, 1800],
  );
  ground.name = "airport grass";
  ground.userData.keepSeparate = true;
  const colourPixels = new Uint8Array(128 * 128 * 4),
    detailPixels = new Uint8Array(colourPixels.length);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const patch = Math.sin(x * 0.15 + Math.sin(y * 0.2)) * Math.cos(y * 0.09),
        grain = Math.sin(x * 83.3 + y * 37.1),
        at = (y * 128 + x) * 4,
        value = Math.round(237 + patch * 13 + grain * 3);
      colourPixels.set([value - 2, value, value - 3, 255], at);
      detailPixels.set([Math.round(128 + grain * 18), 248, 0, 255], at);
    }
  const groundTexture = (pixels, colorSpace) => {
    const texture = kit.ownTexture(new THREE.DataTexture(pixels, 128, 128));
    texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(32, 32);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  };
  ground.material.map = groundTexture(colourPixels, THREE.SRGBColorSpace);
  ground.material.bumpMap = ground.material.roughnessMap = groundTexture(
    detailPixels,
    THREE.NoColorSpace,
  );
  ground.material.bumpScale = 0.025;
  ground.material.roughness = 1;
  const skyGeometry = kit.remember(new THREE.SphereGeometry(1100, 24, 12));
  const skyColors = [],
    horizon = new THREE.Color(night > 0.5 ? "#556276" : "#b5d0d4"),
    zenith = new THREE.Color(night > 0.5 ? "#23354f" : "#6eabc7");
  for (let i = 0; i < skyGeometry.attributes.position.count; i++) {
    const color = horizon
      .clone()
      .lerp(zenith, clamp(skyGeometry.attributes.position.getY(i) / 800));
    skyColors.push(color.r, color.g, color.b);
  }
  skyGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(skyColors, 3),
  );
  const sky = kit.basic(
    airport,
    skyGeometry,
    "#ffffff",
    [0, 0, 0],
    [1, 1, 1],
    true,
    THREE.BackSide,
  );
  sky.name = "original flight sky";
  sky.userData.keepSeparate = true;
  // Bounded original airfield context, tinted into the horizon rather than
  // implying that these are surveyed buildings or an actual airport skyline.
  const contextTint = night > 0.5 ? "#687988" : "#a5b6ab";
  kit.box(airport, "#758983", [0, -0.005, 190], [1050, 0.1, 9]);
  for (let i = 0; i < 19; i++) {
    const x = -432 + i * 48,
      z = 230 + (i % 3) * 26,
      height = 10 + (i % 4) * 3.7,
      width = 27 + (i % 3) * 8;
    kit.box(airport, contextTint, [x, height / 2, z], [width, height, 25]);
    kit.box(
      airport,
      night > 0.5 ? "#73818a" : "#b9c6b8",
      [x, height + 0.22, z],
      [width + 1, 0.44, 26],
    );
    kit.box(
      airport,
      night > 0.5 ? "#66768b" : "#7f9d9f",
      [x, height * 0.55, z - 12.54],
      [width * 0.72, 1.0, 0.08],
    );
  }
  const runway = kit.box(airport, "#45525d", [0, 0.015, 0], [350, 0.17, 30]);
  runway.name = "runway asphalt";
  runway.userData.keepSeparate = true;
  // Wide shoulder bands and small changes in asphalt avoid a single flat slab.
  for (const z of [-16.1, 16.1])
    kit.box(airport, "#7d8d8a", [0, 0.008, z], [350, 0.12, 2.1]);
  for (let x = -155; x < 168; x += 20)
    kit.box(airport, "#f7f1da", [x, 0.117, 0], [10, 0.018, 0.6]);
  for (const sign of [-1, 1]) {
    kit.box(airport, "#e8e4d6", [0, 0.118, sign * 13.65], [334, 0.018, 0.25]);
    for (const z of [2.3, 4.1, 5.9, 7.7, 9.5, 11.3])
      kit.box(airport, "#f7f1da", [-142, 0.119, sign * z], [14, 0.018, 1.05]);
    for (const x of [-76, -48, -20])
      kit.box(
        airport,
        "#f7f1da",
        [x, 0.119, sign * 7.6],
        [8, 0.018, x === -76 ? 3 : 1.1],
      );
    for (let x = -164; x <= 170; x += 22) {
      kit.box(airport, "#9aa99e", [x, 0.29, sign * 15.5], [0.22, 0.42, 0.22]);
      const lamp = kit.box(
        airport,
        "#ffe9b3",
        [x, 0.55, sign * 15.5],
        [0.36, 0.14, 0.36],
      );
      lamp.material.emissive.set("#ffdc85");
      lamp.material.emissiveIntensity = 1.4;
    }
  }
  kit.box(airport, "#9eaaa7", [-30, 0.005, 49], [232, 0.11, 60]);
  kit.box(airport, "#6b7c81", [60, 0.075, 19], [48, 0.13, 10]);
  kit.box(airport, "#edbf57", [60, 0.16, 19], [48, 0.018, 0.2]);
  for (const x of [-88, -48, -8, 32]) {
    kit.box(airport, "#edbf57", [x, 0.084, 40], [0.18, 0.016, 23]);
    kit.box(airport, "#edbf57", [x, 0.085, 28.6], [12, 0.016, 0.18]);
    for (const z of [32, 37, 42])
      kit.box(airport, "#edbf57", [x, 0.086, z], [4, 0.016, 0.16]);
  }
  // A contemporary terminal is authored around the camera's sight line. Its
  // massing is original; it does not replace the geographic airport footprint.
  kit.box(airport, "#e7e8dc", [-44, 5.9, 66], [128, 11.8, 22]);
  kit.box(airport, "#507b8f", [-44, 7.1, 54.85], [124, 6.6, 0.2], true);
  kit.box(airport, "#c5d2d5", [-44, 3.8, 54.57], [128, 0.4, 0.7]);
  for (let x = -105; x <= 17; x += 6)
    kit.box(airport, "#d9e2df", [x, 7, 54.65], [0.25, 6.8, 0.45]);
  kit.box(airport, "#e5e7db", [-44, 12.1, 64], [135, 0.55, 30]);
  kit.box(airport, "#315be6", [-44, 11.4, 54.4], [131, 0.55, 0.7]);
  const terminalSign = kit.text(
    airport,
    "LIS",
    "#a7e1cf",
    [-42, 10.5, 54.37],
    0.41,
    -1,
  );
  terminalSign.name = "original LIS terminal sign";
  for (const x of [-80, -36, 8]) {
    kit.box(airport, "#c2ccd0", [x, 4.3, 47.2], [4.3, 3.0, 14.7]);
    kit.box(airport, "#477385", [x, 4.6, 39.85], [3.7, 2.0, 0.14], true);
    kit.box(airport, "#315be6", [x, 6.02, 47.0], [4.6, 0.22, 15.1]);
    kit.cylinder(airport, "#758a92", [x, 1.8, 42], [0.28, 3.6, 0.28]);
  }
  kit.box(airport, "#b8cacc", [-128, 8, 48], [5.3, 16, 5.3]);
  kit.box(airport, "#4c7186", [-128, 18.3, 48], [9.8, 4.5, 9.8], true);
  kit.box(airport, "#dbe2da", [-128, 21, 48], [11, 0.5, 11]);
  kit.cylinder(airport, "#9cabb0", [-128, 24.3, 48], [0.14, 6.1, 0.14]);
  for (const x of [-112, -55, 16, 79]) {
    kit.cylinder(airport, "#899b9d", [x, 9, 32], [0.18, 18, 0.18]);
    kit.box(airport, "#536875", [x, 18, 32], [5.2, 0.3, 0.7]);
    for (const offset of [-1.8, 0, 1.8]) {
      const lamp = kit.box(
        airport,
        "#ffedc6",
        [x + offset, 17.7, 31.65],
        [1.1, 0.3, 0.4],
      );
      lamp.material.emissive.set("#ffd78a");
      lamp.material.emissiveIntensity = 1.3;
    }
  }
  for (const x of [-96, -56, -16]) {
    kit.box(airport, "#f4cb6c", [x, 1.1, 31], [3.7, 1.1, 1.6]);
    kit.box(airport, "#e9eee6", [x + 0.5, 1.94, 31], [1.3, 0.75, 1.6]);
    kit.box(
      airport,
      "#3b5e73",
      [x + 0.54, 1.97, 30.16],
      [1.0, 0.5, 0.035],
      true,
    );
    for (const sign of [-1, 1])
      for (const offset of [-1.25, 1.25])
        wheel(kit, airport, x + offset, 31 + sign * 0.85, 0.38);
    for (const offset of [-5.3, -8.1]) {
      kit.box(airport, "#315be6", [x + offset, 0.95, 31], [2.3, 0.5, 1.4]);
      kit.box(airport, "#b2c4cc", [x + offset, 1.5, 31], [1.8, 0.6, 1.0]);
      kit.box(airport, "#e7b593", [x + offset, 1.83, 31], [0.9, 0.13, 0.83]);
    }
  }
  airport.userData.illustrative = true;
  airport.userData.runwayTop = 0.1;
  kit.batch(airport);
  return { airport, runwayTop: 0.1, sky };
}

function stageScenery(kit, stage, mode, night) {
  if (mode === "flight") {
    return airportScenery(kit, stage, night);
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

function makeTableau(mode, shirt, appearance, night = 0) {
  const kit = createKit(mode === "flight"),
    stage = new THREE.Group();
  stage.name = "roam-travel";
  const scenery = stageScenery(kit, stage, mode, night);
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
  const fill = new THREE.HemisphereLight(
    "#e1edf3",
    "#829a95",
    mode === "flight" ? mix(0.95, 1.3, night) : 2.1,
  );
  stage.add(fill);
  const sun = new THREE.DirectionalLight(
    "#ffecd0",
    mode === "flight" ? mix(1.35, 0.55, night) : 2,
  );
  sun.position.set(35, 65, -45);
  sun.target.position.set(0, 3, 0);
  if (mode === "flight") {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -65;
    sun.shadow.camera.right = sun.shadow.camera.top = 65;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.layers.set(FLIGHT_LAYER);
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0001;
  }
  stage.add(sun, sun.target);
  return {
    kit,
    stage,
    vehicle,
    avatar,
    scenery,
    cabin: null,
    night,
    lights: [fill, sun],
  };
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

function flightPose(elapsed, departure, reduced, runwayTop) {
  let x, altitude, pitch, shot;
  if (reduced) {
    x = altitude = pitch = 0;
    shot = "preview";
  } else if (departure) {
    if (elapsed < 2) {
      x = mix(-112, -86, elapsed / 2);
      altitude = pitch = 0;
      shot = "taxi";
    } else if (elapsed < 4.2) {
      const progress = clamp((elapsed - 2) / 2.2);
      x = mix(-86, -15, progress * progress);
      altitude = pitch = 0;
      shot = "takeoff-roll";
    } else if (elapsed < 5.3) {
      const progress = clamp((elapsed - 4.2) / 1.1);
      x = mix(-15, 40, progress);
      altitude = 3.2 * smooth(progress);
      pitch = 0.14 * smooth(progress);
      shot = "rotation";
    } else {
      const progress = clamp((elapsed - 5.3) / 2.9);
      x = mix(40, 176, progress);
      altitude = mix(3.2, 36, smooth(progress));
      pitch = mix(0.14, 0.11, smooth(progress));
      shot = "climb";
    }
  } else if (elapsed < 3) {
    const progress = clamp(elapsed / 3);
    x = mix(-130, -58, progress);
    altitude = mix(30, 6, smooth(progress));
    pitch = mix(0.02, 0.04, smooth(progress));
    shot = "approach";
  } else if (elapsed < 4.4) {
    const progress = clamp((elapsed - 3) / 1.4);
    x = mix(-58, -22, progress);
    altitude = mix(6, 0, smooth(progress));
    pitch = mix(0.04, 0.085, smooth(progress));
    shot = "flare";
  } else if (elapsed < 5.4) {
    const progress = clamp((elapsed - 4.4) / 1);
    x = mix(-22, 14, progress);
    altitude = 0;
    pitch = 0.085 * (1 - smooth(progress));
    shot = "touchdown";
  } else {
    const progress = clamp((elapsed - 5.4) / 2.8);
    x = mix(14, 64, progress * (2 - progress));
    altitude = pitch = 0;
    shot = "rollout";
  }
  // Nose-up flare brings the main gear down first. Compensate the rotated
  // wheel centre, so its lower tyre edge meets the runway instead of sinking.
  const mainWheelBottom =
    -3.8 * Math.sin(pitch) + 0.63 * Math.cos(pitch) - 0.58;
  return {
    x,
    y: altitude + runwayTop - mainWheelBottom,
    pitch,
    altitude,
    shot,
  };
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
  night = 0,
  loadEnvironment = null,
}) {
  let current = null,
    destroyed = false,
    environmentTexture = null;
  function applyEnvironment(state) {
    if (!state || state.sequence.mode !== "flight" || !environmentTexture)
      return;
    state.tableau.kit.setEnvironment(environmentTexture);
    if (state.tableau.night < 0.5) {
      const material = state.tableau.scenery.sky.material;
      material.map = environmentTexture;
      material.vertexColors = false;
      material.needsUpdate = true;
    }
  }
  // One local, licensed HDR is owned by this runtime, including late loads.
  // Node-only tests and unavailable assets keep the generated sky fallback.
  const environmentLoader =
    typeof loadEnvironment === "function"
      ? loadEnvironment
      : typeof window !== "undefined"
        ? () => new RGBELoader().loadAsync("/textures/travel/sky-day.hdr")
        : null;
  if (environmentLoader) {
    Promise.resolve()
      .then(environmentLoader)
      .then((texture) => {
        if (destroyed) {
          texture.dispose();
          return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        environmentTexture = texture;
        applyEnvironment(current);
      })
      .catch(() => {});
  }
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
    layers: camera.layers.mask,
    fov: camera.fov,
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
    camera.layers.mask = state.saved.layers;
    if (camera.isPerspectiveCamera && camera.fov !== state.saved.fov) {
      camera.fov = state.saved.fov;
      camera.updateProjectionMatrix();
    }
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
        camera.layers.mask = state.saved.layers;
        if (camera.isPerspectiveCamera) {
          camera.fov = state.saved.fov;
          camera.updateProjectionMatrix();
        }
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
    if (reduced && state.phases.has("arriving")) {
      camera.layers.mask = state.saved.layers;
      return;
    }
    const local = (x, y, z) => vector(anchor.x + x, anchor.y + y, anchor.z + z);
    let position, target;
    if (mode === "flight") {
      camera.layers.set(FLIGHT_LAYER);
      const fov =
        state.view === "seat"
          ? 65
          : state.view === "cabin"
            ? 52
            : state.saved.fov;
      if (camera.isPerspectiveCamera && camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      const departure = !!sequence.departure;
      const pose = flightPose(
        elapsed,
        departure,
        reduced,
        tableau.scenery.runwayTop,
      );
      tableau.vehicle.group.position.set(pose.x, pose.y, 0);
      tableau.vehicle.group.rotation.z = pose.pitch;
      const keyLight = tableau.lights[1];
      keyLight.position.set(pose.x + 35, 65, -45);
      keyLight.target.position.set(pose.x, 3, 0);
      tableau.stage.userData.flightShot = pose.shot;
      tableau.vehicle.group.userData.flightShot = pose.shot;
      for (const fan of tableau.vehicle.fans)
        fan.rotation.x = reduced ? 0 : elapsed * 38;
      for (const wheel of tableau.vehicle.wheels)
        wheel.rotation.y = reduced ? 0 : -pose.x / 0.58;
      const retract =
        departure && !reduced ? smooth((elapsed - 5.35) / 1.0) : 0;
      tableau.vehicle.gear.position.y = retract * 1.6;
      tableau.vehicle.gear.scale.y = mix(1, 0.4, retract);
      tableau.vehicle.gear.visible = retract < 1;
      const lowShot = !departure ? smooth((elapsed - 2.8) / 1.65) : 0.35;
      const widen = !departure ? smooth((elapsed - 5.9) / 2.3) : 0;
      const aspect =
        Number.isFinite(camera.aspect) && camera.aspect > 0
          ? camera.aspect
          : 1.45;
      const portrait = Math.max(1, 1.4 / aspect);
      const offset = vector(
        mix(mix(34, 25, lowShot), 40, widen),
        mix(mix(16, 10, lowShot), 18, widen),
        mix(mix(-54, -48, lowShot), -65, widen),
      ).multiplyScalar(portrait);
      target = local(pose.x, pose.y + 4.4, 0);
      position = target.clone().add(offset);
      const inside = state.view !== "outside";
      tableau.vehicle.group.visible = !inside;
      tableau.scenery.airport.visible = !inside;
      if (tableau.cabin) {
        tableau.cabin.group.visible = inside;
        tableau.cabin.avatar.group.visible = state.view !== "seat";
        if (!reduced) {
          tableau.cabin.panorama.position.x = Math.sin(elapsed * 0.65) * 0.025;
          tableau.cabin.panorama.position.y =
            (1 - clamp(pose.altitude / 30)) * 0.025;
        }
        if (state.view === "cabin") {
          target = local(-3.5, 1.3, 0);
          position = local(4.2, 1.62, 0.04);
        } else if (state.view === "seat") {
          // Turn toward the oval window from the saved traveller's window seat.
          // Hide only that traveller so the eye camera cannot see its own head.
          position = local(-0.9, 1.35, -Math.min(1.13, 1.37 * aspect));
          target = local(-0.72, 1.31, -1.845);
        }
      }
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
      camera.layers.mask = state.saved.layers;
      if (camera.isPerspectiveCamera && camera.fov !== state.saved.fov) {
        camera.fov = state.saved.fov;
        camera.updateProjectionMatrix();
      }
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
      const nightValue = typeof night === "function" ? night() : night;
      const tableau = makeTableau(
        sequence.mode,
        sequence.shirt,
        sequence.appearance,
        Number.isFinite(nightValue) ? clamp(nightValue) : 0,
      );
      tableau.stage.position.copy(anchor);
      if (sequence.mode === "flight")
        tableau.stage.traverse((node) => node.layers.set(FLIGHT_LAYER));
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
        view: "outside",
      };
      tableau.stage.userData.flightView = "outside";
      current = state;
      applyEnvironment(state);
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
          camera.layers.mask = state.saved.layers;
          if (camera.isPerspectiveCamera) {
            camera.fov = state.saved.fov;
            camera.updateProjectionMatrix();
          }
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
    setView(view) {
      const state = current;
      if (
        !state ||
        state.sequence.mode !== "flight" ||
        !["outside", "cabin", "seat"].includes(view) ||
        state.phases.has("arriving") ||
        state.elapsed >= (state.reduced ? 0.68 : state.duration - 2.3)
      )
        return false;
      if (state.view === view) return true;
      if (view !== "outside" && !state.tableau.cabin) {
        const cabin = flightCabin(
          state.tableau.kit,
          state.sequence.shirt,
          state.sequence.appearance,
          state.tableau.night,
        );
        state.tableau.cabin = cabin;
        cabin.group.traverse((node) => node.layers.set(FLIGHT_LAYER));
        state.tableau.stage.add(cabin.group);
        state.tableau.lights.push(...cabin.lights);
      }
      state.view = view;
      state.tableau.stage.userData.flightView = view;
      state.staticCameraPlaced = false;
      frame(state);
      return true;
    },
    cancel,
    dispose() {
      if (destroyed) return;
      cancel();
      destroyed = true;
      environmentTexture?.dispose();
      environmentTexture = null;
    },
    get active() {
      return !!current;
    },
    get view() {
      return current?.view || "outside";
    },
  };
}
