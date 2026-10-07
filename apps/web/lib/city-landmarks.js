import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Original, deliberately stylized architecture. The geographic rings and component
// positions are the bundled OSM geometry; ornamental dimensions are approximations.
// Architectural references: Visit Lisboa (Rua Augusta arch / Belém tower),
// Parques de Sintra (the two palaces). No reference models or textures are copied.
const ARCH = 41683195;
const CATHEDRAL = 19372558; // The nearby apartment building shares the name "Sé".
const BELEM = 24341353;
const SINTRA = 1633002;
const CHIMNEYS = new Set([172718755, 172718756]);
// Pena's OSM building parts are unnamed in the extract. These exact component IDs
// form the palace beside the independently mapped visitor hotspot 612095421.
const PENA_PARTS = new Set([
  118487632, 118487635, 118487642, 118487644, 389974171, 389974172, 389974173,
  389974174, 389974175, 389976616, 389976617, 389976618, 389976619, 389976620,
  390123985, 390123990, 390175388, 5877463, 390376662, 390382846, 390566115,
]);
const PENA_RED = new Set([
  389974173, 389974174, 389976616, 389976617, 389976618, 389976619, 389976620,
]);
const PENA_ROUND = new Set([
  118487632, 118487642, 389976619, 389976620, 390123990,
]);
const REPLACED = new Set([
  ARCH,
  CATHEDRAL,
  BELEM,
  SINTRA,
  ...CHIMNEYS,
  ...PENA_PARTS,
]);
const colors = {
  stone: "#e8d8b9",
  light: "#fff1d6",
  shade: "#b7a180",
  roof: "#b65843",
  white: "#f6eee0",
  glass: "#36565c",
  yellow: "#eeb94e",
  red: "#bd5443",
  blue: "#648b96",
};

/** Only exclude a generic footprint when this module renders that exact object. */
export function isLandmarkBuilding(building) {
  return REPLACED.has(Number(building.id)) && validRing(building.ring);
}

function validRing(ring) {
  return (
    Array.isArray(ring) &&
    ring.length >= 4 &&
    ring.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]),
    )
  );
}

function openRing(building, projectGeo) {
  const ps = building.ring.map((p) => {
    const q = projectGeo(p);
    return { x: q.x, z: q.z };
  });
  if (ps[0].x === ps.at(-1).x && ps[0].z === ps.at(-1).z) ps.pop();
  return ps;
}

// Minimum-area rectangle follows the mapped building's orientation rather than
// imposing the same compass alignment on every monument.
function footprintFrame(building, projectGeo, geoY, mode = "wide") {
  const ring = openRing(building, projectGeo);
  let best;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.03) continue;
    const angle = Math.atan2(b.z - a.z, b.x - a.x),
      c = Math.cos(angle),
      s = Math.sin(angle);
    const xs = ring.map((p) => p.x * c + p.z * s);
    const zs = ring.map((p) => -p.x * s + p.z * c);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    const area = (maxX - minX) * (maxZ - minZ);
    if (!best || area < best.area)
      best = { angle, minX, maxX, minZ, maxZ, area };
  }
  if (!best) return null;
  let angle = best.angle;
  const width = best.maxX - best.minX,
    depth = best.maxZ - best.minZ;
  if (
    (mode === "wide" && width < depth) ||
    (["deep", "river"].includes(mode) && width > depth)
  )
    angle += Math.PI / 2;
  // The cathedral's principal entrance faces west; Belém's bastion faces the river.
  if (mode === "deep" && -Math.sin(angle) > 0) angle += Math.PI;
  if (mode === "river" && Math.cos(angle) < 0) angle += Math.PI;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const xs = ring.map((p) => p.x * c + p.z * s),
    zs = ring.map((p) => -p.x * s + p.z * c);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const levels = building.ring.map(geoY).filter(Number.isFinite);
  const base = Math.max(0, ...levels) + 0.12,
    low = Math.min(base, ...levels);
  return {
    x: cx * c - cz * s,
    z: cx * s + cz * c,
    base,
    low,
    angle,
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
    ring: ring.map((p) => ({
      x: p.x * c + p.z * s - cx,
      z: -p.x * s + p.z * c - cz,
    })),
  };
}

function builder(frame, name, osmIds) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(frame.x, frame.base, frame.z);
  group.rotation.y = -frame.angle;
  group.userData = {
    landmark: true,
    name,
    osmIds,
    approximateArchitecture: true,
  };
  const buckets = new Map();
  function add(geometry, color, x = 0, y = 0, z = 0, yaw = 0, pitch = 0) {
    geometry.rotateX(pitch);
    geometry.rotateY(yaw);
    geometry.translate(x, y, z);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    for (const attribute of Object.keys(flat.attributes))
      if (!["position", "normal"].includes(attribute))
        flat.deleteAttribute(attribute);
    flat.clearGroups();
    if (!flat.attributes.normal) flat.computeVertexNormals();
    if (!buckets.has(color)) buckets.set(color, []);
    buckets.get(color).push(flat);
  }
  return {
    group,
    add,
    box: (w, h, d, color, x = 0, y = h / 2, z = 0, yaw = 0) =>
      add(new THREE.BoxGeometry(w, h, d), color, x, y, z, yaw),
    cylinder: (top, bottom, h, color, x, y, z, segments = 12) =>
      add(new THREE.CylinderGeometry(top, bottom, h, segments), color, x, y, z),
    finish() {
      for (const [color, geometries] of buckets) {
        const merged = mergeGeometries(geometries, false);
        geometries.forEach((g) => g.dispose());
        if (!merged) continue;
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.84,
          metalness: 0.01,
        });
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `${name} ${color}`;
        group.add(mesh);
      }
      buckets.clear();
      return group;
    },
  };
}

function ringShape(ring) {
  const shape = new THREE.Shape();
  ring.forEach((p, i) =>
    i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z),
  );
  shape.closePath();
  return shape;
}

function footprint(b, frame, height, color, roofColor) {
  const basement = frame.base - frame.low;
  const geometry = new THREE.ExtrudeGeometry(ringShape(frame.ring), {
    depth: height + basement,
    steps: 1,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  b.add(geometry, color, 0, -basement, 0);
  if (roofColor) {
    const roof = new THREE.ShapeGeometry(ringShape(frame.ring));
    roof.rotateX(-Math.PI / 2);
    b.add(roof, roofColor, 0, height + 0.04, 0);
  }
}

function archShape(width, height) {
  const r = width / 2,
    spring = height - r;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, spring);
  shape.absarc(0, spring, r, 0, Math.PI, false);
  shape.closePath();
  return shape;
}

function panel(b, w, h, color, x, y, z, yaw = 0) {
  const g = new THREE.ExtrudeGeometry(archShape(w, h), {
    depth: 0.14,
    bevelEnabled: false,
    steps: 1,
  });
  g.translate(0, 0, -0.07);
  b.add(g, color, x, y, z, yaw);
}

function roseWindow(b, radius, x, y, z, yaw = 0) {
  b.add(new THREE.CircleGeometry(radius, 24), colors.glass, x, y, z, yaw);
  b.add(
    new THREE.TorusGeometry(radius, radius * 0.12, 6, 24),
    colors.light,
    x,
    y,
    z + 0.12,
    yaw,
  );
  for (let i = 0; i < 8; i++) {
    const g = new THREE.BoxGeometry(radius * 1.75, 0.1, 0.12);
    g.rotateZ((i * Math.PI) / 8);
    b.add(g, colors.light, x, y, z + 0.15, yaw);
  }
  b.add(
    new THREE.TorusGeometry(radius * 0.3, 0.08, 4, 16),
    colors.light,
    x,
    y,
    z + 0.18,
    yaw,
  );
}

function gable(b, width, depth, rise, color, x, roofY, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, rise);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false,
  });
  g.translate(0, 0, -depth / 2);
  b.add(g, color, x, roofY, z);
}

function crenellations(b, width, depth, y, color, x = 0, z = 0, size = 0.9) {
  const countX = Math.max(2, Math.floor(width / (size * 2.2)));
  const countZ = Math.max(2, Math.floor(depth / (size * 2.2)));
  for (let i = 0; i <= countX; i++)
    for (const side of [-1, 1])
      b.box(
        size,
        1.2,
        size,
        color,
        x - width / 2 + (width * i) / countX,
        y + 0.6,
        z + (side * depth) / 2,
      );
  for (let i = 1; i < countZ; i++)
    for (const side of [-1, 1])
      b.box(
        size,
        1.2,
        size,
        color,
        x + (side * width) / 2,
        y + 0.6,
        z - depth / 2 + (depth * i) / countZ,
      );
}

function edgeWindows(b, frame, height, color = colors.glass, limit = 64) {
  let added = 0;
  for (let i = 0; i < frame.ring.length && added < limit; i++) {
    const a = frame.ring[i],
      c = frame.ring[(i + 1) % frame.ring.length];
    const dx = c.x - a.x,
      dz = c.z - a.z,
      length = Math.hypot(dx, dz);
    if (length < 6) continue;
    const n = Math.min(8, Math.floor(length / 4.3)),
      yaw = -Math.atan2(dz, dx);
    for (let j = 0; j < n && added < limit; j++) {
      const t = (j + 0.5) / n,
        x = a.x + dx * t,
        z = a.z + dz * t;
      // Both sides of a polygon facade are visible in this simple original model;
      // shallow panels sit at the wall surface and never need texture downloads.
      panel(b, 1.15, 2.25, color, x, Math.max(2, height - 4.1), z, yaw);
      b.box(
        1.6,
        0.18,
        0.38,
        colors.light,
        x,
        Math.max(2, height - 4.1) - 0.1,
        z,
        yaw,
      );
      added++;
    }
  }
}

function statue(b, x, y, z, size = 1) {
  b.box(
    1.1 * size,
    0.5 * size,
    1.1 * size,
    colors.light,
    x,
    y + 0.25 * size,
    z,
  );
  b.cylinder(
    0.36 * size,
    0.62 * size,
    1.8 * size,
    colors.light,
    x,
    y + 1.4 * size,
    z,
    7,
  );
  b.add(
    new THREE.IcosahedronGeometry(0.39 * size, 1),
    colors.light,
    x,
    y + 2.55 * size,
    z,
  );
  for (const side of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(
      0.14 * size,
      0.2 * size,
      1.4 * size,
      6,
    );
    arm.rotateZ(side * 0.35);
    b.add(arm, colors.light, x + side * 0.55 * size, y + 1.8 * size, z);
  }
}

function ruaAugusta(building, projectGeo, geoY) {
  const f = footprintFrame(building, projectGeo, geoY);
  if (!f) return null;
  const b = builder(f, "Arco da Rua Augusta", [building.id]);
  const w = f.width * 0.96,
    d = Math.min(f.depth * 0.7, 7.5),
    h = 21.7;
  const r = Math.min(4.7, w * 0.23),
    spring = 7.5;
  // This is a true passage cut into the wall silhouette, not a dark painted door.
  const wall = new THREE.Shape();
  wall.moveTo(-w / 2, 0);
  wall.lineTo(-w / 2, h);
  wall.lineTo(w / 2, h);
  wall.lineTo(w / 2, 0);
  wall.lineTo(r, 0);
  wall.lineTo(r, spring);
  wall.absarc(0, spring, r, 0, Math.PI, false);
  wall.lineTo(-r, 0);
  wall.closePath();
  const g = new THREE.ExtrudeGeometry(wall, {
    depth: d,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 18,
  });
  g.translate(0, 0, -d / 2);
  b.add(g, colors.stone);
  for (const side of [-1, 1]) {
    b.box(w, 0.7, d + 0.8, colors.light, 0, 14.1, side * 0.03);
    for (const x of [-w * 0.39, -w * 0.29, w * 0.29, w * 0.39]) {
      b.cylinder(0.46, 0.54, 11.7, colors.light, x, 6.7, side * (d / 2 + 0.1));
      b.box(1.2, 0.65, 1.1, colors.light, x, 12.65, side * (d / 2 + 0.1));
      b.box(1.25, 0.8, 1.15, colors.light, x, 0.6, side * (d / 2 + 0.1));
    }
    for (const x of [-w * 0.34, w * 0.34])
      statue(b, x, 14.5, side * (d / 2 + 0.55), 1.0);
  }
  b.box(w + 0.8, 0.8, d + 1.0, colors.light, 0, h + 0.2, 0);
  b.box(w * 0.82, 2.25, d * 0.93, colors.stone, 0, h + 1.7, 0);
  statue(b, 0, h + 3, 0, 1.4);
  statue(b, -w * 0.21, h + 2.6, 0, 1.1);
  statue(b, w * 0.21, h + 2.6, 0, 1.1);
  const ring = new THREE.TorusGeometry(r + 0.32, 0.3, 6, 32, Math.PI);
  b.add(ring, colors.light, 0, spring, d / 2 + 0.12);
  b.add(new THREE.CircleGeometry(1.5, 24), colors.glass, 0, 18, d / 2 + 0.08);
  b.add(
    new THREE.TorusGeometry(1.52, 0.15, 6, 24),
    colors.light,
    0,
    18,
    d / 2 + 0.12,
  );
  b.box(0.09, 1.0, 0.05, colors.light, 0, 18.3, d / 2 + 0.18);
  b.box(0.8, 0.09, 0.05, colors.light, 0.25, 18, d / 2 + 0.18);
  return b.finish();
}

function cathedral(building, projectGeo, geoY) {
  const f = footprintFrame(building, projectGeo, geoY, "deep");
  if (!f) return null;
  const b = builder(f, "Sé de Lisboa", [building.id]);
  footprint(b, f, 9.8, colors.stone, colors.roof);
  edgeWindows(b, f, 9.8, colors.glass, 48);
  const w = Math.min(31, f.width * 0.72),
    naveW = w * 0.57;
  const naveD = Math.min(57, f.depth * 0.55),
    front = f.depth / 2 - 2.8;
  const z = front - naveD / 2;
  b.box(naveW, 9.8, naveD, colors.stone, 0, 14.7, z);
  gable(b, naveW + 0.7, naveD + 0.5, 4.2, colors.roof, 0, 19.6, z);
  const towerW = w * 0.26,
    towerD = Math.min(12, f.depth * 0.12);
  for (const side of [-1, 1]) {
    const x = (side * (w - towerW)) / 2,
      tz = front - towerD / 2;
    b.box(towerW, 28, towerD, colors.stone, x, 14, tz);
    for (const y of [10.8, 21.0, 27.3])
      b.box(towerW + 0.5, 0.4, towerD + 0.5, colors.light, x, y, tz);
    for (const dx of [-towerW * 0.19, towerW * 0.19])
      panel(b, towerW * 0.22, 4.0, colors.glass, x + dx, 21.5, front + 0.12);
    crenellations(b, towerW, towerD, 28, colors.light, x, tz, 1.0);
    for (const dz of [-towerD / 2, towerD / 2])
      b.box(0.7, 27, 0.7, colors.light, x + (side * towerW) / 2, 13.5, tz + dz);
  }
  b.box(w * 0.56, 19.5, 1.4, colors.stone, 0, 9.75, front - 0.25);
  panel(b, 4.4, 7.0, colors.shade, 0, 0.2, front + 0.55);
  panel(b, 3.4, 6.1, colors.glass, 0, 0.2, front + 0.72);
  roseWindow(b, 2.8, 0, 14.3, front + 0.62);
  b.box(w * 0.59, 0.5, 1.8, colors.light, 0, 19.7, front - 0.25);
  return b.finish();
}

function belem(building, projectGeo, geoY) {
  const f = footprintFrame(building, projectGeo, geoY, "river");
  if (!f) return null;
  const b = builder(f, "Torre de Belém", [building.id]);
  footprint(b, f, 6.4, colors.stone, colors.light);
  const towerW = Math.min(14.2, f.width * 0.54),
    towerD = Math.min(14, f.depth * 0.45);
  const z = -f.depth * 0.17;
  b.box(towerW, 29, towerD, colors.stone, 0, 14.5, z);
  for (const y of [7.0, 13.7, 20.2, 27.8])
    b.box(towerW + 0.8, 0.55, towerD + 0.8, colors.light, 0, y, z);
  for (const y of [9.1, 15.7, 22.1])
    for (const x of [-towerW * 0.27, 0, towerW * 0.27]) {
      panel(b, 1.5, 2.9, colors.shade, x, y, z + towerD / 2 + 0.08);
      panel(b, 1.0, 2.45, colors.glass, x, y + 0.15, z + towerD / 2 + 0.17);
    }
  b.box(towerW * 0.72, 0.4, 1.8, colors.light, 0, 13.5, z + towerD / 2 + 0.5);
  for (let i = -2; i <= 2; i++)
    b.cylinder(
      0.13,
      0.13,
      1.15,
      colors.light,
      i * towerW * 0.14,
      14.25,
      z + towerD / 2 + 1.15,
      6,
    );
  b.box(
    towerW * 0.77,
    0.25,
    0.35,
    colors.light,
    0,
    14.9,
    z + towerD / 2 + 1.15,
  );
  crenellations(b, towerW, towerD, 29, colors.light, 0, z, 0.85);
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const x = side * (towerW / 2 - 0.8),
        tz = z + end * (towerD / 2 - 0.8);
      b.cylinder(1.25, 1.35, 5.2, colors.light, x, 28.2, tz);
      b.cylinder(0, 1.55, 2.4, colors.stone, x, 32.0, tz);
    }
  // The lower river bastion retains the mapped irregular outline.
  for (let i = 0; i < f.ring.length; i++) {
    const a = f.ring[i],
      c = f.ring[(i + 1) % f.ring.length];
    const length = Math.hypot(c.x - a.x, c.z - a.z);
    if (length < 3.5) continue;
    const n = Math.min(8, Math.ceil(length / 2.2));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      b.box(
        0.8,
        1.0,
        0.8,
        colors.light,
        a.x + (c.x - a.x) * t,
        6.9,
        a.z + (c.z - a.z) * t,
      );
    }
  }
  edgeWindows(b, f, 6.4, colors.shade, 20);
  return b.finish();
}

function sintraPalace(building, projectGeo, geoY) {
  const f = footprintFrame(building, projectGeo, geoY);
  if (!f) return null;
  const b = builder(f, "Palácio Nacional de Sintra", [building.id]);
  footprint(b, f, 10.6, colors.white, colors.roof);
  edgeWindows(b, f, 10.6, colors.glass, 64);
  // Roof ridges follow long original edges, and stay inward of their wall.
  for (let i = 0; i < f.ring.length; i++) {
    const a = f.ring[i],
      c = f.ring[(i + 1) % f.ring.length];
    const length = Math.hypot(c.x - a.x, c.z - a.z);
    if (length < 16 || length > 50) continue;
    const g = new THREE.CylinderGeometry(0, 1, 1, 4);
    g.rotateY(Math.PI / 4);
    g.scale(length * 0.66, 2.8, 3.6);
    b.add(
      g,
      colors.roof,
      (a.x + c.x) / 2,
      12.0,
      (a.z + c.z) / 2,
      -Math.atan2(c.z - a.z, c.x - a.x),
    );
  }
  return b.finish();
}

function sintraChimney(building, projectGeo, geoY) {
  const f = footprintFrame(building, projectGeo, geoY);
  if (!f) return null;
  const b = builder(f, "Sintra palace kitchen chimney", [building.id]);
  const radius = Math.min(f.width, f.depth) * 0.48;
  // Each chimney is placed at its actual separately mapped round OSM footprint.
  b.cylinder(radius, radius, 10.6, colors.white, 0, 5.3, 0, 20);
  b.cylinder(0.75, radius, 20.5, colors.white, 0, 20.85, 0, 20);
  b.cylinder(0.85, 0.85, 0.45, colors.light, 0, 31.3, 0, 16);
  b.add(
    new THREE.CircleGeometry(0.7, 16),
    colors.glass,
    0,
    31.54,
    0,
    0,
    -Math.PI / 2,
  );
  return b.finish();
}

function penaPart(building, projectGeo, geoY) {
  const f = footprintFrame(building, projectGeo, geoY);
  if (!f) return null;
  const color = PENA_RED.has(building.id) ? colors.red : colors.yellow;
  const b = builder(f, "Palácio da Pena", [building.id]);
  const height = Math.max(6.4, Math.min(20, building.height || 12));
  if (building.id === 390382846) {
    // This separately mapped entrance arch also has a real opening.
    const w = f.width * 0.94,
      d = Math.max(1.5, f.depth * 0.85),
      r = w * 0.25,
      spring = 4.8;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(-w / 2, 11);
    shape.lineTo(w / 2, 11);
    shape.lineTo(w / 2, 0);
    shape.lineTo(r, 0);
    shape.lineTo(r, spring);
    shape.absarc(0, spring, r, 0, Math.PI, false);
    shape.lineTo(-r, 0);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: d,
      steps: 1,
      bevelEnabled: false,
    });
    g.translate(0, 0, -d / 2);
    b.add(g, colors.yellow);
    crenellations(b, w, d, 11, colors.light, 0, 0, 0.7);
  } else if (PENA_ROUND.has(building.id)) {
    const radius = Math.min(f.width, f.depth) * 0.47;
    const h = building.id === 118487632 ? 24 : height + 2;
    b.cylinder(radius, radius * 1.03, h, color, 0, h / 2, 0, 18);
    b.cylinder(
      radius * 1.11,
      radius * 1.11,
      0.65,
      colors.light,
      0,
      h - 0.4,
      0,
      18,
    );
    if (building.id === 389976619 || building.id === 389976620)
      b.cylinder(
        0,
        radius * 1.08,
        radius * 1.2,
        colors.roof,
        0,
        h + radius * 0.6,
        0,
        18,
      );
    else {
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI * 2) / 10;
        b.box(
          0.65,
          1.1,
          0.65,
          colors.light,
          Math.cos(angle) * radius * 0.88,
          h + 0.55,
          Math.sin(angle) * radius * 0.88,
        );
      }
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      panel(
        b,
        Math.min(0.9, radius * 0.48),
        2.8,
        colors.glass,
        Math.sin(angle) * (radius + 0.02),
        h - 5.0,
        Math.cos(angle) * (radius + 0.02),
        angle,
      );
    }
  } else {
    footprint(b, f, height, color, colors.light);
    edgeWindows(b, f, height, colors.glass, 32);
    // Decorative battlements sit only on the original part boundary.
    for (let i = 0; i < f.ring.length; i++) {
      const a = f.ring[i],
        c = f.ring[(i + 1) % f.ring.length],
        length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 4.5) continue;
      const n = Math.min(7, Math.floor(length / 2.3));
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        b.box(
          0.7,
          0.85,
          0.7,
          colors.light,
          a.x + (c.x - a.x) * t,
          height + 0.42,
          a.z + (c.z - a.z) * t,
        );
      }
    }
    if (building.id === 390566115) {
      const w = f.width * 0.88,
        d = f.depth * 0.88;
      b.box(w, 4.2, d, colors.yellow, 0, height + 2.1, 0);
      gable(b, w + 0.4, d + 0.4, 3, colors.roof, 0, height + 4.2, 0);
      b.add(
        new THREE.CircleGeometry(0.75, 16),
        colors.glass,
        0,
        height + 2.0,
        d / 2 + 0.03,
      );
      b.add(
        new THREE.TorusGeometry(0.8, 0.08, 5, 16),
        colors.light,
        0,
        height + 2.0,
        d / 2 + 0.06,
      );
    }
  }
  return b.finish();
}

/** Returns an entirely owned/disposable group; no browser globals are required. */
export function createLandmarks(chunk, { projectGeo, geoY }) {
  const group = new THREE.Group();
  group.name = "Lisbon landmark architecture";
  group.userData.landmarkIds = [];
  group.userData.approximateArchitecture = true;
  group.userData.models = [];
  const buckets = new Map();
  for (const building of chunk.buildings || []) {
    if (!isLandmarkBuilding(building)) continue;
    const id = Number(building.id);
    const make =
      id === ARCH
        ? ruaAugusta
        : id === CATHEDRAL
          ? cathedral
          : id === BELEM
            ? belem
            : id === SINTRA
              ? sintraPalace
              : CHIMNEYS.has(id)
                ? sintraChimney
                : penaPart;
    const model = make(building, projectGeo, geoY);
    if (!model) continue;
    model.updateMatrixWorld(true);
    group.userData.models.push({
      name: model.name,
      osmId: id,
      position: model.position.toArray(),
    });
    model.traverse((object) => {
      if (!object.isMesh) return;
      const color = object.material.color.getHexString();
      if (!buckets.has(color)) buckets.set(color, []);
      object.geometry.applyMatrix4(object.matrixWorld);
      buckets.get(color).push(object.geometry);
      object.material.dispose();
    });
    group.userData.landmarkIds.push(id);
  }
  // Pena has many mapped parts, but all of them share these small color buckets.
  // The whole chunk therefore adds at most nine draw calls, not one per window.
  for (const [color, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((part) => part.dispose());
    if (!geometry) continue;
    const material = new THREE.MeshStandardMaterial({
      color: `#${color}`,
      roughness: 0.84,
      metalness: 0.01,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
