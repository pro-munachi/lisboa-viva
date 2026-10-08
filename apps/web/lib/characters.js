import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Original ROAM character artwork. Adult proportions and articulated joints are
// authored here; no character assets or textures are taken from the reference.
const STYLES = new Set(["casual", "jacket", "dress", "tourist"]);
const HAIR_STYLES = new Set(["short", "curly", "bob", "bun"]);
const disposedCharacters = new WeakSet();

function profile(rings, sides = 10, frontOpening = 0) {
  const vertices = [],
    indices = [];
  const ascending = rings.at(-1)[0] > rings[0][0];
  for (const [y, width, depth] of rings) {
    for (let i = 0; i < sides; i++) {
      const opening = frontOpening * (1.25 - Math.max(0, y) * 0.65);
      const angle = frontOpening
        ? opening + (i / (sides - 1)) * (Math.PI * 2 - opening * 2)
        : (i / sides) * Math.PI * 2;
      vertices.push(Math.sin(angle) * width, y, Math.cos(angle) * depth);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides - (frontOpening ? 1 : 0); i++) {
      const a = j * sides + i,
        b = j * sides + ((i + 1) % sides);
      if (ascending) indices.push(a, b, a + sides, b, b + sides, a + sides);
      else indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const bottom = vertices.length / 3;
  vertices.push(0, rings[0][0], 0, 0, rings.at(-1)[0], 0);
  for (let i = 0; i < sides - (frontOpening ? 1 : 0); i++) {
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
  // Tiny features get their shape from their silhouette and smooth normals;
  // dense latitude rings add cost without improving street-scale readability.
  const geometry = new T.SphereGeometry(1, 6, 4);
  geometry.scale(x, y, z);
  geometry.translate(...position);
  return geometry;
}

function sculptedFace(bodyType) {
  const geometry = new T.SphereGeometry(1, 16, 12);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    // A rounded forehead, cheekbones and a narrower jaw read as a person from
    // three-quarter angles; the chin is subtly forward rather than spherical.
    const jaw =
      y < -0.28 ? 1 - (-y - 0.28) * (bodyType === "female" ? 0.34 : 0.24) : 1;
    const cheek = y > -0.3 && y < 0.25 ? 1.025 : 1;
    positions.setXYZ(
      i,
      x * (bodyType === "female" ? 0.103 : 0.107) * jaw * cheek,
      y * 0.127,
      z * 0.092 + (z > 0 && y < -0.5 ? 0.009 * (-y - 0.5) : 0),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function seam(size, position, rotation = [0, 0, 0]) {
  return detailBox(size, position, rotation);
}

function horizontalRing(width, depth, y, thickness = 0.006) {
  const geometry = new T.TorusGeometry(width, thickness, 4, 16);
  geometry.rotateX(Math.PI / 2);
  geometry.scale(1, 1, depth / width);
  geometry.translate(0, y, 0);
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

// Thin folded cloth follows the jacket rather than stacking solid box slats.
function clothPatch(points) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function hairCap(style, feminine) {
  const positions = [],
    indices = [],
    sides = 20,
    rings = 8;
  for (let j = 0; j <= rings; j++) {
    for (let i = 0; i <= sides; i++) {
      const phi = (i / sides) * Math.PI * 2;
      // The same saved enum names have deliberately different silhouettes.
      // Male medium hair stays above the jaw; the female bob frames the chin.
      const limit =
        style === "bob"
          ? feminine
            ? 2.08 - 1.01 * Math.cos(phi) + Math.sin(phi) * 0.11
            : 1.76 - 0.58 * Math.cos(phi) + Math.sin(phi) * 0.13
          : style === "curly"
            ? feminine
              ? 1.98 - 0.72 * Math.cos(phi)
              : 1.61 - 0.47 * Math.cos(phi)
            : feminine
              ? 1.65 - 0.51 * Math.cos(phi)
              : 1.52 - 0.37 * Math.cos(phi);
      const theta = (j / rings) * limit;
      const depth =
        style === "bob"
          ? feminine
            ? 0.122
            : 0.116
          : style === "curly"
            ? feminine
              ? 0.127
              : 0.107
            : feminine
              ? 0.108
              : 0.097;
      const height =
        style === "bob"
          ? feminine
            ? 0.151
            : 0.135
          : style === "curly"
            ? feminine
              ? 0.154
              : 0.141
            : feminine
              ? 0.132
              : 0.129;
      const width =
        style === "bob"
          ? feminine
            ? 0.119
            : 0.112
          : style === "curly"
            ? feminine
              ? 0.124
              : 0.113
            : feminine
              ? 0.107
              : 0.102;
      positions.push(
        Math.sin(phi) * Math.sin(theta) * width,
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
  const bodyType = options.bodyType === "female" ? "female" : "male";
  const feminine = bodyType === "female";
  const requestedStyle =
    options.style === "explorer"
      ? "tourist"
      : STYLES.has(options.style)
        ? options.style
        : "casual";
  // Old saves may contain male + dress. Their read compatibility is retained
  // while this renderer consistently presents the supported casual outfit.
  const style =
    !feminine && requestedStyle === "dress" ? "casual" : requestedStyle;
  const hairStyle = HAIR_STYLES.has(options.hairStyle)
    ? options.hairStyle
    : "short";
  const palette = {
    shirt: options.shirt || "#e6a253",
    skin: options.skin || "#b87550",
    hair: options.hair || "#302823",
    trousers: options.trousers || "#34444f",
    shoes:
      options.shoes ||
      (style === "tourist"
        ? "#98795b"
        : style === "dress"
          ? "#634943"
          : style === "jacket"
            ? "#424c55"
            : "#eee8df"),
    trim: options.trim || "#f6f0e5",
    garment: new T.Color(options.shirt || "#e6a253")
      .lerp(new T.Color("#343d46"), 0.22)
      .getStyle(),
    stitch: new T.Color(options.shirt || "#e6a253")
      .lerp(new T.Color("#f6f0e5"), 0.18)
      .getStyle(),
    trouserStitch: new T.Color(options.trousers || "#34444f")
      .lerp(new T.Color("#f6f0e5"), 0.12)
      .getStyle(),
    lip: new T.Color(options.skin || "#b87550")
      .lerp(new T.Color("#8b4147"), 0.43)
      .getStyle(),
    eyeWhite: "#fffaf2",
    face: "#272524",
    sole: "#292d31",
  };
  const materials = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new T.MeshStandardMaterial({
        color,
        roughness: key === "skin" ? 0.78 : 0.86,
        flatShading: false,
      }),
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
  const detailMaterial = new T.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.85,
  });
  function batchRigidDetails(parent, excluded, name) {
    const pieces = parent.children.filter(
      (node) => node.isMesh && !excluded.includes(node.name),
    );
    if (pieces.length < 2) return;
    const parts = [],
      features = {};
    for (const item of pieces) {
      item.updateMatrix();
      const geometry = item.geometry.clone().applyMatrix4(item.matrix);
      const color = item.material.color;
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
      geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
      features[item.name] = {
        color: color.getHexString(),
        vertices: geometry.attributes.position.count,
      };
      parts.push(geometry);
      item.removeFromParent();
      item.geometry.dispose();
    }
    const combined = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    const item = new T.Mesh(combined, detailMaterial);
    item.name = name;
    item.userData.features = features;
    item.castShadow = item.receiveShadow = true;
    parent.add(item);
  }

  const hips = joint("hips", character, 0, 0.9);
  mesh(
    profile([
      [-0.065, feminine ? 0.159 : 0.148, 0.085],
      [0.055, feminine ? 0.165 : 0.156, 0.1],
      [0.135, feminine ? 0.128 : 0.14, 0.085],
    ]),
    style === "dress" ? "shirt" : "trousers",
    hips,
    "pelvis",
  );
  const torso = joint("torso", hips, 0, 0.115);
  const croppedJacket = feminine && style === "jacket";
  const fittedTee = feminine && ["casual", "tourist"].includes(style);
  mesh(
    profile(
      [
        [
          croppedJacket ? 0.075 : 0,
          feminine
            ? croppedJacket
              ? 0.138
              : 0.128
            : style === "jacket"
              ? 0.153
              : 0.14,
          style === "jacket" ? 0.092 : 0.08,
        ],
        [0.13, feminine ? (croppedJacket ? 0.145 : 0.14) : 0.152, 0.087],
        [
          0.29,
          feminine ? (fittedTee ? 0.165 : 0.173) : 0.192,
          fittedTee ? 0.099 : 0.105,
        ],
        [0.35, feminine ? (fittedTee ? 0.166 : 0.174) : 0.193, 0.092],
        [0.395, feminine ? 0.127 : 0.135, 0.073],
      ],
      10,
      style === "jacket" ? 0.31 : 0,
    ),
    "shirt",
    torso,
    "tailored top",
  );
  mesh(
    profile([
      [0, 0.037, 0.035],
      [0.075, 0.034, 0.034],
    ]),
    "skin",
    joint("neck", hips, 0, 0.493),
    "neck",
  );
  const head = joint("head", hips, 0, 0.68);
  mesh(sculptedFace(bodyType), "skin", head, "face");
  mesh(
    [
      ellipsoid(0.014, 0.025, 0.012, [-0.104, -0.006, -0.002]),
      ellipsoid(0.014, 0.025, 0.012, [0.104, -0.006, -0.002]),
      ellipsoid(0.009, 0.026, 0.009, [0, 0.022, 0.088]),
      ellipsoid(0.014, 0.01, 0.014, [0, -0.003, 0.091]),
    ],
    "skin",
    head,
    "ears and nose",
  );
  mesh(
    [
      ellipsoid(0.0055, 0.006, 0.0015, [-0.034, 0.027, 0.09]),
      ellipsoid(0.0055, 0.006, 0.0015, [0.034, 0.027, 0.09]),
      detailBox([0.028, 0.0035, 0.003], [-0.035, 0.045, 0.087], [0, 0, 0.09]),
      detailBox([0.028, 0.0035, 0.003], [0.035, 0.045, 0.087], [0, 0, -0.09]),
      detailBox([0.026, 0.0015, 0.002], [0, -0.045, 0.094]),
    ],
    "face",
    head,
    "eyes eyebrows and mouth",
  );
  mesh(
    [
      ellipsoid(0.0115, 0.0065, 0.0036, [-0.034, 0.027, 0.087]),
      ellipsoid(0.0115, 0.0065, 0.0036, [0.034, 0.027, 0.087]),
      ellipsoid(0.0017, 0.0018, 0.0008, [-0.035, 0.029, 0.092]),
      ellipsoid(0.0017, 0.0018, 0.0008, [0.033, 0.029, 0.092]),
    ],
    "eyeWhite",
    head,
    "eye whites and catchlights",
  );
  mesh(
    [
      ellipsoid(0.016, 0.0028, 0.0018, [0, -0.042, 0.094]),
      ellipsoid(0.014, 0.0032, 0.0018, [0, -0.048, 0.094]),
      ellipsoid(0.006, 0.017, 0.004, [-0.114, -0.004, 0.001]),
      ellipsoid(0.006, 0.017, 0.004, [0.114, -0.004, 0.001]),
    ],
    "lip",
    head,
    "lips and inner ears",
  );
  const hair = [hairCap(hairStyle, feminine)];
  if (hairStyle === "curly") {
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.39996,
        radius = (feminine ? 0.112 : 0.098) * Math.sqrt(i / 16);
      hair.push(
        ellipsoid(
          feminine ? 0.041 : 0.033,
          feminine ? 0.038 : 0.031,
          feminine ? 0.043 : 0.035,
          [
            Math.cos(angle) * radius,
            (feminine ? 0.104 : 0.117) +
              (feminine ? 0.044 : 0.035) * (1 - i / 16),
            Math.sin(angle) * radius - 0.008,
          ],
        ),
      );
    }
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * 0.45 + i * Math.PI * 0.275;
      hair.push(
        ellipsoid(
          feminine ? 0.046 : 0.032,
          feminine ? 0.06 : 0.026,
          feminine ? 0.044 : 0.031,
          [
            Math.sin(angle) * (feminine ? 0.107 : 0.095),
            feminine ? -0.014 : 0.046,
            Math.cos(angle) * (feminine ? 0.106 : 0.09) - 0.008,
          ],
        ),
      );
    }
  } else if (hairStyle === "bun") {
    if (feminine)
      hair.push(
        ellipsoid(0.065, 0.063, 0.061, [0, 0.119, -0.078]),
        ellipsoid(0.047, 0.038, 0.052, [0.023, 0.151, -0.064]),
      );
    else
      hair.push(
        ellipsoid(0.054, 0.062, 0.055, [0, 0.169, -0.011]),
        ellipsoid(0.039, 0.037, 0.043, [-0.013, 0.206, -0.01]),
      );
  } else if (hairStyle === "short") {
    if (feminine)
      hair.push(
        ellipsoid(0.066, 0.025, 0.09)
          .rotateZ(-0.42)
          .translate(-0.025, 0.095, 0.055),
        ellipsoid(0.018, 0.046, 0.034, [-0.091, -0.01, 0]),
        ellipsoid(0.014, 0.035, 0.027, [0.091, -0.002, -0.018]),
      );
    else
      hair.push(
        ellipsoid(0.073, 0.032, 0.055)
          .rotateZ(-0.15)
          .translate(-0.018, 0.12, 0.027),
        ellipsoid(0.012, 0.025, 0.019, [-0.093, 0.017, -0.01]),
        ellipsoid(0.012, 0.025, 0.019, [0.093, 0.017, -0.01]),
      );
  } else {
    if (feminine)
      hair.push(
        ellipsoid(0.03, 0.074, 0.043, [-0.105, -0.016, -0.015]),
        ellipsoid(0.027, 0.064, 0.043, [0.102, -0.023, -0.015]),
      );
    else
      hair.push(
        ellipsoid(0.088, 0.037, 0.072)
          .rotateZ(-0.32)
          .translate(-0.023, 0.1, 0.04),
        ellipsoid(0.072, 0.035, 0.035, [0, -0.012, -0.09]),
      );
  }
  const hairMesh = mesh(hair, "hair", head, `${hairStyle} hair`);
  hairMesh.userData.variant = (
    feminine
      ? {
          short: "pixie",
          curly: "full curls",
          bob: "classic bob",
          bun: "tied bun",
        }
      : {
          short: "fade",
          curly: "textured curls",
          bob: "swept waves",
          bun: "top knot",
        }
  )[hairStyle];

  const collar =
    style === "dress" || fittedTee
      ? [
          horizontalRing(
            style === "dress" ? 0.049 : 0.079,
            style === "dress" ? 0.042 : 0.061,
            0.397,
            0.007,
          ),
        ]
      : [
          clothPatch([
            [-0.022, 0.402, 0.051],
            [-0.071, 0.381, 0.074],
            [-0.056, 0.35, 0.095],
            [-0.022, 0.38, 0.086],
          ]),
          clothPatch(
            [
              [0.022, 0.402, 0.051],
              [0.071, 0.381, 0.074],
              [0.056, 0.35, 0.095],
              [0.022, 0.38, 0.086],
            ].reverse(),
          ),
        ];
  const garmentDetails = [],
    stitches = [];
  if (style === "jacket") {
    const pocketY = croppedJacket ? 0.18 : 0.127;
    mesh(
      profile([
        [0.018, feminine ? 0.126 : 0.136, 0.077],
        [0.17, feminine ? 0.136 : 0.148, 0.082],
        [0.32, feminine ? 0.155 : 0.17, 0.086],
        [0.394, feminine ? 0.112 : 0.12, 0.069],
      ]),
      "trim",
      torso,
      "undershirt",
    );
    for (const side of [-1, 1]) {
      const lapel = [
        [-0.029, 0.386, 0.078],
        [-0.086, 0.329, 0.099],
        [-0.077, feminine ? 0.251 : 0.236, 0.101],
        [-0.046, 0.29, 0.106],
      ];
      const pocket = [
        [-0.068, pocketY + 0.03, 0.086],
        [-0.127, pocketY + 0.027, 0.063],
        [-0.125, pocketY - 0.029, 0.06],
        [-0.07, pocketY - 0.03, 0.088],
      ];
      if (side === 1) {
        for (const points of [lapel, pocket]) {
          points.forEach((point) => (point[0] *= -1));
          points.reverse();
        }
      }
      garmentDetails.push(clothPatch(lapel), clothPatch(pocket));
    }
    stitches.push(
      seam(
        [feminine ? 0.064 : 0.074, 0.005, 0.006],
        [-0.102, pocketY + 0.03, 0.099],
      ),
      seam(
        [feminine ? 0.064 : 0.074, 0.005, 0.006],
        [0.102, pocketY + 0.03, 0.099],
      ),
      seam(
        [0.004, croppedJacket ? 0.19 : 0.26, 0.005],
        [0, croppedJacket ? 0.201 : 0.165, -0.095],
      ),
      croppedJacket
        ? horizontalRing(0.13, 0.083, 0.082, 0.006)
        : seam([0.045, 0.006, 0.006], [0.112, 0.29, 0.108]),
    );
  } else if (style === "tourist") {
    collar.push(
      detailBox(
        [0.013, feminine ? 0.31 : 0.335, 0.012],
        [feminine ? -0.085 : -0.104, 0.213, 0.105],
      ),
      detailBox(
        [0.013, feminine ? 0.31 : 0.335, 0.012],
        [feminine ? 0.085 : 0.104, 0.213, 0.105],
      ),
    );
    const dayPack = mesh(
      profile([
        [-0.035, 0.108, 0.054],
        [0.035, 0.132, 0.077],
        [0.255, 0.13, 0.069],
        [0.31, 0.092, 0.039],
      ]).translate(0, 0.015, -0.145),
      "trousers",
      torso,
      "day pack",
    );
    const handle = new T.TorusGeometry(0.039, 0.007, 4, 12);
    handle.scale(1, 0.46, 1);
    handle.translate(0, 0.352, -0.146);
    const packDetails = mesh(
      [
        detailBox([0.17, 0.087, 0.02], [0, 0.086, -0.224]),
        seam([0.172, 0.005, 0.006], [0, 0.128, -0.237]),
        seam([0.185, 0.006, 0.008], [0, 0.258, -0.205]),
        handle,
      ],
      "garment",
      torso,
      "backpack pockets zip and handle",
    );
    if (feminine) {
      dayPack.scale.set(0.88, 0.94, 0.9);
      packDetails.scale.copy(dayPack.scale);
      garmentDetails.push(
        seam([0.007, 0.19, 0.008], [-0.127, 0.146, 0.08], [0, 0, -0.08]),
        seam([0.007, 0.19, 0.008], [0.127, 0.146, 0.08], [0, 0, 0.08]),
      );
      stitches.push(
        horizontalRing(0.13, 0.084, 0.015, 0.006),
        seam([0.22, 0.006, 0.007], [0, 0.313, -0.095]),
      );
    } else {
      garmentDetails.push(
        detailBox([0.072, 0.07, 0.01], [-0.085, 0.24, 0.106]),
        detailBox([0.072, 0.07, 0.01], [0.085, 0.24, 0.106]),
      );
      stitches.push(
        seam([0.067, 0.008, 0.012], [-0.085, 0.266, 0.112]),
        seam([0.067, 0.008, 0.012], [0.085, 0.266, 0.112]),
        seam([0.004, 0.27, 0.006], [0, 0.2, 0.105]),
      );
    }
  } else if (style === "casual") {
    if (feminine) {
      garmentDetails.push(
        seam([0.005, 0.19, 0.007], [-0.126, 0.115, 0.072], [0, 0, -0.11]),
        seam([0.005, 0.19, 0.007], [0.126, 0.115, 0.072], [0, 0, 0.11]),
      );
      stitches.push(
        seam([0.222, 0.008, 0.007], [0, 0.313, -0.095]),
        horizontalRing(0.129, 0.081, 0.016, 0.006),
      );
    } else {
      garmentDetails.push(
        detailBox([0.075, 0.08, 0.01], [-0.096, 0.258, 0.106]),
      );
      stitches.push(
        seam([0.076, 0.006, 0.009], [-0.096, 0.294, 0.112]),
        seam([0.255, 0.008, 0.007], [0, 0.313, -0.095]),
        seam([0.004, 0.135, 0.008], [0, 0.283, 0.113]),
        ellipsoid(0.004, 0.004, 0.004, [0, 0.292, 0.119]),
        ellipsoid(0.004, 0.004, 0.004, [0, 0.264, 0.115]),
        horizontalRing(0.14, 0.08, 0.016, 0.006),
      );
    }
  } else {
    garmentDetails.push(
      seam([0.005, 0.275, 0.008], [-0.075, 0.18, 0.089], [0, 0, -0.11]),
      seam([0.005, 0.275, 0.008], [0.075, 0.18, 0.089], [0, 0, 0.11]),
    );
    stitches.push(seam([0.005, 0.29, 0.007], [0, 0.185, -0.093]));
  }
  mesh(
    collar,
    style === "jacket" ? "garment" : "stitch",
    torso,
    fittedTee ? "scoop neckline and garment trim" : "collar and garment trim",
  );
  if (garmentDetails.length)
    mesh(garmentDetails, "garment", torso, "outfit pockets and tailoring");
  if (stitches.length)
    mesh(stitches, "stitch", torso, "front and back garment seams");
  if (style !== "dress") {
    mesh(
      [
        profile([
          [0.105, feminine ? 0.14 : 0.145, 0.088],
          [0.128, feminine ? 0.14 : 0.145, 0.088],
        ]),
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
      profile([
        [0.111, 0.142, 0.087],
        [0.136, 0.142, 0.087],
      ]),
      "trim",
      hips,
      "dress belt",
    );
    mesh(
      [
        horizontalRing(0.207, 0.13, -0.277, 0.008),
        ellipsoid(0.034, 0.013, 0.012, [-0.022, 0.123, -0.1]),
        ellipsoid(0.034, 0.013, 0.012, [0.022, 0.123, -0.1]),
        seam([0.018, 0.055, 0.006], [-0.014, 0.098, -0.102], [0, 0, -0.18]),
        seam([0.018, 0.055, 0.006], [0.014, 0.098, -0.102], [0, 0, 0.18]),
      ],
      "trim",
      hips,
      "dress hem and back waist tie",
    );
  }

  for (const [side, direction] of [
    ["left", -1],
    ["right", 1],
  ]) {
    const leg = joint(
      `${side}Leg`,
      hips,
      direction * (feminine ? 0.094 : 0.086),
      0.013,
    );
    leg.rotation.y = direction * 0.035;
    leg.rotation.z = direction * 0.012;
    const shorts = style === "tourist",
      bareLeg = style === "dress",
      shortHem = feminine ? -0.214 : -0.235;
    mesh(
      profile([
        [0, feminine ? 0.07 : 0.077, feminine ? 0.071 : 0.078],
        [-0.14, feminine ? 0.061 : 0.069, feminine ? 0.063 : 0.069],
        [
          shorts ? shortHem : -0.424,
          shorts ? (feminine ? 0.056 : 0.065) : feminine ? 0.045 : 0.049,
          shorts ? (feminine ? 0.055 : 0.062) : feminine ? 0.046 : 0.05,
        ],
      ]),
      bareLeg ? "skin" : "trousers",
      leg,
      `${side} thigh`,
    );
    if (shorts)
      mesh(
        profile([
          [
            shortHem + 0.002,
            feminine ? 0.052 : 0.059,
            feminine ? 0.052 : 0.057,
          ],
          [-0.424, 0.046, 0.048],
        ]),
        "skin",
        leg,
        `${side} lower thigh`,
      );
    if (!bareLeg) {
      const details = shorts
        ? [
            detailBox(
              [
                feminine ? 0.015 : 0.024,
                feminine ? 0.059 : 0.075,
                feminine ? 0.048 : 0.062,
              ],
              [direction * (feminine ? 0.057 : 0.064), -0.158, 0.006],
            ),
            seam(
              [feminine ? 0.018 : 0.027, 0.006, feminine ? 0.051 : 0.066],
              [direction * (feminine ? 0.057 : 0.064), -0.126, 0.006],
            ),
            profile([
              [
                shortHem + 0.005,
                feminine ? 0.058 : 0.068,
                feminine ? 0.057 : 0.063,
              ],
              [
                shortHem - 0.007,
                feminine ? 0.058 : 0.068,
                feminine ? 0.057 : 0.063,
              ],
            ]),
          ]
        : [
            seam([0.004, 0.235, 0.006], [direction * 0.058, -0.145, 0.024]),
            seam([0.04, 0.003, 0.007], [direction * 0.007, -0.092, -0.069]),
          ];
      mesh(
        details,
        shorts ? "trousers" : "trouserStitch",
        leg,
        shorts
          ? `${side} cargo pocket and short cuff`
          : `${side} trouser tailoring`,
      );
    }
    const knee = joint(`${side}Knee`, leg, 0, -0.418);
    mesh(
      [
        profile([
          [0, 0.048, 0.049],
          [-0.115, 0.055, 0.053],
          [-0.365, 0.034, 0.035],
        ]),
        ellipsoid(0.048, 0.046, 0.048),
      ],
      shorts || bareLeg ? "skin" : "trousers",
      knee,
      `${side} calf`,
    );
    mesh(
      profile([
        [-0.05, feminine ? 0.063 : 0.069, feminine ? 0.121 : 0.134],
        [0.01, feminine ? 0.061 : 0.067, feminine ? 0.124 : 0.137],
        [0.06, feminine ? 0.043 : 0.046, feminine ? 0.068 : 0.072],
      ]).translate(0, -0.423, 0.048),
      "shoes",
      knee,
      `${side} shoe`,
    );
    mesh(
      profile([
        [-0.015, feminine ? 0.065 : 0.071, feminine ? 0.127 : 0.14],
        [0.015, feminine ? 0.065 : 0.071, feminine ? 0.127 : 0.14],
      ]).translate(0, -0.48, 0.048),
      "sole",
      knee,
      `${side} shoe sole`,
    );
    mesh(
      style === "dress"
        ? [
            seam([0.1, 0.009, 0.02], [0, -0.376, 0.092]),
            seam([0.025, 0.012, 0.008], [direction * 0.046, -0.381, 0.098]),
          ]
        : [
            seam([0.061, 0.005, 0.009], [0, -0.371, 0.077]),
            seam([0.076, 0.005, 0.009], [0, -0.382, 0.105]),
            seam([0.078, 0.005, 0.009], [0, -0.397, 0.13]),
            seam([0.093, 0.021, 0.007], [0, -0.426, -0.087]),
          ],
      "trim",
      knee,
      `${side} shoe laces and heel tab`,
    );

    const arm = joint(
      `${side}Arm`,
      hips,
      direction * (feminine ? 0.19 : 0.204),
      0.471,
    );
    arm.rotation.z = direction * 0.045;
    const longSleeves = style === "jacket",
      sleeveEnd = feminine
        ? style === "dress"
          ? -0.089
          : style === "tourist"
            ? -0.132
            : -0.118
        : -0.155;
    mesh(
      profile([
        [0.047, feminine ? 0.022 : 0.025, feminine ? 0.027 : 0.031],
        [0.017, feminine ? 0.055 : 0.061, feminine ? 0.054 : 0.061],
        [
          longSleeves ? -0.12 : sleeveEnd * 0.77,
          feminine ? 0.052 : 0.058,
          feminine ? 0.047 : 0.052,
        ],
        [
          longSleeves ? -0.267 : sleeveEnd,
          feminine ? 0.042 : 0.047,
          feminine ? 0.041 : 0.046,
        ],
      ]),
      "shirt",
      arm,
      `${side} sleeve`,
    );
    if (!longSleeves)
      mesh(
        profile([
          [
            sleeveEnd + 0.001,
            feminine ? 0.039 : 0.043,
            feminine ? 0.04 : 0.044,
          ],
          [-0.267, 0.036, 0.037],
        ]),
        "skin",
        arm,
        `${side} upper arm`,
      );
    const elbow = joint(`${side}Elbow`, arm, 0, -0.267);
    mesh(
      profile([
        [0.029, 0.017, 0.018],
        [0, 0.038, 0.038],
        [-0.095, 0.039, 0.04],
        [-0.247, 0.026, 0.027],
      ]),
      longSleeves ? "shirt" : "skin",
      elbow,
      `${side} forearm`,
    );
    mesh(
      profile(
        longSleeves
          ? [
              [-0.226, 0.03, 0.031],
              [-0.246, 0.03, 0.031],
            ]
          : [
              [
                sleeveEnd + 0.017,
                feminine ? 0.045 : 0.05,
                feminine ? 0.044 : 0.049,
              ],
              [
                sleeveEnd + 0.001,
                feminine ? 0.045 : 0.05,
                feminine ? 0.044 : 0.049,
              ],
            ],
      ),
      "garment",
      longSleeves ? elbow : arm,
      `${side} sewn sleeve cuff`,
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

  // Decorations on a rigid joint share one vertex-coloured draw. Main fabric,
  // face, hair and shoe surfaces keep their independently editable materials.
  batchRigidDetails(head, ["face", `${hairStyle} hair`], "facial details");
  batchRigidDetails(torso, ["tailored top"], "wardrobe details");
  batchRigidDetails(hips, ["pelvis"], "waist and skirt details");
  for (const side of ["left", "right"]) {
    batchRigidDetails(rig[`${side}Arm`], [], `${side} upper arm details`);
    batchRigidDetails(
      rig[`${side}Elbow`],
      [],
      `${side} forearm and hand details`,
    );
    batchRigidDetails(
      rig[`${side}Leg`],
      [`${side} thigh`],
      `${side} leg details`,
    );
    batchRigidDetails(
      rig[`${side}Knee`],
      [`${side} shoe`],
      `${side} lower leg details`,
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
    bodyType,
    outfitVariant: (feminine
      ? {
          casual: "fitted tee",
          jacket: "cropped city jacket",
          dress: "dress",
          tourist: "fitted explorer",
        }
      : {
          casual: "polo shirt",
          jacket: "city jacket",
          tourist: "explorer shirt",
        })[style],
    motion: 0,
    lastTime: null,
    restHipY: hips.position.y,
    restJointPositions: Object.fromEntries(
      Object.entries(rig).map(([name, joint]) => [
        name,
        joint.position.toArray(),
      ]),
    ),
    appearance: {
      bodyType,
      outfitStyle: style,
      topColor: palette.shirt,
      bottomColor: palette.trousers,
      hairStyle,
      hairColor: palette.hair,
      skinTone: palette.skin,
      shoeColor: palette.shoes,
    },
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
  if (disposedCharacters.has(character)) return;
  disposedCharacters.add(character);
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

/** Replace saved identity/wardrobe fields while retaining route/activity state.
 * Returns the replacement actor; callers must update their actor reference.
 * Direct root attachments (name badges, markers) transfer without disposal.
 */
export function replaceCharacterAppearance(character, appearance = {}) {
  if (!character?.userData?.rig || disposedCharacters.has(character)) {
    throw new Error(
      "An active ROAM character is required for wardrobe replacement.",
    );
  }
  const old = character.userData,
    previous = old.appearance || {};
  const wardrobe = { ...previous, ...appearance };
  const next = createCharacter({
    bodyType: wardrobe.bodyType || old.bodyType || "male",
    style: wardrobe.outfitStyle,
    shirt: wardrobe.topColor,
    trousers: wardrobe.bottomColor,
    hairStyle: wardrobe.hairStyle,
    hair: wardrobe.hairColor,
    skin: wardrobe.skinTone,
    shoes: wardrobe.shoeColor,
    phase: old.phase,
    height: old.height,
  });
  next.name = character.name;
  next.position.copy(character.position);
  next.quaternion.copy(character.quaternion);
  next.visible = character.visible;
  next.layers.mask = character.layers.mask;
  next.renderOrder = character.renderOrder;
  const newState = next.userData;
  next.userData = {
    ...old,
    ...newState,
    motion: old.motion,
    lastTime: old.lastTime,
  };
  for (const [name, joint] of Object.entries(newState.rig)) {
    const previousJoint = old.rig[name];
    if (!previousJoint) continue;
    joint.quaternion.copy(previousJoint.quaternion);
    joint.scale.copy(previousJoint.scale);
    const previousRest = old.restJointPositions?.[name];
    if (previousRest)
      joint.position.add(
        previousJoint.position.clone().sub(new T.Vector3(...previousRest)),
      );
    else joint.position.copy(previousJoint.position);
    if (name === "hips")
      joint.position.y =
        newState.restHipY + previousJoint.position.y - old.restHipY;
  }
  // Preserve application metadata on named meshes (e.g. presence hit targets).
  const oldNodes = new Map();
  character.traverse((node) => {
    if (node.name) oldNodes.set(node.name, node);
  });
  next.traverse((node) => {
    const previousNode = oldNodes.get(node.name);
    if (previousNode && node !== next)
      node.userData = { ...previousNode.userData, ...node.userData };
  });
  const rigRoots = new Set(Object.values(old.rig));
  for (const child of [...character.children])
    if (!rigRoots.has(child)) next.add(child);
  const parent = character.parent;
  disposeCharacter(character);
  parent?.add(next);
  next.updateMatrixWorld(true);
  return next;
}
