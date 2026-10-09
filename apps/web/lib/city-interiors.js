import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCharacter, animateCharacter } from "./characters";
import { createTransitScene } from "./city-transit-scenes";
import { createClubLighting } from "./city-club-lighting";
import { lightingForMinute } from "./city-lighting";

// Original, softly rounded Lisbon interiors in ROAM’s bright social palette.
// None reproduces a surveyed business
// floor plan or imports artwork, furniture, textures or reference-game assets.
const ZONES = {
  home: [
    ["rest", "Rest corner", -5.4, -3.5, -2.9, -2.6],
    ["kitchen", "Kitchen", 5.1, -4.9, 4.7, -2.7],
    ["plan", "Travel desk", -5.7, 3.4, -3.6, 3.4],
  ],
  cafe: [
    ["espresso", "Espresso counter", 0.5, -4.2, 0.5, -2.0],
    ["pastry", "Pastry display", -5.8, -4.0, -4.6, -2.0],
    ["table", "Café tables", 3.9, 2.2, 3.9, 4.0],
  ],
  gym: [
    ["treadmill", "Treadmills", -5.1, -3.5, -4.0, -0.5],
    ["weights", "Free weights", 4.7, -4.5, 3.5, -2.3],
    ["stretch", "Stretch studio", 3.7, 2.7, 1.3, 3.4],
  ],
  shop: [
    ["browse", "Browse the collection", -5.1, -1.0, -3.0, 0.1],
    ["try-on", "Fitting area", 5.7, -4.3, 4.6, -1.8],
    ["counter", "Shop counter", 5.3, 2.8, 2.6, 3.0],
  ],
  museum: [
    ["gallery", "Original art gallery", -4.8, -5.8, -4.8, -3.3],
    ["tiles", "Azulejo display", 4.7, -5.8, 4.7, -3.3],
    ["bench", "Reading bench", 4.8, 2.7, 2.5, 3.1],
  ],
  bar: [
    ["listen", "Music corner", -5.4, -3.9, -3.7, -1.0],
    ["counter", "Bar counter", 4.1, -3.9, 3.8, -1.3],
    ["lounge", "Lounge", 4.1, 3.1, 1.7, 3.8],
  ],
};
const TITLES = {
  home: "A SUA CASA",
  cafe: "CAFÉ · LISBOA",
  gym: "MOVIMENTO",
  shop: "FEITO EM LISBOA",
  museum: "GALERIA · AZULEJO",
  bar: "MÚSICA AO VIVO",
};

function texture(kind) {
  const size = 128,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const grain = ((x * 13 + y * 37 + x * y * 3) % 23) / 23;
      let rgb;
      if (kind === "tiles") {
        const cx = ((u * 4) % 1) - 0.5,
          cy = ((v * 4) % 1) - 0.5;
        const flower =
          Math.abs(cx * cy) < 0.014 ||
          Math.abs(Math.hypot(cx, cy) - 0.26) < 0.035;
        const border = Math.abs(cx) > 0.465 || Math.abs(cy) > 0.465;
        const diamond = Math.abs(Math.abs(cx) + Math.abs(cy) - 0.36) < 0.035;
        rgb = border
          ? [218, 229, 243]
          : flower || diamond
            ? [36, 86, 216]
            : [249, 252, 255];
      } else if (kind === "wood") {
        const seam = y % 32 < 2;
        const streak = Math.sin(u * 120 + Math.sin(v * 8) * 3) * 4 + grain * 6;
        rgb = seam
          ? [210, 195, 178]
          : [233 + streak * 0.45, 218 + streak * 0.4, 195 + streak * 0.35];
      } else if (kind === "cork") {
        rgb = [220 + grain * 12, 233 + grain * 10, 242 + grain * 8];
      } else if (kind === "art") {
        const arch = Math.hypot((u - 0.45) * 0.85, v - 0.48) < 0.29;
        const sun = Math.hypot(u - 0.74, v - 0.21) < 0.12;
        rgb = sun
          ? [246, 163, 148]
          : arch
            ? [36, 86, 216]
            : v > 0.7
              ? [185, 229, 211]
              : [249, 246, 255];
      } else {
        const seam = x % 32 < 1 || y % 32 < 1;
        const checker = (Math.floor(x / 32) + Math.floor(y / 32)) % 2;
        rgb = seam
          ? [223, 231, 244]
          : checker
            ? [234 + grain * 5, 242 + grain * 5, 251 + grain * 3]
            : [252, 253, 255];
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = 255;
    }
  const map = new THREE.DataTexture(pixels, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

function label(text, color = "#2456d8", cream = "#ffffff") {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, 768, 192);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 50;
  while (size > 20) {
    ctx.font = `700 ${size}px "DM Sans", Arial, sans-serif`;
    if (ctx.measureText(text).width < 690) break;
    size--;
  }
  ctx.fillText(text, 384, 98);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
}

/** Keep added scenic locals inexpensive: one colored body and one moving head.
 * The original host/trainer rigs remain fully articulated. All cloned geometry
 * and the vertex-color material belong to this resident’s normal scene teardown.
 */
function compactScenicResident(resident) {
  resident.updateMatrixWorld(true);
  const head = resident.userData.rig.head;
  const headOrigin = new THREE.Vector3().setFromMatrixPosition(
    head.matrixWorld,
  );
  const headInverse = new THREE.Matrix4().makeTranslation(
    -headOrigin.x,
    -headOrigin.y,
    -headOrigin.z,
  );
  const parts = { body: [], head: [] },
    geometries = new Set(),
    materials = new Set();
  resident.traverse((node) => {
    if (!node.isMesh) return;
    let parent = node,
      isHead = false;
    while (parent && parent !== resident) {
      if (parent === head) isHead = true;
      parent = parent.parent;
    }
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    if (isHead) geometry.applyMatrix4(headInverse);
    geometry.deleteAttribute("uv");
    const previous = geometry.getAttribute("color"),
      count = geometry.getAttribute("position").count,
      colors = new Float32Array(count * 3),
      tint = node.material.color;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = (previous ? previous.getX(i) : 1) * tint.r;
      colors[i * 3 + 1] = (previous ? previous.getY(i) : 1) * tint.g;
      colors[i * 3 + 2] = (previous ? previous.getZ(i) : 1) * tint.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts[isHead ? "head" : "body"].push(geometry);
    geometries.add(node.geometry);
    materials.add(node.material);
  });
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.86,
  });
  resident.clear();
  delete resident.userData.rig;
  const headJoint = new THREE.Group();
  headJoint.position.copy(headOrigin);
  for (const [name, sources] of Object.entries(parts)) {
    const geometry = mergeGeometries(sources, false);
    sources.forEach((source) => source.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `scenic resident ${name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    (name === "head" ? headJoint : resident).add(mesh);
  }
  resident.add(headJoint);
  resident.userData.scenicHead = headJoint;
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((source) => source.dispose());
  return resident;
}

/** Interior direction follows city time, with enough fill to explore at night.
 * The bar stays subdued so its original colored fixtures remain readable.
 */
export function interiorLightingForMinute(minute, kind = "home") {
  const state = lightingForMinute(minute),
    night = state.night,
    club = kind === "bar";
  return {
    ...state,
    hemisphereSky: club
      ? "#c6bdd5"
      : `#${new THREE.Color("#e4f1ff").lerp(new THREE.Color("#e8d0b5"), night).getHexString()}`,
    hemisphereGround: club ? "#8a746a" : "#ae9172",
    hemisphereIntensity: club ? 0.84 - night * 0.14 : 1.55 - night * 0.43,
    sunColor: "#f5ddbc",
    sunIntensity: club ? 0.65 - night * 0.33 : 2.35 - night * 1.6,
    exposure: club ? 1.12 : 1.04 + night * 0.06,
  };
}

function withInteriorLighting(room, kind, reducedMotion, glowMaterial = null) {
  const fixtures =
    kind === "bar" ? createClubLighting({ reducedMotion }) : null;
  // Cut the soft decorative cones at the actual room floor. World-space clip
  // planes follow the translated room rather than bleeding below its cutaway.
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02),
    floorPoint = new THREE.Vector3();
  fixtures?.group.traverse((node) => {
    if (node.geometry?.type === "ConeGeometry")
      node.material.clippingPlanes = [floorPlane];
  });
  const lamps = new THREE.Group();
  lamps.name = "ROAM warm room lamps";
  const lights = [-2.9, 2.9].map((x) => {
    const light = new THREE.PointLight("#ffce91", 0, 11, 2);
    light.position.set(x, 2.83, 0);
    light.castShadow = false;
    light.userData.interiorLamp = true;
    lamps.add(light);
    return light;
  });
  room.group.add(lamps);
  if (fixtures) room.group.add(fixtures.group);
  let disposed = false;
  const setNight = (value) => {
    if (disposed) return;
    const night = Number.isFinite(value)
      ? THREE.MathUtils.clamp(value, 0, 1)
      : 0;
    lights.forEach((light) => {
      light.intensity = kind === "bar" ? 4 + night * 5 : 3 + night * 24;
    });
    if (glowMaterial) glowMaterial.emissiveIntensity = 0.25 + night * 0.75;
  };
  setNight(0);
  return {
    ...room,
    setNight,
    update(time, dt, motion, activeZoneId) {
      if (disposed) return;
      room.update?.(time, dt, motion, activeZoneId);
      fixtures?.update(time, { paused: !motion, reducedMotion });
      if (fixtures)
        floorPlane.setFromNormalAndCoplanarPoint(
          floorPlane.normal,
          room.group.localToWorld(floorPoint.set(0, 0.02, 0)),
        );
    },
    // Release managed fixtures before the caller traverses room resources.
    dispose() {
      if (disposed) return;
      disposed = true;
      fixtures?.dispose();
      lights.forEach((light) => light.dispose());
      lamps.removeFromParent();
      lamps.clear();
      room.dispose?.();
    },
  };
}

/** A roofless room centred on local coordinates. Front entry is at +Z.
 * All returned resources belong to group and can use the city scene's teardown.
 */
export function createInteriorScene(
  requestedKind,
  { shirt = "#e6a253", reducedMotion = false } = {},
) {
  if (["airport", "station", "bus-stop"].includes(requestedKind))
    return withInteriorLighting(
      createTransitScene(requestedKind, { shirt }),
      requestedKind,
      reducedMotion,
    );
  const kind =
    requestedKind === "restaurant"
      ? "cafe"
      : ZONES[requestedKind]
        ? requestedKind
        : "home";
  const group = new THREE.Group();
  group.name = `ROAM original ${kind} interior`;
  const zones = ZONES[kind].map(([id, name, x, z, tx, tz]) => ({
    id,
    name,
    point: { x, z },
    target: { x: tx, z: tz },
  }));
  const seats =
    {
      home: { rest: { x: -0.35, z: -3.6, angle: 0, height: 0.77 } },
      cafe: { table: { x: 2.75, z: 2.2, angle: Math.PI / 2, height: 0.57 } },
      museum: { bench: { x: 4.9, z: 2.7, angle: 0, height: 0.74 } },
      bar: { lounge: { x: 4.4, z: 3.4, angle: 0, height: 0.77 } },
    }[kind] || {};
  zones.forEach((zone) => {
    if (seats[zone.id]) zone.seat = seats[zone.id];
  });
  const spawn = { x: 0, z: 5.35 };
  const obstacles = [],
    buckets = new Map();
  const mats = {
    plaster: new THREE.MeshStandardMaterial({
      color: "#fffdf8",
      roughness: 0.94,
    }),
    cream: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.85,
    }),
    wood: new THREE.MeshStandardMaterial({ color: "#e6d6bc", roughness: 0.82 }),
    olive: new THREE.MeshStandardMaterial({
      color: "#b9e5d3",
      roughness: 0.92,
    }),
    ochre: new THREE.MeshStandardMaterial({ color: "#f5cf73", roughness: 0.9 }),
    blue: new THREE.MeshStandardMaterial({ color: "#2456d8", roughness: 0.83 }),
    dark: new THREE.MeshStandardMaterial({ color: "#243246", roughness: 0.74 }),
    brass: new THREE.MeshStandardMaterial({
      color: "#a9b8d0",
      metalness: 0.56,
      roughness: 0.38,
    }),
    fabric: new THREE.MeshStandardMaterial({ color: "#f6a394", roughness: 1 }),
    lilac: new THREE.MeshStandardMaterial({ color: "#d4c4ee", roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: "#bcdff5",
      transparent: true,
      opacity: 0.35,
      roughness: 0.2,
      depthWrite: false,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: "#fff1cb",
      emissive: "#ffdf9a",
      emissiveIntensity: 0.35,
    }),
  };
  const floorMap = texture(
    ["home", "shop", "bar"].includes(kind)
      ? "wood"
      : kind === "gym"
        ? "cork"
        : "stone",
  );
  floorMap.repeat.set(4.5, 3.5);
  mats.floor = new THREE.MeshStandardMaterial({
    map: floorMap,
    roughness: 0.92,
  });
  const tileMap = texture("tiles");
  mats.tiles = new THREE.MeshStandardMaterial({
    map: tileMap,
    roughness: 0.74,
  });
  mats.art = new THREE.MeshStandardMaterial({
    map: texture("art"),
    roughness: 0.88,
  });

  const add = (geometry, material, zone = "") => {
    const key = `${material}|${zone}`;
    if (!buckets.has(key)) buckets.set(key, { material, zone, parts: [] });
    buckets
      .get(key)
      .parts.push(geometry.index ? geometry.toNonIndexed() : geometry.clone());
    geometry.dispose();
  };
  const transform = (geometry, x, y, z, rx = 0, ry = 0, rz = 0) => {
    geometry.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)),
    );
    geometry.translate(x, y, z);
    return geometry;
  };
  const box = (x, y, z, w, h, d, material = "wood", zone = "", ry = 0) => {
    // Bevel the substantial furniture; fine trim and room structure stay lean.
    // Rounding stays inside the original dimensions and collision footprints.
    const rounded =
      zone && material !== "glass" && w >= 0.5 && h >= 0.11 && d >= 0.25;
    const geometry = rounded
      ? new RoundedBoxGeometry(
          w,
          h,
          d,
          1,
          Math.min(0.17, w * 0.2, h * 0.3, d * 0.2),
        )
      : new THREE.BoxGeometry(w, h, d);
    add(transform(geometry, x, y, z, 0, ry), material, zone);
  };
  const cylinder = (
    x,
    y,
    z,
    r,
    height,
    material = "wood",
    zone = "",
    top = r,
    rx = 0,
    rz = 0,
  ) =>
    add(
      transform(
        new THREE.CylinderGeometry(top, r, height, 12),
        x,
        y,
        z,
        rx,
        0,
        rz,
      ),
      material,
      zone,
    );
  const sphere = (x, y, z, sx, sy, sz, material, zone = "") =>
    add(
      new THREE.SphereGeometry(1, 12, 8).scale(sx, sy, sz).translate(x, y, z),
      material,
      zone,
    );
  const plane = (
    x,
    y,
    z,
    width,
    height,
    material,
    zone = "",
    rx = 0,
    ry = 0,
  ) => {
    const geometry = new THREE.PlaneGeometry(width, height);
    if (material === "tiles") {
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height);
    }
    add(transform(geometry, x, y, z, rx, ry), material, zone);
  };
  const footprint = (x, z, width, depth, zone = "") =>
    obstacles.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      zone,
    });
  const sign = (text, x, y, z, width = 3.2, zone = "", ry = 0) => {
    const material = label(text);
    if (!material) return;
    const item = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 4),
      material,
    );
    item.position.set(x, y, z);
    item.rotation.y = ry;
    item.userData.zone = zone;
    item.name = text;
    group.add(item);
  };
  const plant = (x, z, scale = 1) => {
    cylinder(
      x,
      0.32 * scale,
      z,
      0.28 * scale,
      0.6 * scale,
      "ochre",
      "",
      0.36 * scale,
    );
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      sphere(
        x + Math.cos(a) * 0.19 * scale,
        (0.8 + (i % 2) * 0.2) * scale,
        z + Math.sin(a) * 0.19 * scale,
        0.18 * scale,
        0.48 * scale,
        0.09 * scale,
        "olive",
      );
    }
    footprint(x, z, 0.75 * scale, 0.75 * scale);
  };
  const chair = (x, z, zone, ry = 0, color = "olive") => {
    const point = (px, py, pz) => ({
      x: x + px * Math.cos(ry) + pz * Math.sin(ry),
      y: py,
      z: z - px * Math.sin(ry) + pz * Math.cos(ry),
    });
    const atBox = (px, py, pz, w, h, d, mat) => {
      const p = point(px, py, pz);
      box(p.x, p.y, p.z, w, h, d, mat, zone, ry);
    };
    atBox(0, 0.5, 0, 0.65, 0.14, 0.65, color);
    const back = point(0, 0.97, -0.26);
    add(
      transform(
        new THREE.SphereGeometry(1, 12, 8).scale(0.34, 0.39, 0.065),
        back.x,
        back.y,
        back.z,
        0,
        ry,
      ),
      color,
      zone,
    );
    for (const dx of [-0.25, 0.25])
      for (const dz of [-0.25, 0.25])
        atBox(dx, 0.24, dz, 0.055, 0.5, 0.055, "wood");
    footprint(x, z, 0.75, 0.75, zone);
  };
  const stool = (x, z, zone) => {
    cylinder(x, 0.88, z, 0.34, 0.12, "olive", zone);
    cylinder(x, 0.45, z, 0.045, 0.85, "brass", zone);
    cylinder(x, 0.065, z, 0.27, 0.08, "dark", zone);
    add(
      transform(
        new THREE.TorusGeometry(0.23, 0.025, 6, 16),
        x,
        0.31,
        z,
        Math.PI / 2,
      ),
      "brass",
      zone,
    );
    footprint(x, z, 0.75, 0.75, zone);
  };
  const cup = (x, y, z, zone = "") => {
    cylinder(x, y, z, 0.1, 0.13, "cream", zone, 0.12);
    cylinder(x, y - 0.08, z, 0.17, 0.025, "cream", zone);
    cylinder(x, y + 0.069, z, 0.08, 0.012, "wood", zone);
    add(
      transform(new THREE.TorusGeometry(0.065, 0.017, 6, 10), x + 0.12, y, z),
      "cream",
      zone,
    );
  };
  const books = (x, y, z, zone = "", count = 7) => {
    for (let i = 0; i < count; i++)
      box(
        x + i * 0.18,
        y + (i % 3) * 0.035,
        z,
        0.13,
        0.48 + (i % 3) * 0.07,
        0.28,
        ["ochre", "olive", "blue", "cream"][i % 4],
        zone,
      );
  };
  const sofa = (x, z, width = 3.4, zone = "", color = "olive", ry = 0) => {
    const p = (px, pz) => ({
      x: x + px * Math.cos(ry) + pz * Math.sin(ry),
      z: z - px * Math.sin(ry) + pz * Math.cos(ry),
    });
    const part = (px, y, pz, w, h, d, mat) => {
      const q = p(px, pz);
      box(q.x, y, q.z, w, h, d, mat, zone, ry);
    };
    part(0, 0.32, 0, width, 0.35, 1.15, "wood");
    part(0, 0.62, 0, width - 0.2, 0.3, 1.08, color);
    part(0, 1.02, -0.5, width, 0.83, 0.23, color);
    for (const dx of [-1, 1])
      part(dx * (width / 2 - 0.12), 0.8, 0, 0.25, 0.7, 1.1, color);
    for (const dx of [-0.8, 0.8])
      part(dx, 1.08, -0.35, 0.55, 0.45, 0.19, "fabric");
    footprint(x, z, width + 0.1, 1.3, zone);
  };
  const pendant = (x, z, height = 3.2) => {
    cylinder(x, height + 0.25, z, 0.015, 0.6, "brass");
    sphere(x, height - 0.18, z, 0.42, 0.2, 0.42, "cream");
    sphere(x, height - 0.32, z, 0.11, 0.11, 0.11, "glow");
  };

  const archPanel = (x, width, height, material) => {
    const radius = width / 2,
      shape = new THREE.Shape();
    shape.moveTo(-radius, 0);
    shape.lineTo(radius, 0);
    shape.lineTo(radius, height - radius);
    shape.absarc(0, height - radius, radius, 0, Math.PI, false);
    shape.closePath();
    add(
      transform(new THREE.ShapeGeometry(shape, 12), x, 0.02, -6.955),
      material,
    );
  };

  // Inward single-sided wall faces automatically disappear when viewed from
  // outside; low side returns retain a legible cutaway room from every angle.
  box(0, -0.12, 0, 18.25, 0.25, 14.25, "wood");
  plane(0, 0.008, 0, 18, 14, "floor", "", -Math.PI / 2);
  plane(0, 1.7, -7, 18, 3.4, "plaster");
  plane(-9, 1.7, -4, 6, 3.4, "plaster", "", 0, Math.PI / 2);
  plane(9, 1.7, -4, 6, 3.4, "plaster", "", 0, -Math.PI / 2);
  box(-9, 0.2, 3, 0.18, 0.4, 8, "plaster");
  box(9, 0.2, 3, 0.18, 0.4, 8, "plaster");
  plane(0, 0.68, -6.97, 17.8, 1.22, "tiles");
  box(0, 0.08, -6.85, 18, 0.16, 0.2, "wood");
  box(0, 1.34, -6.93, 18, 0.045, 0.04, "brass");
  archPanel(
    0,
    4.8,
    3.3,
    {
      home: "fabric",
      cafe: "fabric",
      gym: "olive",
      shop: "lilac",
      museum: "lilac",
      bar: "blue",
    }[kind],
  );
  sign(TITLES[kind], 0, 2.75, -6.91, 5.6);
  for (const x of [-6.9, 6.9]) {
    box(x, 2.0, -6.88, 1.2, 1.58, 0.11, "wood");
    box(x, 2.0, -6.8, 1.05, 1.4, 0.04, "blue");
    box(x, 2.0, -6.76, 0.045, 1.4, 0.04, "cream");
    box(x, 2.0, -6.75, 1.05, 0.045, 0.04, "cream");
    for (const side of [-1, 1])
      box(x + side * 0.81, 2.0, -6.83, 0.34, 1.58, 0.06, "olive");
  }
  plant(-8.1, 5.5, 1.25);
  plant(8.1, 5.5, 1.25);
  pendant(-2.9, 0);
  pendant(2.9, 0);

  if (kind === "home") {
    // Bedroom / living room, small tiled kitchen and a tourist planning desk.
    plane(-4.9, 0.015, -2.4, 6.0, 5.5, "fabric", "rest", -Math.PI / 2);
    box(-5.4, 0.37, -3.6, 3.4, 0.55, 4.15, "wood", "rest");
    box(-5.4, 0.76, -3.6, 3.23, 0.36, 4.0, "cream", "rest");
    add(
      transform(
        new RoundedBoxGeometry(3.6, 1.7, 0.17, 1, 0.08),
        -5.4,
        1.25,
        -5.55,
      ),
      "fabric",
      "rest",
    );
    box(-5.4, 0.99, -2.9, 3.22, 0.08, 2.4, "olive", "rest");
    for (const x of [-6.2, -4.6])
      box(x, 1.02, -4.8, 1.24, 0.23, 0.7, "cream", "rest");
    footprint(-5.4, -3.6, 3.6, 4.3, "rest");
    box(-7.75, 0.51, -4.2, 0.75, 1.0, 0.75, "wood", "rest");
    footprint(-7.75, -4.2, 0.9, 0.9, "rest");
    cylinder(-7.75, 1.55, -4.2, 0.22, 0.36, "cream", "rest", 0.18);
    cylinder(-7.75, 1.15, -4.2, 0.035, 0.3, "brass", "rest");
    sofa(-0.35, -3.6, 3.1, "rest", "fabric");
    box(-0.35, 0.48, -1.8, 2.2, 0.14, 0.9, "wood", "rest");
    footprint(-0.35, -1.8, 2.3, 1.0, "rest");
    books(-1.15, 0.77, -1.8, "rest", 4);
    cup(0.4, 0.68, -1.7, "rest");
    box(5.1, 0.52, -5.3, 5.8, 1.03, 1.2, "olive", "kitchen");
    box(5.1, 1.07, -5.3, 6.0, 0.11, 1.3, "cream", "kitchen");
    for (let i = 0; i < 4; i++) {
      box(2.9 + i * 1.35, 0.52, -4.67, 1.23, 0.84, 0.04, "wood", "kitchen");
      box(3.2 + i * 1.35, 0.78, -4.62, 0.21, 0.035, 0.055, "brass", "kitchen");
    }
    box(3.1, 1.14, -5.3, 1.15, 0.06, 0.75, "dark", "kitchen");
    for (const x of [2.8, 3.35])
      for (const z of [-5.5, -5.04])
        cylinder(x, 1.19, z, 0.14, 0.035, "brass", "kitchen");
    box(6.55, 1.14, -5.3, 1.1, 0.04, 0.69, "dark", "kitchen");
    cylinder(6.8, 1.37, -5.66, 0.034, 0.38, "brass", "kitchen");
    sphere(5.3, 1.22, -5.2, 0.3, 0.09, 0.3, "ochre", "kitchen");
    for (let i = 0; i < 4; i++)
      sphere(
        5.15 + (i % 2) * 0.2,
        1.34,
        -5.32 + Math.floor(i / 2) * 0.21,
        0.13,
        0.13,
        0.13,
        "ochre",
        "kitchen",
      );
    box(8.0, 1.06, -5.5, 0.85, 2.12, 1.0, "cream", "kitchen");
    box(7.6, 1.15, -4.95, 0.06, 0.5, 0.05, "brass", "kitchen");
    footprint(5.2, -5.3, 6.25, 1.5, "kitchen");
    box(-5.8, 0.93, 3.45, 3.0, 0.13, 1.15, "wood", "plan");
    for (const x of [-7, -4.6])
      for (const z of [3.05, 3.85])
        box(x, 0.47, z, 0.09, 0.9, 0.09, "brass", "plan");
    box(-5.3, 1.03, 3.3, 0.9, 0.035, 0.7, "blue", "plan");
    box(-6.25, 1.04, 3.45, 0.72, 0.035, 0.5, "cream", "plan");
    books(-7.0, 1.25, 3.55, "plan", 4);
    cup(-4.8, 1.16, 3.6, "plan");
    chair(-5.8, 4.6, "plan", Math.PI);
    footprint(-5.8, 3.45, 3.2, 1.2, "plan");
    sign("TRAVEL NOTES", -5.8, 1.5, 3.1, 1.4, "plan");
    sofa(5.5, 3.9, 2.4, "rest", "olive");
    cylinder(5.5, 0.51, 2.25, 0.6, 0.13, "cream", "rest");
    cylinder(5.5, 0.26, 2.25, 0.2, 0.46, "blue", "rest");
    cup(5.5, 0.69, 2.25, "rest");
    footprint(5.5, 2.25, 1.25, 1.25, "rest");
  }

  if (kind === "cafe") {
    box(1.4, 0.67, -4.55, 6.2, 1.32, 1.25, "wood", "espresso");
    box(1.4, 1.38, -4.55, 6.4, 0.16, 1.45, "cream", "espresso");
    plane(1.4, 0.72, -3.91, 5.8, 1.1, "tiles", "espresso");
    box(0.6, 1.76, -4.6, 1.95, 0.63, 0.73, "brass", "espresso");
    box(0.6, 1.65, -4.13, 1.6, 0.16, 0.23, "dark", "espresso");
    for (const x of [0.12, 0.66, 1.18]) {
      cylinder(x, 1.8, -4.15, 0.035, 0.21, "dark", "espresso");
      cup(x, 1.49, -4.04, "espresso");
    }
    cylinder(2.65, 1.7, -4.75, 0.21, 0.58, "dark", "espresso");
    cylinder(2.65, 2.05, -4.75, 0.18, 0.25, "glass", "espresso");
    for (let i = 0; i < 5; i++)
      cup(
        3.3 + (i % 3) * 0.26,
        1.57 + Math.floor(i / 3) * 0.19,
        -4.6,
        "espresso",
      );
    footprint(1.4, -4.55, 6.4, 1.5, "espresso");
    box(-5.7, 0.65, -4.45, 3.2, 1.3, 1.35, "wood", "pastry");
    box(-5.7, 1.33, -4.45, 3.3, 0.1, 1.45, "cream", "pastry");
    box(-5.7, 1.88, -4.45, 3.1, 1.0, 1.35, "glass", "pastry");
    for (const x of [-7.2, -4.2])
      for (const z of [-5.08, -3.82])
        cylinder(x, 1.87, z, 0.022, 0.95, "brass", "pastry");
    box(-5.7, 2.41, -4.45, 3.2, 0.05, 1.4, "brass", "pastry");
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 5; i++) {
        const x = -6.7 + i * 0.5,
          z = -4.85 + row * 0.72;
        cylinder(x, 1.47, z, 0.19, 0.08, "ochre", "pastry");
        cylinder(x, 1.52, z, 0.135, 0.045, "cream", "pastry");
      }
    footprint(-5.7, -4.45, 3.3, 1.5, "pastry");
    sign("PASTELARIA", -5.7, 2.8, -6.8, 2.8, "pastry");
    for (const [x, z] of [
      [-4.1, 1.7],
      [3.9, 2.2],
      [4.4, -0.7],
    ]) {
      cylinder(x, 0.81, z, 0.78, 0.1, "wood", "table");
      cylinder(x, 0.42, z, 0.09, 0.78, "brass", "table");
      cylinder(x, 0.075, z, 0.4, 0.08, "dark", "table");
      chair(x - 1.15, z, "table", Math.PI / 2);
      chair(x + 1.15, z, "table", -Math.PI / 2);
      cup(x - 0.25, 0.96, z, "table");
      cup(x + 0.24, 0.96, z + 0.1, "table");
      footprint(x, z, 1.6, 1.6, "table");
    }
    box(-7.8, 1.45, -0.6, 0.45, 2.8, 1.9, "wood", "table");
    footprint(-7.8, -0.6, 0.65, 2.05, "table");
    books(-7.7, 1.55, -0.6, "table", 6);
    sofa(-5.3, 4.9, 2.4, "table", "fabric");
    cylinder(-5.3, 0.51, 3.55, 0.5, 0.1, "cream", "table");
    cylinder(-5.3, 0.26, 3.55, 0.15, 0.47, "blue", "table");
    cup(-5.3, 0.67, 3.55, "table");
    footprint(-5.3, 3.55, 1.05, 1.05, "table");
    plant(7.6, -4.7);
    plant(-7.5, -0.7, 0.7);
  }

  if (kind === "gym") {
    // Three original treadmills, dumbbell racks, floor studio and shower alcoves.
    for (const x of [-6.6, -4.5, -2.4]) {
      box(x, 0.22, -3.6, 1.4, 0.25, 2.55, "dark", "treadmill");
      box(x, 0.365, -3.6, 1.0, 0.035, 2.25, "olive", "treadmill");
      for (const dx of [-0.61, 0.61]) {
        box(x + dx, 1.05, -4.65, 0.08, 1.75, 0.08, "brass", "treadmill");
        box(x + dx, 1.2, -4.0, 0.075, 0.075, 1.55, "brass", "treadmill");
      }
      box(x, 1.83, -4.58, 1.2, 0.33, 0.22, "dark", "treadmill");
      box(x, 1.86, -4.45, 0.48, 0.19, 0.025, "blue", "treadmill");
      footprint(x, -3.6, 1.5, 2.75, "treadmill");
    }
    sign("MOVE · BREATHE · REPEAT", -4.5, 2.75, -6.8, 3.5, "treadmill");
    box(5.1, 0.5, -5.4, 4.5, 0.1, 0.75, "dark", "weights");
    box(5.1, 1.05, -5.4, 4.5, 0.1, 0.75, "dark", "weights");
    for (const x of [3.1, 7.1])
      box(x, 0.6, -5.4, 0.075, 1.2, 0.075, "brass", "weights");
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 7; i++) {
        const x = 3.3 + i * 0.58,
          y = 0.65 + row * 0.55;
        cylinder(
          x,
          y,
          -5.4,
          0.035,
          0.43,
          "brass",
          "weights",
          0.035,
          0,
          Math.PI / 2,
        );
        for (const side of [-1, 1])
          cylinder(
            x + side * 0.17,
            y,
            -5.4,
            0.115 + row * 0.025,
            0.1,
            "dark",
            "weights",
            0.115 + row * 0.025,
            0,
            Math.PI / 2,
          );
      }
    box(4.8, 0.44, -3.8, 0.78, 0.16, 2.1, "olive", "weights");
    for (const z of [-4.6, -3.0])
      box(4.8, 0.2, z, 0.075, 0.4, 0.075, "brass", "weights");
    footprint(5.0, -5.0, 4.5, 1.5, "weights");
    footprint(4.8, -3.8, 1.0, 2.25, "weights");
    for (const [x, z] of [
      [3.0, 2.5],
      [5.6, 2.5],
      [3.0, 0.1],
      [5.6, 0.1],
    ]) {
      box(x, 0.035, z, 1.45, 0.05, 2.1, "olive", "stretch");
      cylinder(x + 0.54, 0.18, z - 0.7, 0.13, 0.25, "cream", "stretch");
      box(x - 0.45, 0.14, z - 0.7, 0.23, 0.22, 0.38, "wood", "stretch");
    }
    for (const x of [-0.65, 0.75]) {
      box(x, 0.08, -6.2, 1.25, 0.13, 1.3, "cream");
      plane(x, 1.55, -6.94, 1.2, 2.8, "tiles");
      box(x + 0.65, 1.28, -6.25, 0.04, 2.55, 1.25, "glass");
      cylinder(x, 2.15, -6.5, 0.023, 0.7, "brass");
      cylinder(x, 2.52, -6.3, 0.15, 0.045, "brass");
      footprint(x, -6.2, 1.3, 1.35);
    }
    box(-6.4, 0.56, 2.0, 3.0, 0.14, 0.65, "wood", "stretch");
    footprint(-6.4, 2.0, 3.1, 0.8, "stretch");
    for (const x of [-7.6, -5.2])
      box(x, 0.27, 2, 0.09, 0.5, 0.5, "brass", "stretch");
    for (let i = 0; i < 4; i++)
      box(-7.3 + i * 0.58, 0.75, 2, 0.5, 0.2, 0.36, "cream", "stretch");
    sofa(-5.8, 4.45, 2.4, "stretch", "blue");
    box(-7.4, 0.52, 3.5, 0.65, 1.0, 0.65, "cream", "stretch");
    cylinder(-7.4, 1.19, 3.5, 0.19, 0.3, "glass", "stretch");
    footprint(-7.4, 3.5, 0.75, 0.75, "stretch");
  }

  if (kind === "shop") {
    const rack = (x, z, width) => {
      box(x, 1.9, z, width, 0.055, 0.06, "brass", "browse");
      for (const dx of [-width / 2, width / 2]) {
        box(x + dx, 0.98, z, 0.06, 1.95, 0.06, "brass", "browse");
        box(x + dx, 0.05, z, 0.5, 0.08, 0.65, "wood", "browse");
      }
      for (let i = 0; i < 7; i++) {
        const px = x - width * 0.4 + i * width * 0.133;
        box(
          px,
          1.45,
          z,
          0.26,
          0.65,
          0.12,
          ["olive", "ochre", "blue", "cream"][i % 4],
          "browse",
        );
        box(
          px,
          1.75,
          z,
          0.43,
          0.13,
          0.12,
          ["olive", "ochre", "blue", "cream"][i % 4],
          "browse",
        );
        cylinder(px, 1.9, z, 0.025, 0.16, "brass", "browse");
      }
      footprint(x, z, width + 0.2, 0.7, "browse");
    };
    rack(-5.4, -1.3, 3.6);
    rack(-5.4, 2.5, 3.6);
    for (const x of [-6.5, -3.9, -1.3]) {
      box(x, 1.4, -6.3, 2.05, 2.8, 0.65, "wood", "browse");
      for (let shelf = 0; shelf < 3; shelf++) {
        box(
          x,
          0.42 + shelf * 0.78,
          -5.85,
          1.85,
          0.055,
          0.45,
          "cream",
          "browse",
        );
        for (let i = 0; i < 5; i++)
          cylinder(
            x - 0.65 + i * 0.32,
            0.6 + shelf * 0.78,
            -5.83,
            0.095,
            0.3,
            ["blue", "olive", "ochre"][i % 3],
            "browse",
            0.06,
          );
      }
      footprint(x, -6.3, 2.2, 0.85, "browse");
    }
    for (const x of [4.1, 6.8]) {
      plane(x, 1.55, -5.8, 2.45, 2.9, "cream", "try-on");
      box(x, 1.6, -5.7, 1.25, 2.3, 0.08, "brass", "try-on");
      plane(x, 1.6, -5.65, 1.12, 2.16, "glass", "try-on");
      box(x - 0.3, 1.9, -5.62, 0.018, 0.85, 0.01, "cream", "try-on", 0.35);
      box(x + 0.3, 1.3, -5.62, 0.018, 0.6, 0.01, "cream", "try-on", 0.35);
      box(x + 1.2, 1.45, -4.4, 0.07, 2.85, 2.7, "wood", "try-on");
      box(x, 2.95, -3.1, 2.45, 0.08, 0.08, "brass", "try-on");
      for (let i = 0; i < 7; i++)
        box(
          x - 0.95 + i * 0.32,
          1.65,
          -3.1,
          0.3,
          2.5,
          0.08,
          "fabric",
          "try-on",
        );
      box(x, 0.5, -4.8, 0.85, 0.15, 0.55, "wood", "try-on");
      footprint(x, -4.4, 2.45, 2.75, "try-on");
    }
    sign("FITTING", 5.5, 3.2, -3.0, 2.0, "try-on");
    box(5.6, 0.62, 2.8, 3.3, 1.24, 1.1, "wood", "counter");
    box(5.6, 1.3, 2.8, 3.45, 0.12, 1.25, "cream", "counter");
    box(5.6, 1.55, 2.8, 0.65, 0.44, 0.4, "dark", "counter");
    box(5.6, 1.66, 3.05, 0.47, 0.22, 0.025, "blue", "counter");
    box(6.7, 1.53, 2.8, 0.4, 0.4, 0.32, "ochre", "counter");
    footprint(5.6, 2.8, 3.6, 1.3, "counter");
    chair(-0.65, 4.2, "browse", 0, "lilac");
    chair(1.25, 4.2, "browse", 0, "fabric");
    cylinder(0.3, 0.5, 4.2, 0.38, 0.12, "cream", "browse");
    cylinder(0.3, 0.27, 4.2, 0.1, 0.45, "blue", "browse");
    footprint(0.3, 4.2, 0.8, 0.8, "browse");
    plant(1.1, -5.6);
  }

  if (kind === "museum") {
    for (const [x, width, height] of [
      [-5.1, 3.2, 1.8],
      [-1.3, 2.4, 1.5],
    ]) {
      box(x, 2.0, -6.75, width + 0.22, height + 0.22, 0.12, "wood", "gallery");
      plane(x, 2.0, -6.66, width, height, "art", "gallery");
      box(x, 0.94, -6.58, 0.42, 0.025, 0.04, "brass", "gallery");
    }
    box(4.8, 1.8, -6.7, 4.2, 2.7, 0.13, "wood", "tiles");
    plane(4.8, 1.8, -6.61, 3.96, 2.48, "tiles", "tiles");
    sign("AZULEJO · ORIGINAL STUDY", 4.8, 0.4, -6.57, 3.2, "tiles");
    for (const [x, z, shape] of [
      [-4.8, 0.1, 0],
      [-0.5, -2.1, 1],
      [4.4, -0.4, 2],
    ]) {
      box(
        x,
        0.63,
        z,
        1.1,
        1.25,
        1.1,
        "cream",
        shape === 2 ? "tiles" : "gallery",
      );
      const zone = shape === 2 ? "tiles" : "gallery";
      if (shape === 0) {
        cylinder(x, 1.63, z, 0.29, 0.62, "blue", zone, 0.17);
        cylinder(x, 2.02, z, 0.14, 0.18, "blue", zone, 0.12);
      } else if (shape === 1) {
        add(
          transform(
            new THREE.TorusGeometry(0.35, 0.1, 8, 20),
            x,
            1.83,
            z,
            0,
            0.4,
          ),
          "brass",
          zone,
        );
      } else {
        box(x, 1.78, z, 0.65, 0.8, 0.17, "blue", zone, 0.45);
        box(x, 1.78, z, 0.65, 0.8, 0.08, "cream", zone, -0.4);
      }
      footprint(x, z, 1.2, 1.2, zone);
    }
    box(4.9, 0.54, 2.7, 3.5, 0.2, 0.9, "wood", "bench");
    for (const x of [3.5, 6.3])
      box(x, 0.24, 2.7, 0.12, 0.5, 0.65, "brass", "bench");
    box(4.9, 0.68, 2.7, 3.1, 0.12, 0.72, "olive", "bench");
    books(4.1, 0.98, 2.6, "bench", 6);
    footprint(4.9, 2.7, 3.7, 1.0, "bench");
    sign("LOOK CLOSER", -4.8, 0.77, 0.68, 1.3, "gallery");
    sofa(-5.3, 3.9, 2.5, "bench", "lilac");
    cylinder(-5.3, 0.5, 2.35, 0.48, 0.12, "cream", "bench");
    cylinder(-5.3, 0.25, 2.35, 0.17, 0.45, "blue", "bench");
    books(-5.5, 0.75, 2.35, "bench", 3);
    footprint(-5.3, 2.35, 1.05, 1.05, "bench");
    plant(-7.8, -4.7);
    plant(7.8, -4.7);
  }

  if (kind === "bar") {
    box(-5.5, 0.12, -4.1, 4.7, 0.24, 4.3, "wood", "listen");
    plane(-5.5, 0.25, -4.1, 4.5, 4.1, "olive", "listen", -Math.PI / 2);
    for (const x of [-7.4, -3.6]) {
      box(x, 1.0, -5.45, 0.65, 1.5, 0.6, "dark", "listen");
      for (const y of [0.75, 1.35])
        sphere(x, y, -5.11, 0.23, 0.23, 0.02, "brass", "listen");
    }
    // Acoustic guitar: original body silhouette, neck, soundhole and strings.
    sphere(-6.0, 1.0, -4.6, 0.31, 0.41, 0.09, "ochre", "listen");
    sphere(-6.0, 1.37, -4.6, 0.25, 0.29, 0.085, "ochre", "listen");
    sphere(-6.0, 1.3, -4.49, 0.08, 0.08, 0.02, "dark", "listen");
    box(-6.0, 1.91, -4.6, 0.12, 0.9, 0.08, "wood", "listen");
    for (let i = 0; i < 4; i++)
      box(
        -6.035 + i * 0.024,
        1.6,
        -4.49,
        0.006,
        1.65,
        0.005,
        "brass",
        "listen",
      );
    cylinder(-4.7, 1.17, -3.9, 0.026, 1.85, "brass", "listen");
    cylinder(-4.7, 0.3, -3.9, 0.26, 0.055, "dark", "listen");
    box(-4.7, 2.1, -3.9, 0.18, 0.07, 0.09, "dark", "listen");
    box(-6.8, 0.94, -3.2, 0.65, 1.34, 0.64, "ochre", "listen");
    box(-6.8, 1.65, -3.2, 0.66, 0.08, 0.65, "cream", "listen");
    footprint(-5.5, -4.1, 4.8, 4.4, "listen");
    box(4.3, 0.68, -4.7, 5.3, 1.36, 1.25, "wood", "counter");
    box(4.3, 1.42, -4.7, 5.5, 0.12, 1.45, "brass", "counter");
    plane(4.3, 0.73, -4.05, 4.9, 1.15, "tiles", "counter");
    for (const y of [1.75, 2.35]) {
      box(4.3, y, -6.4, 5.2, 0.08, 0.34, "wood", "counter");
      for (let i = 0; i < 10; i++) {
        const x = 2.15 + i * 0.47;
        cylinder(
          x,
          y + 0.19,
          -6.4,
          0.07,
          0.3 + (i % 2) * 0.09,
          i % 2 ? "olive" : "blue",
          "counter",
          0.055,
        );
        cylinder(x, y + 0.39, -6.4, 0.031, 0.12, "brass", "counter");
      }
    }
    for (const x of [2.6, 4.3, 6.0]) {
      stool(x, -2.8, "counter");
      cup(x, 1.55, -4.1, "counter");
    }
    footprint(4.3, -4.7, 5.5, 1.5, "counter");
    sofa(4.4, 3.4, 3.6, "lounge", "olive");
    sofa(-5.6, 2.7, 3.0, "lounge", "blue");
    cylinder(4.4, 0.58, 1.7, 0.7, 0.09, "wood", "lounge");
    cylinder(4.4, 0.29, 1.7, 0.09, 0.55, "brass", "lounge");
    footprint(4.4, 1.7, 1.45, 1.45, "lounge");
    cup(4.1, 0.75, 1.7, "lounge");
    cup(4.7, 0.75, 1.75, "lounge");
    chair(-1.8, 3.5, "lounge", 0, "fabric");
    chair(-0.8, 1.45, "lounge", Math.PI, "olive");
    cylinder(-1.8, 0.51, 2.05, 0.47, 0.11, "cream", "lounge");
    cylinder(-1.8, 0.27, 2.05, 0.13, 0.45, "blue", "lounge");
    footprint(-1.8, 2.05, 1.0, 1.0, "lounge");
    sign("LIVE MUSIC", -5.5, 2.7, -6.8, 3.5, "listen");
  }

  for (const { material, zone, parts } of buckets.values()) {
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, mats[material]);
    mesh.name = `${kind} ${zone || "room"} ${material}`;
    mesh.userData.zone = zone;
    mesh.userData.roomGround = material === "floor";
    mesh.castShadow = material !== "glass";
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const focusMaterial = new THREE.MeshStandardMaterial({
    color: "#2456d8",
    emissive: "#2456d8",
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const focusRing = new THREE.Mesh(
    new THREE.RingGeometry(0.56, 0.68, 32),
    focusMaterial,
  );
  focusRing.rotation.x = -Math.PI / 2;
  focusRing.position.y = 0.026;
  focusRing.visible = false;
  focusRing.userData.interiorFocus = true;
  group.add(focusRing);

  const people = {
    home: [
      {
        name: "Your Lisbon host",
        bodyType: "female",
        x: 5.6,
        z: -3.2,
        zone: "kitchen",
        style: "casual",
        shirt: "#2456d8",
        hairStyle: "bun",
      },
    ],
    cafe: [
      {
        name: "Barista",
        bodyType: "male",
        x: 1.8,
        z: -5.9,
        zone: "espresso",
        style: "jacket",
        shirt: "#2456d8",
        hairStyle: "short",
      },
      {
        name: "Café guest",
        bodyType: "female",
        x: -2.1,
        z: 2.4,
        zone: "table",
        style: "tourist",
        shirt: "#f6a394",
        hairStyle: "bob",
      },
    ],
    gym: [
      {
        name: "Studio trainer",
        bodyType: "male",
        x: 0.5,
        z: 0.3,
        zone: "weights",
        style: "casual",
        shirt: "#8ac9b4",
        hairStyle: "short",
      },
      {
        name: "Runner",
        bodyType: "female",
        x: -4.5,
        z: -3.5,
        y: 0.385,
        zone: "treadmill",
        style: "casual",
        shirt,
        hairStyle: "bun",
        walking: true,
      },
    ],
    shop: [
      {
        name: "Shopkeeper",
        bodyType: "female",
        x: 5.3,
        z: 1.7,
        zone: "counter",
        style: "jacket",
        shirt: "#d4c4ee",
        hairStyle: "curly",
      },
      {
        name: "Browsing guest",
        bodyType: "male",
        x: -3.1,
        z: -2.9,
        zone: "browse",
        style: "tourist",
        shirt: "#2456d8",
        hairStyle: "bob",
      },
    ],
    museum: [
      {
        name: "Gallery guide",
        bodyType: "female",
        x: 1.4,
        z: -4.2,
        zone: "gallery",
        style: "jacket",
        shirt: "#2456d8",
        hairStyle: "bun",
      },
      {
        name: "Art visitor",
        bodyType: "male",
        x: -6.6,
        z: -2.5,
        zone: "tiles",
        style: "tourist",
        shirt: "#f6a394",
        hairStyle: "curly",
      },
    ],
    bar: [
      {
        name: "Bartender",
        bodyType: "male",
        x: 4.2,
        z: -5.95,
        zone: "counter",
        style: "jacket",
        shirt: "#b9e5d3",
        hairStyle: "short",
      },
      {
        name: "Musician",
        bodyType: "female",
        x: -4.7,
        z: -4.7,
        y: 0.26,
        zone: "listen",
        style: "casual",
        shirt: "#f6a394",
        hairStyle: "curly",
      },
    ],
  }[kind];
  const addedLocals = {
    home: [["Neighbour", 3.2, 3.0, "rest", "#d4c4ee"]],
    cafe: [
      ["Coffee regular", -7.0, 3.2, "table", "#d4c4ee"],
      ["Lisbon explorer", 6.7, 1.1, "table", "#b9e5d3"],
    ],
    gym: [
      ["Studio regular", -4.1, 3.35, "stretch", "#f6a394"],
      ["Gym neighbour", 7.2, 4.55, "stretch", "#d4c4ee"],
    ],
    shop: [
      ["Design browser", -7.4, 0.5, "browse", "#f6a394"],
      ["Local shopper", 1.4, 1.4, "browse", "#b9e5d3"],
    ],
    museum: [
      ["Art enthusiast", -7.0, 2.7, "gallery", "#2456d8"],
      ["Gallery neighbour", 6.9, 0.8, "tiles", "#d4c4ee"],
    ],
    bar: [
      ["Music regular", 0.35, 0.65, "lounge", "#d4c4ee"],
      ["Night-out guest", 6.9, 1.5, "lounge", "#f6a394"],
    ],
  }[kind];
  addedLocals.forEach(([name, x, z, zone, top], i) => {
    people.push({
      name,
      x,
      z,
      zone,
      shirt: top,
      compact: true,
      bodyType: i ? "male" : "female",
      style: "casual",
      hairStyle: i ? "curly" : "bob",
    });
  });
  const residents = people.map((person, i) => {
    let resident = createCharacter({
      ...person,
      skin: i ? "#9d684b" : "#bb8b68",
      trousers: "#35494a",
      phase: i * 2.1,
    });
    if (person.compact) resident = compactScenicResident(resident);
    resident.position.set(person.x, person.y || 0.012, person.z);
    resident.rotation.y =
      kind === "gym" && person.walking ? Math.PI : -0.2 + i * 0.45;
    resident.name = person.name;
    resident.userData.npc = {
      name: person.name,
      zone: person.zone,
      simulated: true,
    };
    resident.userData.zone = person.zone;
    resident.traverse((node) => {
      if (node.isMesh) node.userData.zone = person.zone;
    });
    footprint(person.x, person.z, 0.58, 0.58, person.zone);
    group.add(resident);
    return resident;
  });
  group.userData.room = {
    kind,
    width: 18,
    depth: 14,
    bounds: { minX: -8.55, maxX: 8.55, minZ: -6.5, maxZ: 6.4 },
    obstacles,
    approximate: true,
  };
  group.userData.zones = zones;
  let poseTime = 0;
  const update = (time, dt, motion, activeZoneId) => {
    if (motion && Number.isFinite(dt))
      poseTime += THREE.MathUtils.clamp(dt, 0, 0.1);
    residents.forEach((resident, i) => {
      animateCharacter(
        resident,
        poseTime + i * 0.2,
        Boolean(motion && people[i].walking),
      );
      if (resident.userData.scenicHead)
        resident.userData.scenicHead.rotation.y =
          Math.sin(poseTime * 0.48 + i * 2.1) * 0.065;
      if (activeZoneId === people[i].zone && resident.userData.rig) {
        resident.userData.rig.rightArm.rotation.x = -0.35;
        resident.userData.rig.rightElbow.rotation.x = -0.7;
      }
    });
    const zone = zones.find((item) => item.id === activeZoneId);
    focusRing.visible = Boolean(zone);
    if (zone) {
      focusRing.position.set(zone.target.x, 0.026, zone.target.z);
      focusRing.scale.setScalar(
        motion ? 1 + Math.sin(poseTime * 2) * 0.035 : 1,
      );
    }
  };
  return withInteriorLighting(
    {
      group,
      spawn,
      zones,
      residents,
      update,
      bounds: group.userData.room.bounds,
      obstacles,
    },
    kind,
    reducedMotion,
    mats.glow,
  );
}
