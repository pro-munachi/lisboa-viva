import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// These are original, illustrative storefront details for named OSM venues.
// The names/locations are sourced; facade signs and seating are not surveys.
const CELL = 64;
const STYLES = {
  cafe: {
    label: "CAFÉ",
    color: "#df513f",
    stripe: "#f27852",
    accent: "#ffc64e",
    glass: "#315c69",
    ink: "#ffffff",
  },
  restaurant: {
    label: "RESTAURANTE",
    color: "#b86028",
    stripe: "#ffc64e",
    accent: "#ef704f",
    glass: "#455d58",
    ink: "#ffffff",
  },
  bar: {
    label: "BAR",
    color: "#8150d5",
    stripe: "#bc72ee",
    accent: "#ed78bb",
    glass: "#333d68",
    ink: "#ffffff",
  },
  gym: {
    label: "GYM · FITNESS",
    color: "#356957",
    stripe: "#b7ed57",
    accent: "#b7ed57",
    glass: "#33586a",
    ink: "#ffffff",
  },
  shop: {
    label: "LOJA",
    color: "#3358db",
    stripe: "#61b6ef",
    accent: "#ffc64e",
    glass: "#335469",
    ink: "#ffffff",
  },
  culture: {
    label: "CULTURA",
    color: "#087d89",
    stripe: "#71c9c9",
    accent: "#ffc64e",
    glass: "#344c66",
    ink: "#ffffff",
  },
  beach: {
    label: "PRAIA",
    color: "#087d89",
    stripe: "#65dae0",
    accent: "#ffc64e",
    glass: "#344c66",
    ink: "#ffffff",
  },
};

function boundsOf(points) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    bounds[0] = Math.min(bounds[0], p.x);
    bounds[1] = Math.min(bounds[1], p.z);
    bounds[2] = Math.max(bounds[2], p.x);
    bounds[3] = Math.max(bounds[3], p.z);
  }
  return bounds;
}

function index() {
  const cells = new Map();
  return {
    add(item, bounds, padding) {
      for (
        let x = Math.floor((bounds[0] - padding) / CELL);
        x <= Math.floor((bounds[2] + padding) / CELL);
        x++
      )
        for (
          let z = Math.floor((bounds[1] - padding) / CELL);
          z <= Math.floor((bounds[3] + padding) / CELL);
          z++
        ) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(item);
        }
    },
    at(p) {
      return (
        cells.get(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`) || []
      );
    },
  };
}

function inside(p, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      result = !result;
  }
  return result;
}

function closest(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  const q = { x: a.x + dx * t, z: a.z + dz * t };
  return { ...q, t, distance: Math.hypot(p.x - q.x, p.z - q.z) };
}

function combine(parts) {
  const result = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return result;
}

function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function colored(geometry, value) {
  const color = new THREE.Color(value);
  const values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) {
    values[i] = color.r;
    values[i + 1] = color.g;
    values[i + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return geometry;
}

function cafeTable(category) {
  const style = STYLES[category] || STYLES.cafe;
  return combine([
    colored(
      new THREE.CylinderGeometry(0.48, 0.48, 0.07, 10).translate(0, 0.77, 0),
      "#fff0cb",
    ),
    colored(
      new THREE.CylinderGeometry(0.04, 0.06, 0.73, 6).translate(0, 0.37, 0),
      "#35485b",
    ),
    colored(
      new THREE.CylinderGeometry(0.25, 0.25, 0.055, 8).translate(0, 0.04, 0),
      "#35485b",
    ),
    ...[-0.77, 0.77].flatMap((x) => [
      colored(box(0.38, 0.045, 0.38, x, 0.46, 0), style.stripe),
      colored(box(0.38, 0.29, 0.045, x, 0.63, -0.18), style.color),
      ...[-0.14, 0.14].flatMap((dx) =>
        [-0.14, 0.14].map((z) =>
          colored(box(0.035, 0.43, 0.035, x + dx, 0.23, z), "#35485b"),
        ),
      ),
    ]),
  ]);
}

function beachFurniture() {
  const parts = [
    colored(
      new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6).translate(0, 1.15, 0),
      "#f5ead0",
    ),
    colored(
      new THREE.ConeGeometry(1.3, 0.65, 12).translate(0, 2.25, 0),
      "#65dae0",
    ),
    colored(
      new THREE.ConeGeometry(1.05, 0.3, 12).translate(0, 2.62, 0),
      "#ffc64e",
    ),
  ];
  for (const x of [-0.65, 0.65]) {
    parts.push(colored(box(0.48, 0.08, 1.2, x, 0.3, 0.15), "#fff0cb"));
    parts.push(
      colored(box(0.48, 0.58, 0.07, x, 0.59, -0.42).rotateX(-0.15), "#087d89"),
    );
    for (const z of [-0.25, 0.55])
      parts.push(colored(box(0.38, 0.26, 0.07, x, 0.17, z), "#db9b65"));
  }
  return combine(parts);
}

// Flush, shallow entry details stay on the chosen mapped facade. They make the
// category readable without adding freestanding objects in the walking corridor.
function entryGeometry(category, width, signY) {
  const style = STYLES[category] || STYLES.culture;
  const height = Math.max(0.95, Math.min(2.55, signY - 0.68));
  const parts = [];
  const part = (w, h, d, x, y, z, color) =>
    parts.push(colored(box(w, h, d, x, y, z), color));
  part(width, height, 0.04, 0, height / 2, 0.015, style.color);
  part(
    width - 0.22,
    height - 0.17,
    0.045,
    0,
    height / 2 + 0.01,
    0.05,
    style.glass,
  );
  for (const x of [-width / 2 + 0.065, width / 2 - 0.065])
    part(0.13, height + 0.12, 0.11, x, height / 2, 0.085, style.stripe);
  part(width + 0.06, 0.11, 0.11, 0, height + 0.025, 0.085, style.stripe);
  part(width, 0.18, 0.14, 0, 0.09, 0.08, "#f5ead0");
  part(
    0.09,
    height - 0.16,
    0.08,
    width * 0.1,
    height / 2 + 0.01,
    0.1,
    "#f5ead0",
  );
  part(
    0.045,
    0.23,
    0.05,
    width * 0.1 + 0.15,
    height * 0.43,
    0.17,
    style.accent,
  );

  if (category === "gym") {
    // A lime training stripe and a sculpted weight visible through the glazing.
    part(width - 0.3, 0.12, 0.05, 0, height * 0.75, 0.1, style.accent);
    part(
      width * 0.26,
      0.07,
      0.07,
      -width * 0.2,
      height * 0.45,
      0.13,
      "#dce3eb",
    );
    for (const x of [-width * 0.33, -width * 0.07])
      part(0.16, height * 0.34, 0.09, x, height * 0.45, 0.14, style.accent);
  } else if (category === "shop") {
    // Two original display pedestals and contrasting packages in the window.
    for (const [x, color] of [
      [-width * 0.3, style.accent],
      [-width * 0.08, "#ea78a3"],
    ]) {
      part(width * 0.13, 0.1, 0.08, x, height * 0.2, 0.13, "#f5ead0");
      part(width * 0.1, height * 0.23, 0.09, x, height * 0.36, 0.13, color);
    }
  } else if (category === "culture") {
    // A compact azulejo-inspired entry plinth, not a copy of any museum facade.
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 7; column++)
        part(
          width / 7 - 0.025,
          0.12,
          0.04,
          -width / 2 + ((column + 0.5) * width) / 7,
          0.27 + row * 0.14,
          0.1,
          (row + column) % 2 ? "#e6f3e3" : style.stripe,
        );
  } else if (category === "bar") {
    // Tall contrasting entry strips make evening venues recognizable by day.
    for (const x of [-width * 0.32, -width * 0.23])
      part(0.1, height * 0.67, 0.08, x, height * 0.55, 0.12, style.accent);
    part(width - 0.25, 0.12, 0.09, 0, height + 0.16, 0.11, style.accent);
  } else {
    part(width * 0.48, 0.32, 0.08, -width * 0.19, 0.33, 0.12, style.stripe);
    part(width * 0.42, 0.05, 0.09, -width * 0.19, 0.54, 0.14, "#f5ead0");
  }
  return combine(parts);
}

function categoryIcon(ctx, category, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#fff6e7";
  ctx.fillStyle = "#fff6e7";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  if (category === "beach") {
    ctx.beginPath();
    ctx.arc(0, 0, 14, Math.PI, 0);
    ctx.lineTo(-14, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, 13);
    ctx.moveTo(-13, 15);
    ctx.quadraticCurveTo(-6, 9, 0, 15);
    ctx.quadraticCurveTo(6, 21, 13, 15);
    ctx.stroke();
  } else if (category === "gym") {
    ctx.fillRect(-12, -2, 24, 4);
    for (const side of [-1, 1]) {
      ctx.fillRect(side * 10 - 3, -10, 6, 20);
      ctx.fillRect(side * 16 - 2, -7, 4, 14);
    }
  } else if (category === "cafe") {
    ctx.beginPath();
    ctx.roundRect(-11, -7, 19, 15, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, -1, 5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, 12);
    ctx.lineTo(12, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -16);
    ctx.quadraticCurveTo(-10, -13, -5, -10);
    ctx.stroke();
  } else if (category === "restaurant") {
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, -11);
    ctx.lineTo(-16, 12);
    ctx.moveTo(16, -11);
    ctx.lineTo(16, 12);
    ctx.stroke();
  } else if (category === "bar") {
    ctx.beginPath();
    ctx.moveTo(-12, -10);
    ctx.lineTo(12, -10);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(0, 13);
    ctx.moveTo(-7, 13);
    ctx.lineTo(7, 13);
    ctx.stroke();
  } else if (category === "shop") {
    ctx.beginPath();
    ctx.roundRect(-11, -5, 22, 19, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -5, 6, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-14, -7);
    ctx.lineTo(0, -15);
    ctx.lineTo(14, -7);
    ctx.closePath();
    ctx.stroke();
    for (const x of [-8, 0, 8]) {
      ctx.beginPath();
      ctx.moveTo(x, -3);
      ctx.lineTo(x, 11);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-13, 14);
    ctx.lineTo(13, 14);
    ctx.stroke();
  }
  ctx.restore();
}

function signAtlas(venues) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  venues.forEach((venue, slot) => {
    const style = STYLES[venue.category] || STYLES.culture;
    const x = (slot % 4) * 256,
      y = Math.floor(slot / 4) * 64;
    ctx.fillStyle = style.color;
    ctx.fillRect(x, y, 256, 64);
    ctx.fillStyle = style.stripe;
    ctx.fillRect(x + 47, y + 9, 2, 46);
    categoryIcon(ctx, venue.category, x + 24, y + 31);
    ctx.fillStyle = style.ink;
    ctx.font = "700 9px Arial";
    ctx.fillText(style.label, x + 58, y + 19);
    const name =
      venue.name.length > 30
        ? venue.name.slice(0, 29).trimEnd() + "…"
        : venue.name;
    let size = 15;
    while (size > 10) {
      ctx.font = `700 ${size}px Arial`;
      if (ctx.measureText(name).width < 185) break;
      size--;
    }
    ctx.fillText(name, x + 58, y + 42, 185);
    ctx.fillStyle = style.accent;
    ctx.fillRect(x + 58, y + 50, 55, 3);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
}

function signGeometry(width, height, slot) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.attributes.uv;
  const col = slot % 4,
    row = Math.floor(slot / 4);
  for (let i = 0; i < uv.count; i++) {
    // Half-pixel inset keeps adjacent atlas cells from bleeding into the sign.
    uv.setXY(
      i,
      (col * 256 + 0.5 + uv.getX(i) * 255) / 1024,
      1 - (row * 64 + 0.5 + (1 - uv.getY(i)) * 63) / 512,
    );
  }
  return geometry;
}

function awningMaterial(category) {
  const style = STYLES[category] || STYLES.culture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eee1c7";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = style.stripe;
  for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    side: THREE.DoubleSide,
  });
}

function awningGeometry(width, height) {
  const g = new THREE.BufferGeometry();
  const x = width / 2;
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -x,
        height,
        0.13,
        -x,
        height - 0.4,
        1.45,
        x,
        height,
        0.13,
        x,
        height,
        0.13,
        -x,
        height - 0.4,
        1.45,
        x,
        height - 0.4,
        1.45,
        -x,
        height - 0.4,
        1.45,
        -x,
        height - 0.58,
        1.45,
        x,
        height - 0.4,
        1.45,
        x,
        height - 0.4,
        1.45,
        -x,
        height - 0.58,
        1.45,
        x,
        height - 0.58,
        1.45,
      ],
      3,
    ),
  );
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [
        0, 1, 0, 0.15, 1, 1, 1, 1, 0, 0.15, 1, 0.15, 0, 0.15, 0, 0, 1, 0.15, 1,
        0.15, 0, 0, 1, 0,
      ],
      2,
    ),
  );
  g.computeVertexNormals();
  return g;
}

/** At most 24 named, local OSM venues. Geometry is decorative, grounded at
 * mapped facade edges; every clickable sign carries the full venue object.
 */
export function createVenueDecorations(
  chunk,
  venues,
  { projectGeo, geoY, focusPoint },
) {
  const group = new THREE.Group();
  group.name = "Real Lisbon venue storefronts";
  const bounds = chunk.bounds,
    focus = focusPoint ? projectGeo(focusPoint) : null;
  const pointOf = (venue) => [
    venue.lng ?? venue.point?.[0],
    venue.lat ?? venue.point?.[1],
  ];
  const local = venues
    .filter((venue) => {
      const p = pointOf(venue);
      return (
        venue.name &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        p[0] >= bounds[0] &&
        p[0] < bounds[2] &&
        p[1] >= bounds[1] &&
        p[1] < bounds[3]
      );
    })
    .map((venue) => ({ venue, p: projectGeo(pointOf(venue)) }));
  local.sort(
    (a, b) =>
      (focus
        ? Math.hypot(a.p.x - focus.x, a.p.z - focus.z) -
          Math.hypot(b.p.x - focus.x, b.p.z - focus.z)
        : 0) || a.venue.id.localeCompare(b.venue.id),
  );
  const selected = local.slice(0, 24);
  group.userData.venueIds = selected.map(({ venue }) => venue.id);
  group.userData.venueCount = selected.length;
  if (!selected.length) return group;
  const west = projectGeo([bounds[0], bounds[1]]),
    east = projectGeo([bounds[2], bounds[3]]);
  const toGeo = (p) => [
    bounds[0] + ((p.x - west.x) / (east.x - west.x)) * (bounds[2] - bounds[0]),
    bounds[1] + ((p.z - west.z) / (east.z - west.z)) * (bounds[3] - bounds[1]),
  ];
  const buildings = index(),
    roads = index();
  const beachSurfaces = (chunk.surfaces || [])
    .filter((surface) => surface.kind === "sand")
    .map((surface) => ({ id: surface.id, ring: surface.ring.map(projectGeo) }));
  for (const building of chunk.buildings || []) {
    const ring = building.ring.map(projectGeo);
    if (ring.length < 3) continue;
    const item = { building, ring, bounds: boundsOf(ring) };
    buildings.add(item, item.bounds, 9);
  }
  for (const road of chunk.roads || []) {
    const points = road.points.map(projectGeo);
    for (let i = 1; i < points.length; i++)
      roads.add(
        {
          a: points[i - 1],
          b: points[i],
          half: road.width / 2,
          width: road.width,
          kind: road.kind,
        },
        boundsOf([points[i - 1], points[i]]),
        Math.max(40, road.width / 2 + 2),
      );
  }
  const occupied = [],
    seating = [],
    awnings = new Map(),
    fixtures = [],
    entries = [],
    beachFurnishings = [];
  const signMaterial = signAtlas(selected.map(({ venue }) => venue));
  const roadDistance = (p) =>
    Math.min(
      80,
      ...roads
        .at(p)
        .map((road) =>
          Math.max(0, closest(p, road.a, road.b).distance - road.half),
        ),
    );
  const clear = (p, radius, terrace = false) => {
    for (const b of buildings.at(p)) {
      if (inside(p, b.ring)) return false;
      for (let i = 0; i < b.ring.length; i++)
        if (
          closest(p, b.ring[i], b.ring[(i + 1) % b.ring.length]).distance <
          radius
        )
          return false;
    }
    for (const road of roads.at(p)) {
      // Café furniture can use wide pedestrian margins while a 2.4 m central
      // walking corridor stays clear. Car, rail and cycling widths stay clear.
      const corridor =
        terrace &&
        ["footway", "pedestrian"].includes(road.kind) &&
        road.width >= 4.5
          ? 1.2
          : road.half;
      if (closest(p, road.a, road.b).distance < corridor + radius) return false;
    }
    return true;
  };
  let mounted = 0,
    tables = 0,
    rendered = 0;
  selected.forEach(({ venue, p }, slot) => {
    const beach = venue.category === "beach";
    const beachSourceId = /^way:\d+$/.test(venue.id)
      ? Number(venue.id.slice(4))
      : null;
    const beachSurface = beach
      ? beachSurfaces.find(
          (surface) => surface.id === beachSourceId && inside(p, surface.ring),
        )
      : null;
    // The map bubble remains available even if a coarse/concave beach focus
    // has no suitable sand footprint here. Never mount a beach on an inland
    // building or invent a sand island around its marker.
    if (beach && (!beachSurface || !clear(p, 0.3))) return;
    const candidates = [];
    for (const b of beach ? [] : buildings.at(p)) {
      const contained = inside(p, b.ring);
      for (let i = 0; i < b.ring.length; i++) {
        const a = b.ring[i],
          z = b.ring[(i + 1) % b.ring.length],
          dx = z.x - a.x,
          dz = z.z - a.z,
          length = Math.hypot(dx, dz);
        if (length < 2.9) continue;
        const nearest = closest(p, a, z);
        if (!contained && nearest.distance > 8) continue;
        const width = Math.min(4.8, length - 0.65),
          margin = (width / 2 + 0.2) / length;
        const t = Math.max(margin, Math.min(1 - margin, nearest.t));
        let nx = dz / length,
          nz = -dx / length;
        const mid = { x: a.x + dx * t, z: a.z + dz * t };
        if (inside({ x: mid.x + nx * 0.5, z: mid.z + nz * 0.5 }, b.ring)) {
          nx = -nx;
          nz = -nz;
        }
        for (const shift of [0, 1, -1]) {
          const shifted = t + (shift * (width + 0.8)) / length;
          if (shifted < margin || shifted > 1 - margin) continue;
          const face = {
            x: a.x + dx * shifted + nx * 0.13,
            z: a.z + dz * shifted + nz * 0.13,
          };
          if (
            occupied.some(
              (o) =>
                Math.hypot(o.x - face.x, o.z - face.z) <
                (width + o.width) * 0.53,
            )
          )
            continue;
          if (
            buildings
              .at(face)
              .some(
                (other) =>
                  other !== b &&
                  inside(
                    { x: face.x + nx * 0.4, z: face.z + nz * 0.4 },
                    other.ring,
                  ),
              )
          )
            continue;
          candidates.push({
            b,
            face,
            nx,
            nz,
            width,
            edge: [a, z],
            score:
              nearest.distance * 0.45 +
              roadDistance(face) * 0.8 +
              Math.abs(shift) * 3,
          });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const face = candidates[0];
    const decoration = new THREE.Group();
    decoration.userData.venue = venue;
    const ground = geoY(toGeo(face?.face || p));
    decoration.position.set(
      face?.face.x ?? p.x,
      ground + 0.12,
      face?.face.z ?? p.z,
    );
    decoration.rotation.y = face ? Math.atan2(face.nx, face.nz) : 0;
    decoration.updateMatrix();
    const width = face?.width || 2.4;
    const signHeight = face ? 1.15 : 0.6;
    const maxTop = face
      ? Math.max(...face.b.building.ring.map(geoY)) +
        face.b.building.height -
        ground
      : 4;
    const signY = face ? Math.max(1.5, Math.min(3.25, maxTop - 0.7)) : 1.65;
    const sign = new THREE.Mesh(
      signGeometry(width, signHeight, slot),
      signMaterial,
    );
    sign.position.set(0, signY, 0.1);
    sign.userData.hotspot = venue;
    sign.userData.venue = venue;
    const normal = face ? { x: face.nx, z: face.nz } : { x: 0, z: 1 };
    const venueView = {
      point: {
        x: decoration.position.x + normal.x * 0.1,
        y: ground + 0.12 + signY,
        z: decoration.position.z + normal.z * 0.1,
      },
      normal,
      groundY: ground,
    };
    sign.userData.venueView = venueView;
    decoration.userData.venueView = venueView;
    sign.userData.terraceTables = [];
    decoration.add(sign);
    group.add(decoration);
    rendered++;
    if (face) {
      occupied.push({ ...face.face, width });
      mounted++;
      entries.push(
        entryGeometry(venue.category, width, signY).applyMatrix4(
          decoration.matrix,
        ),
      );
      if (
        ["cafe", "restaurant", "bar"].includes(venue.category) &&
        signY > 2.9
      ) {
        if (!awnings.has(venue.category)) awnings.set(venue.category, []);
        awnings
          .get(venue.category)
          .push(
            awningGeometry(width, Math.max(2.7, signY - 0.55)).applyMatrix4(
              decoration.matrix,
            ),
          );
      }
      if (venue.category === "cafe" || venue.category === "restaurant") {
        const right = { x: face.nz, z: -face.nx };
        const ends = face.edge.map(
          (edge) =>
            (edge.x - face.face.x) * right.x + (edge.z - face.face.z) * right.z,
        );
        const left = Math.min(...ends) + 1.05,
          end = Math.max(...ends) - 1.05;
        const available = end - left;
        const count =
          available >= 4.4 ? 3 : available >= 2.2 ? 2 : available >= 0 ? 1 : 0;
        const halfSpan = (count - 1) * 1.1;
        const centre = Math.max(left + halfSpan, Math.min(end - halfSpan, 0));
        for (let place = 0; place < count; place++) {
          const along = centre - halfSpan + place * 2.2;
          let table = null;
          for (const depth of [1.35, 1.8, 2.25]) {
            const candidate = {
              x: face.face.x + face.nx * depth + right.x * along,
              z: face.face.z + face.nz * depth + right.z * along,
            };
            const chairs = [-0.77, 0.77].map((side) => ({
              x: candidate.x + right.x * side,
              z: candidate.z + right.z * side,
            }));
            if (
              tables >= 24 ||
              !clear(candidate, 0.6, true) ||
              chairs.some((chair) => !clear(chair, 0.3, true)) ||
              seating.some(
                (s) =>
                  Math.hypot(s.p.x - candidate.x, s.p.z - candidate.z) < 2.05,
              )
            )
              continue;
            table = candidate;
            break;
          }
          if (!table) continue;
          const obj = new THREE.Object3D();
          obj.position.set(table.x, geoY(toGeo(table)) + 0.17, table.z);
          obj.rotation.y = decoration.rotation.y;
          obj.updateMatrix();
          seating.push({
            p: table,
            geometry: cafeTable(venue.category).applyMatrix4(obj.matrix),
          });
          sign.userData.terraceTables.push({
            x: table.x,
            y: obj.position.y,
            z: table.z,
          });
          tables++;
        }
      }
    } else if (clear(p, 0.3)) {
      const pole = new THREE.CylinderGeometry(0.035, 0.07, 1.6, 6)
        .translate(0, 0.8, 0)
        .applyMatrix4(decoration.matrix);
      const base = new THREE.BoxGeometry(0.38, 0.07, 0.32)
        .translate(0, 0.04, 0)
        .applyMatrix4(decoration.matrix);
      fixtures.push(pole, base);
    }
    if (beachSurface && beachFurnishings.length < 6) {
      const candidate = [
        { x: p.x + 3, z: p.z },
        { x: p.x - 3, z: p.z },
        { x: p.x, z: p.z + 3 },
        { x: p.x, z: p.z - 3 },
      ].find(
        (at) =>
          clear(at, 1.8) &&
          inside(at, beachSurface.ring) &&
          beachSurface.ring.every(
            (edge, i, ring) =>
              closest(at, edge, ring[(i + 1) % ring.length]).distance > 1.6,
          ),
      );
      if (candidate) {
        const placement = new THREE.Object3D();
        placement.position.set(
          candidate.x,
          geoY(toGeo(candidate)) + 0.12,
          candidate.z,
        );
        placement.updateMatrix();
        beachFurnishings.push(beachFurniture().applyMatrix4(placement.matrix));
      }
    }
  });
  if (!rendered) {
    signMaterial.map.dispose();
    signMaterial.dispose();
  }
  for (const [category, parts] of awnings) {
    const mesh = new THREE.Mesh(combine(parts), awningMaterial(category));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (seating.length) {
    const mesh = new THREE.Mesh(
      combine(seating.map((s) => s.geometry)),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    );
    mesh.name = "Colored cafe terrace seating";
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (entries.length) {
    const mesh = new THREE.Mesh(
      combine(entries),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }),
    );
    mesh.name = "Colorful mapped venue entrances";
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (fixtures.length) {
    const mesh = new THREE.Mesh(
      combine(fixtures),
      new THREE.MeshStandardMaterial({
        color: "#36524e",
        metalness: 0.35,
        roughness: 0.72,
      }),
    );
    mesh.castShadow = true;
    group.add(mesh);
  }
  if (beachFurnishings.length) {
    const mesh = new THREE.Mesh(
      combine(beachFurnishings),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
    );
    mesh.name = "Umbrellas on mapped beach sand";
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.venueDecorations = {
    count: selected.length,
    rendered,
    mounted,
    tables,
    beachScenes: beachFurnishings.length,
    drawCalls:
      rendered +
      awnings.size +
      (seating.length ? 1 : 0) +
      (entries.length ? 1 : 0) +
      (beachFurnishings.length ? 1 : 0) +
      (fixtures.length ? 1 : 0),
  };
  return group;
}
