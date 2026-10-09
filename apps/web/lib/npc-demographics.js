import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Authored scenic roles from the user's eight-category CSV. This is not a
// demographic census, live crowd feed, or an inference about someone's gender.
export const NPC_CATEGORY_SOURCE = "data/npc_demographic_categories.csv";
export const NPC_CATEGORIES = [
  {
    id: "DEMO_001",
    name: "Solo Man",
    role: "solo-man",
    brief: "Smart-casual clothing, walking shoes and a canvas tote.",
  },
  {
    id: "DEMO_002",
    name: "Solo Woman",
    role: "solo-woman",
    brief: "City outfits, light jackets and scarves.",
  },
  {
    id: "DEMO_003",
    name: "Family Group",
    role: "family",
    brief:
      "Coordinated caregivers and children; compact stroller on accessible paving.",
  },
  {
    id: "DEMO_004",
    name: "Youth / Child",
    role: "youth",
    brief:
      "Teenagers on pedestrian paths; younger children accompanied by family.",
  },
  {
    id: "DEMO_005",
    name: "Elder / Senior",
    role: "elder",
    brief:
      "A leisurely pace, greying hair and pauses along pedestrian streets.",
  },
  {
    id: "DEMO_006",
    name: "The Local Citizen",
    role: "local-citizen",
    brief: "Everyday neighbours, café workers and commuters.",
  },
  {
    id: "DEMO_007",
    name: "The Fellow Tourist",
    role: "tourist",
    brief: "Daypacks, comfortable shoes and a small camera.",
  },
  {
    id: "DEMO_008",
    name: "The Uniformed Professional",
    role: "professional",
    brief: "An original navy staff jacket, name badge and transit cap.",
  },
];
const names = {
  man: ["Duarte", "Tiago", "João", "Rafael", "Miguel", "Luís", "Nuno", "Diogo"],
  woman: [
    "Inês",
    "Marta",
    "Leonor",
    "Clara",
    "Sara",
    "Lúcia",
    "Rita",
    "Amélia",
  ],
  unspecified: ["Alex", "Noa", "Rui", "Mar", "Sasha", "Ari", "Jo", "Dani"],
};
const tops = [
  "#b47459",
  "#687f73",
  "#ece7df",
  "#777791",
  "#c19a4b",
  "#527b7c",
  "#884f48",
];
const skins = [
  "#5b3d30",
  "#76513b",
  "#a87955",
  "#d5af8b",
  "#b88762",
  "#e0b594",
];
const hair = ["#302823", "#6a4430", "#b98452", "#171719"];
const bottoms = ["#34444f", "#4e504b", "#6b5147", "#30324a", "#a69a7f"];
const hairStyles = ["short", "curly", "bob", "bun"];

export function npcSeed(value) {
  let seed = 2166136261;
  for (const c of String(value))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0;
}
function randomFor(value) {
  let seed = npcSeed(value);
  return () => {
    seed += 0x6d2b79f5;
    let n = Math.imul(seed ^ (seed >>> 15), seed | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Explicitly authored identity independent of skin colour or hairstyle. */
export function demographicProfile(categoryId, seed, options = {}) {
  const category =
    NPC_CATEGORIES.find((entry) => entry.id === categoryId) ||
    NPC_CATEGORIES[5];
  const random = randomFor(
    `${seed}:${category.id}:${options.groupRole || "solo"}`,
  );
  const choose = (values) => values[Math.floor(random() * values.length)];
  let gender =
    category.id === "DEMO_001"
      ? "man"
      : category.id === "DEMO_002"
        ? "woman"
        : "unspecified";
  let ageBand = "adult",
    role = category.role,
    prop = "none",
    speed = 0.97 + random() * 0.24;
  let height = 1.64 + random() * 0.19,
    style = choose(["casual", "jacket", "dress"]);
  if (gender === "man") style = choose(["casual", "jacket"]);
  let hairColor = choose(hair),
    hairstyle = choose(hairStyles);
  if (category.id === "DEMO_001") prop = random() > 0.4 ? "tote" : "none";
  if (category.id === "DEMO_002") prop = random() > 0.25 ? "scarf" : "none";
  if (category.id === "DEMO_003") {
    role = options.groupRole || "caregiver";
    gender = options.gender || "unspecified";
    speed = options.familySpeed || 0.94;
    style = "casual";
    if (role === "child") {
      ageBand = "child";
      height = 1.12 + random() * 0.14;
    } else if (role === "stroller-caregiver") prop = "stroller";
  }
  if (category.id === "DEMO_004") {
    role = "teen";
    ageBand = "teen";
    style = "casual";
    height = 1.45 + random() * 0.17;
    speed = 1.03 + random() * 0.22;
    prop = options.context === "park" && random() > 0.45 ? "scooter" : "none";
  }
  if (category.id === "DEMO_005") {
    role = "elder";
    ageBand = "elder";
    style = choose(["casual", "jacket", "dress"]);
    height = 1.59 + random() * 0.15;
    speed = 0.66 + random() * 0.15;
    hairColor = choose(["#a6a19a", "#d0cbc2", "#797773"]);
    prop = random() > 0.65 ? "cane" : "none";
  }
  if (category.id === "DEMO_006") {
    const contextualRoles =
      options.context === "market"
        ? ["shopper", "shopper", "neighbour", "market-vendor"]
        : options.context === "café" || options.context === "cafe"
          ? ["neighbour", "shopper", "café-worker"]
          : options.context === "transit"
            ? ["commuter", "commuter", "neighbour"]
            : ["neighbour", "commuter", "shopper"];
    role = contextualRoles.includes(options.role)
      ? options.role
      : choose(contextualRoles);
    style = role === "commuter" ? "jacket" : "casual";
    prop = ["café-worker", "market-vendor"].includes(role)
      ? "apron"
      : ["commuter", "shopper"].includes(role)
        ? "tote"
        : "none";
    speed =
      role === "commuter" ? 1.12 + random() * 0.12 : 0.96 + random() * 0.2;
  }
  if (category.id === "DEMO_007") {
    role = "visitor";
    style = choose(["tourist", "casual"]);
    prop = style === "casual" ? "camera" : "none";
    speed = 0.9 + random() * 0.15;
  }
  if (category.id === "DEMO_008") {
    role = options.context === "market" ? "market-staff" : "transit-staff";
    style = "jacket";
    prop = options.context === "market" ? "apron" : "staff-uniform";
    speed = 1.1 + random() * 0.13;
  }
  const bodyType =
    gender === "woman"
      ? "female"
      : gender === "man"
        ? "male"
        : choose(["male", "female"]);
  if (bodyType === "male" && style === "dress")
    style = category.id === "DEMO_005" ? "jacket" : "casual";
  const character = {
    bodyType,
    shirt: category.id === "DEMO_008" ? "#344e63" : choose(tops),
    trousers: choose(bottoms),
    skin: choose(skins),
    hair: hairColor,
    shoes: choose(["#eee8df", "#5c4b42", "#292d31"]),
    style,
    hairStyle: hairstyle,
    height: Math.max(1.4, height),
    phase: random() * Math.PI * 2,
  };
  return {
    categoryId: category.id,
    categoryName: category.name,
    role,
    gender,
    ageBand,
    height,
    prop,
    name: choose(names[gender] || names.unspecified),
    speed,
    pace: speed / 1.12,
    phase: character.phase,
    character,
    label: `Simulated · ${role.replaceAll("-", " ")}`,
    simulated: true,
    source: NPC_CATEGORY_SOURCE,
  };
}

function part(geometry, color) {
  if (geometry.index) {
    const source = geometry;
    geometry = source.toNonIndexed();
    source.dispose();
  }
  geometry.deleteAttribute("uv");
  const c = new T.Color(color),
    colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  return geometry;
}
const box = (size, position, color) =>
  part(new T.BoxGeometry(...size).translate(...position), color);
const sphere = (size, position, color) =>
  part(
    new T.SphereGeometry(1, 8, 5).scale(...size).translate(...position),
    color,
  );
function cylinder(radius, length, position, color, rotation = [0, 0, 0]) {
  const geometry = new T.CylinderGeometry(radius, radius, length, 7);
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  return part(geometry.translate(...position), color);
}
function torus(
  radius,
  tube,
  position,
  color,
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
) {
  const geometry = new T.TorusGeometry(radius, tube, 4, 10);
  geometry.scale(...scale);
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  return part(geometry.translate(...position), color);
}
function accessory(character, parts, anchor, name) {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((source) => source.dispose());
  const mesh = new T.Mesh(
    geometry,
    new T.MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.88,
    }),
  );
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  (anchor ? character.userData.rig[anchor] : character).add(mesh);
}

/** Apply immediately after createCharacter, before positioning the scenic actor. */
export function applyLocalDemographicVisuals(character, profile) {
  if (character.userData.demographic?.applied) return character;
  const rig = character.userData.rig;
  if (profile.ageBand === "child") {
    rig.leftLeg.scale.y = rig.rightLeg.scale.y = 0.86;
    rig.head.scale.setScalar(1.12);
    character.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(character);
    rig.hips.position.y -= bounds.min.y / character.scale.y;
    character.updateMatrixWorld(true);
    const corrected = new T.Box3().setFromObject(character);
    character.scale.multiplyScalar(
      profile.height / (corrected.max.y - corrected.min.y),
    );
    character.userData.restHipY = rig.hips.position.y;
    character.userData.height = profile.height;
  }
  character.userData.demographic = {
    categoryId: profile.categoryId,
    role: profile.role,
    ageBand: profile.ageBand,
    gender: profile.gender,
    simulated: true,
    applied: true,
  };
  if (profile.prop === "tote")
    accessory(
      character,
      [
        box([0.22, 0.24, 0.068], [0, -0.39, 0.002], "#d0b68d"),
        torus(0.079, 0.007, [0, -0.236, 0], "#96714f", [0, 0, 0], [1, 1.3, 1]),
        box([0.145, 0.004, 0.006], [0, -0.39, 0.037], "#96714f"),
      ],
      "leftElbow",
      "scenic canvas tote",
    );
  if (profile.prop === "scarf")
    accessory(
      character,
      [
        torus(0.051, 0.015, [0, 0.055, 0], "#bd7e5b", [Math.PI / 2, 0, 0]),
        box([0.041, 0.23, 0.015], [-0.034, -0.09, 0.068], "#bd7e5b"),
        box([0.041, 0.018, 0.018], [-0.034, -0.186, 0.069], "#f0d2a5"),
      ],
      "neck",
      "scenic city scarf",
    );
  if (profile.prop === "apron")
    accessory(
      character,
      [
        box([0.22, 0.32, 0.01], [0, -0.035, 0.098], "#e5d2af"),
        box([0.115, 0.21, 0.012], [0, 0.23, 0.11], "#e5d2af"),
        box([0.13, 0.09, 0.015], [0, -0.02, 0.11], "#bb9a70"),
      ],
      "torso",
      "scenic café apron",
    );
  if (profile.prop === "camera")
    accessory(
      character,
      [
        box([0.14, 0.082, 0.043], [0, 0.15, 0.135], "#353c43"),
        cylinder(0.033, 0.042, [0, 0.15, 0.17], "#6b8996", [Math.PI / 2, 0, 0]),
        box([0.01, 0.18, 0.008], [-0.045, 0.276, 0.108], "#594334"),
        box([0.01, 0.18, 0.008], [0.045, 0.276, 0.108], "#594334"),
      ],
      "torso",
      "scenic visitor camera",
    );
  if (profile.prop === "cane")
    accessory(
      character,
      [
        cylinder(0.014, 0.83, [0.292, 0.435, 0.075], "#76563d"),
        cylinder(0.02, 0.1, [0.27, 0.852, 0.075], "#76563d", [
          0,
          0,
          Math.PI / 2,
        ]),
        cylinder(0.021, 0.035, [0.292, 0.025, 0.075], "#383a37"),
      ],
      null,
      "scenic walking cane",
    );
  if (profile.prop === "staff-uniform") {
    accessory(
      character,
      [
        sphere([0.108, 0.045, 0.104], [0, 0.11, -0.006], "#344e63"),
        box([0.143, 0.012, 0.08], [0, 0.09, 0.09], "#243747"),
        box([0.026, 0.015, 0.008], [0, 0.128, 0.095], "#d8b976"),
      ],
      "head",
      "scenic transit cap",
    );
    accessory(
      character,
      [box([0.059, 0.022, 0.009], [-0.092, 0.285, 0.119], "#e8dcc2")],
      "torso",
      "scenic staff name badge",
    );
  }
  if (profile.prop === "stroller") {
    const parts = [
      box([0.54, 0.055, 0.6], [0, 0.29, 0.81], "#495b56"),
      box([0.43, 0.12, 0.47], [0, 0.39, 0.82], "#809783"),
      box([0.46, 0.34, 0.06], [0, 0.57, 0.58], "#809783"),
      sphere([0.27, 0.19, 0.24], [0, 0.76, 0.65], "#809783"),
      cylinder(0.018, 0.45, [0, 0.96, 0.35], "#303b3d", [0, 0, Math.PI / 2]),
    ];
    for (const x of [-0.25, 0.25]) {
      parts.push(
        cylinder(0.012, 0.62, [x, 0.6, 0.47], "#303b3d", [-0.3, 0, 0]),
      );
      for (const z of [0.55, 1.07])
        parts.push(
          cylinder(0.095, 0.05, [x, 0.11, z], "#353a3e", [0, 0, Math.PI / 2]),
        );
    }
    accessory(character, parts, null, "scenic compact stroller");
  }
  if (profile.prop === "scooter")
    accessory(
      character,
      [
        box([0.13, 0.035, 0.47], [0, 0.12, 0.13], "#a89652"),
        cylinder(0.012, 0.9, [0, 0.58, 0.37], "#637d83"),
        cylinder(0.014, 0.31, [0, 1.025, 0.37], "#637d83", [0, 0, Math.PI / 2]),
        cylinder(0.06, 0.04, [0, 0.065, 0.33], "#383f44", [0, 0, Math.PI / 2]),
        cylinder(0.06, 0.04, [0, 0.065, -0.055], "#383f44", [
          0,
          0,
          Math.PI / 2,
        ]),
      ],
      null,
      "scenic park scooter",
    );
  poseLocalDemographic(character, profile, 0);
  return character;
}

/** Original prop poses, applied after the shared walking rig's animation. */
export function poseLocalDemographic(character, profile, time = 0) {
  const rig = character.userData.rig;
  if (profile.prop === "stroller" || profile.prop === "scooter") {
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = -0.62;
    rig.leftElbow.rotation.x = rig.rightElbow.rotation.x = -0.3;
    if (profile.prop === "scooter") {
      rig.leftLeg.rotation.x = 0;
      rig.leftKnee.rotation.x = 0;
      rig.rightLeg.rotation.x =
        profile.moving === false ? 0 : Math.sin(time * 3.1) * 0.16;
    }
  }
  if (profile.prop === "tote") {
    rig.leftArm.rotation.x *= 0.22;
    rig.leftElbow.rotation.x = -0.08;
  }
  if (profile.prop === "cane") {
    rig.rightArm.rotation.x = -0.25;
    rig.rightElbow.rotation.x = -0.35;
  }
  if (profile.prop === "scooter") rig.hips.position.y += 0.1;
  if (profile.ageBand === "elder") rig.torso.rotation.x += 0.025;
  if (
    profile.moving === false &&
    (profile.role === "visitor" ||
      profile.role === "shopper" ||
      profile.role === "neighbour")
  )
    rig.head.rotation.y += Math.sin(time * 0.35 + profile.phase) * 0.2;
}
