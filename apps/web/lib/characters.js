import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Original ROAM character artwork. Adult proportions and articulated joints are
// authored here; no character assets or textures are taken from the reference.
const STYLES = new Set(["casual", "jacket", "dress", "tourist"]);
const HAIR_STYLES = new Set(["short", "curly", "bob", "bun"]);

function profile(rings, sides = 10) {
  const vertices = [],
    indices = [];
  const ascending = rings.at(-1)[0] > rings[0][0];
  for (const [y, width, depth] of rings) {
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      vertices.push(Math.sin(angle) * width, y, Math.cos(angle) * depth);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * sides + i,
        b = j * sides + ((i + 1) % sides);
      if (ascending) indices.push(a, b, a + sides, b, b + sides, a + sides);
      else indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const bottom = vertices.length / 3;
  vertices.push(0, rings[0][0], 0, 0, rings.at(-1)[0], 0);
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    if (ascending) {
      indices.push(bottom, next, i);
      indices.push(
        bottom + 1,
        (rings.length - 1) * sides + i,
        (rings.length - 1) * sides + next,
      );
    } else {
      indices.push(bottom, i, next);
      indices.push(
        bottom + 1,
        (rings.length - 1) * sides + next,
        (rings.length - 1) * sides + i,
      );
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ellipsoid(x, y, z, position = [0, 0, 0]) {
  const geometry = new T.SphereGeometry(1, 10, 7);
  geometry.scale(x, y, z);
  geometry.translate(...position);
  return geometry;
}

function detailBox(size, position, rotation = [0, 0, 0]) {
  const geometry = new T.BoxGeometry(...size);
  geometry.applyMatrix4(
    new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)),
  );
  geometry.translate(...position);
  return geometry;
}

function hairCap(style) {
  const positions = [],
    indices = [],
    sides = 14,
    rings = 6;
  for (let j = 0; j <= rings; j++) {
    for (let i = 0; i <= sides; i++) {
      const phi = (i / sides) * Math.PI * 2;
      const limit =
        style === "bob"
          ? 2.05 - 0.95 * Math.cos(phi)
          : 1.65 - 0.6 * Math.cos(phi);
      const theta = (j / rings) * limit;
      const depth = style === "bob" ? 0.113 : 0.103;
      const height = style === "bob" ? 0.148 : 0.134;
      positions.push(
        Math.sin(phi) * Math.sin(theta) * 0.11,
        Math.cos(theta) * height,
        Math.cos(phi) * Math.sin(theta) * depth - 0.008,
      );
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * (sides + 1) + i;
      indices.push(
        a,
        a + sides + 1,
        a + 1,
        a + 1,
        a + sides + 1,
        a + sides + 2,
      );
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A 1.75 m human, facing +Z, with feet at Y=0. No browser APIs required. */
export function createCharacter(options = {}) {
  const style = STYLES.has(options.style) ? options.style : "casual";
  const hairStyle = HAIR_STYLES.has(options.hairStyle)
    ? options.hairStyle
    : "short";
  const palette = {
    shirt: options.shirt || "#e6a253",
    skin: options.skin || "#b87550",
    hair: options.hair || "#302823",
    trousers: options.trousers || "#34444f",
    shoes: options.shoes || "#eee8df",
    trim: options.trim || "#f6f0e5",
    face: "#272524",
    sole: "#292d31",
  };
  const materials = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new T.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true }),
    ]),
  );
  const character = new T.Group();
  character.name = "ROAM human";
  const rig = {};

  function mesh(parts, material, parent, name) {
    const geometries = Array.isArray(parts) ? parts : [parts];
    // Combining face, collar and hair details keeps a whole person below 40 draws.
    const normalized = geometries.map((geometry) => {
      geometry.deleteAttribute("uv");
      return geometry.toNonIndexed();
    });
    const geometry =
      normalized.length === 1 ? normalized[0] : mergeGeometries(normalized);
    for (const source of geometries) source.dispose();
    if (normalized.length > 1)
      for (const source of normalized) source.dispose();
    const item = new T.Mesh(geometry, materials[material]);
    item.name = name;
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function joint(name, parent, x, y, z = 0) {
    const group = new T.Group();
    group.name = name;
    group.position.set(x, y, z);
    parent.add(group);
    rig[name] = group;
    return group;
  }

  const hips = joint("hips", character, 0, 0.9);
  mesh(
    profile([
      [-0.065, 0.148, 0.085],
      [0.055, 0.156, 0.1],
      [0.135, 0.14, 0.085],
    ]),
    style === "dress" ? "shirt" : "trousers",
    hips,
    "pelvis",
  );
  const torso = joint("torso", hips, 0, 0.115);
  mesh(
    profile([
      [0, 0.14, 0.08],
      [0.13, 0.152, 0.087],
      [0.29, 0.192, 0.105],
      [0.35, 0.193, 0.092],
      [0.395, 0.135, 0.073],
    ]),
    "shirt",
    torso,
    "tailored top",
  );
  mesh(
    profile([
      [0, 0.042, 0.04],
      [0.095, 0.038, 0.038],
    ]),
    "skin",
    joint("neck", hips, 0, 0.493),
    "neck",
  );
  const head = joint("head", hips, 0, 0.705);
  mesh(ellipsoid(0.098, 0.123, 0.092), "skin", head, "face");
  mesh(
    [
      ellipsoid(0.017, 0.029, 0.016, [-0.097, -0.007, 0]),
      ellipsoid(0.017, 0.029, 0.016, [0.097, -0.007, 0]),
      ellipsoid(0.017, 0.025, 0.022, [0, 0.001, 0.085]),
    ],
    "skin",
    head,
    "ears and nose",
  );
  mesh(
    [
      ellipsoid(0.01, 0.006, 0.004, [-0.032, 0.025, 0.087]),
      ellipsoid(0.01, 0.006, 0.004, [0.032, 0.025, 0.087]),
      detailBox([0.027, 0.005, 0.003], [-0.033, 0.041, 0.086], [0, 0, 0.06]),
      detailBox([0.027, 0.005, 0.003], [0.033, 0.041, 0.086], [0, 0, -0.06]),
      detailBox([0.027, 0.003, 0.004], [0, -0.042, 0.085]),
    ],
    "face",
    head,
    "eyes eyebrows and mouth",
  );
  const hair = [hairCap(hairStyle)];
  if (hairStyle === "curly") {
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.39996,
        radius = 0.088 * Math.sqrt(i / 12);
      hair.push(
        ellipsoid(0.039, 0.034, 0.037, [
          Math.cos(angle) * radius,
          0.1 + 0.035 * (1 - i / 12),
          Math.sin(angle) * radius - 0.008,
        ]),
      );
    }
  } else if (hairStyle === "bun") {
    hair.push(ellipsoid(0.065, 0.063, 0.061, [0, 0.119, -0.078]));
  }
  mesh(hair, "hair", head, `${hairStyle} hair`);

  const collar = [
    detailBox([0.063, 0.019, 0.024], [-0.04, 0.385, 0.079], [0, 0, -0.42]),
    detailBox([0.063, 0.019, 0.024], [0.04, 0.385, 0.079], [0, 0, 0.42]),
  ];
  if (style === "jacket") {
    collar.push(
      detailBox([0.021, 0.27, 0.015], [-0.058, 0.207, 0.105], [0, 0, -0.13]),
      detailBox([0.021, 0.27, 0.015], [0.058, 0.207, 0.105], [0, 0, 0.13]),
    );
    mesh(
      detailBox([0.103, 0.278, 0.016], [0, 0.227, 0.105]),
      "trim",
      torso,
      "undershirt",
    );
  } else if (style === "tourist") {
    collar.push(
      detailBox([0.013, 0.335, 0.012], [-0.104, 0.213, 0.105]),
      detailBox([0.013, 0.335, 0.012], [0.104, 0.213, 0.105]),
    );
    mesh(
      profile([
        [-0.035, 0.112, 0.03],
        [0.23, 0.13, 0.048],
        [0.285, 0.096, 0.026],
      ]).translate(0, 0.02, -0.118),
      "trousers",
      torso,
      "day pack",
    );
  }
  mesh(collar, "trim", torso, "collar and garment trim");
  if (style !== "dress") {
    mesh(
      [
        detailBox([0.285, 0.023, 0.165], [0, 0.117, 0]),
        detailBox([0.023, 0.022, 0.014], [0, 0.117, 0.094]),
      ],
      "sole",
      hips,
      "belt",
    );
  } else {
    mesh(
      profile([
        [-0.29, 0.215, 0.135],
        [-0.15, 0.174, 0.107],
        [0.125, 0.14, 0.085],
      ]),
      "shirt",
      hips,
      "skirt",
    );
    mesh(
      detailBox([0.28, 0.025, 0.17], [0, 0.123, 0]),
      "trim",
      hips,
      "dress belt",
    );
  }

  for (const [side, direction] of [
    ["left", -1],
    ["right", 1],
  ]) {
    const leg = joint(`${side}Leg`, hips, direction * 0.086, 0.013);
    const shorts = style === "tourist",
      bareLeg = style === "dress";
    mesh(
      profile([
        [0, 0.077, 0.078],
        [-0.14, 0.069, 0.069],
        [
          shorts ? -0.235 : -0.405,
          shorts ? 0.065 : 0.049,
          shorts ? 0.062 : 0.05,
        ],
      ]),
      bareLeg ? "skin" : "trousers",
      leg,
      `${side} thigh`,
    );
    if (shorts)
      mesh(
        profile([
          [-0.233, 0.059, 0.057],
          [-0.405, 0.046, 0.048],
        ]),
        "skin",
        leg,
        `${side} lower thigh`,
      );
    const knee = joint(`${side}Knee`, leg, 0, -0.418);
    mesh(
      profile([
        [0, 0.048, 0.049],
        [-0.115, 0.055, 0.053],
        [-0.365, 0.034, 0.035],
      ]),
      shorts || bareLeg ? "skin" : "trousers",
      knee,
      `${side} calf`,
    );
    mesh(
      profile([
        [-0.05, 0.069, 0.134],
        [0.01, 0.067, 0.137],
        [0.06, 0.046, 0.072],
      ]).translate(0, -0.423, 0.048),
      "shoes",
      knee,
      `${side} shoe`,
    );
    mesh(
      profile([
        [-0.015, 0.071, 0.14],
        [0.015, 0.071, 0.14],
      ]).translate(0, -0.48, 0.048),
      "sole",
      knee,
      `${side} shoe sole`,
    );

    const arm = joint(`${side}Arm`, hips, direction * 0.213, 0.471);
    arm.rotation.z = direction * 0.095;
    const longSleeves = style === "jacket";
    mesh(
      profile([
        [0.021, 0.061, 0.061],
        [-0.12, 0.058, 0.052],
        [longSleeves ? -0.267 : -0.155, 0.047, 0.046],
      ]),
      "shirt",
      arm,
      `${side} sleeve`,
    );
    if (!longSleeves)
      mesh(
        profile([
          [-0.154, 0.043, 0.044],
          [-0.267, 0.036, 0.037],
        ]),
        "skin",
        arm,
        `${side} upper arm`,
      );
    const elbow = joint(`${side}Elbow`, arm, 0, -0.267);
    mesh(
      profile([
        [0, 0.038, 0.038],
        [-0.095, 0.039, 0.04],
        [-0.247, 0.026, 0.027],
      ]),
      longSleeves ? "shirt" : "skin",
      elbow,
      `${side} forearm`,
    );
    mesh(
      [
        ellipsoid(0.033, 0.056, 0.029, [0, -0.294, 0.005]),
        ellipsoid(0.016, 0.027, 0.018, [-direction * 0.024, -0.276, 0.014]),
      ],
      "skin",
      elbow,
      `${side} hand`,
    );
  }

  character.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(character);
  const height = Number.isFinite(options.height)
    ? T.MathUtils.clamp(options.height, 1.4, 2.1)
    : 1.75;
  const size = bounds.max.y - bounds.min.y;
  character.scale.setScalar(height / size);
  // Hair variants have different silhouettes; normalize to the requested height
  // while keeping the root at ground level for route interpolation.
  hips.position.y -= bounds.min.y;
  character.userData = {
    rig,
    phase: Number.isFinite(options.phase) ? options.phase : 0,
    height,
    style,
    hairStyle,
    motion: 0,
    lastTime: null,
    restHipY: hips.position.y,
  };
  animateCharacter(character, 0, false);
  return character;
}

/** Update joints only. Route logic retains complete ownership of world position. */
export function animateCharacter(character, time, moving) {
  const state = character.userData,
    rig = state.rig;
  if (!rig || !Number.isFinite(time)) return;
  const dt =
    state.lastTime === null
      ? 1 / 60
      : T.MathUtils.clamp(time - state.lastTime, 0, 0.1);
  state.lastTime = time;
  state.motion += ((moving ? 1 : 0) - state.motion) * (1 - Math.exp(-dt * 14));
  const motion = state.motion,
    step = time * 7.8 + state.phase;
  const left = Math.sin(step),
    right = Math.sin(step + Math.PI);
  rig.leftLeg.rotation.x = -left * 0.43 * motion;
  rig.rightLeg.rotation.x = -right * 0.43 * motion;
  rig.leftKnee.rotation.x = Math.max(0, Math.sin(step - 0.65)) * 0.68 * motion;
  rig.rightKnee.rotation.x =
    Math.max(0, Math.sin(step + Math.PI - 0.65)) * 0.68 * motion;
  rig.leftArm.rotation.x = left * 0.31 * motion;
  rig.rightArm.rotation.x = right * 0.31 * motion;
  rig.leftElbow.rotation.x = -0.11 - Math.max(0, left) * 0.18 * motion;
  rig.rightElbow.rotation.x = -0.11 - Math.max(0, right) * 0.18 * motion;
  rig.hips.position.y =
    state.restHipY + Math.abs(Math.sin(step)) * 0.014 * motion;
  rig.hips.rotation.z = left * 0.023 * motion;
  rig.torso.rotation.x =
    0.015 * motion + Math.sin(time * 1.5 + state.phase) * 0.007 * (1 - motion);
  rig.head.rotation.y =
    Math.sin(time * 0.48 + state.phase) * 0.065 * (1 - motion);
}

/** All resources belong to this person, so normal scene teardown is sufficient. */
export function disposeCharacter(character) {
  const geometries = new Set(),
    materials = new Set();
  character.traverse((node) => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  character.removeFromParent();
}
