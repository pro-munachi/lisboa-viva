import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Decorative esplanadas and shop details follow the already mounted, named OSM
// venue facades. These are original game art, not surveyed outdoor seating.
const CATEGORIES = new Set(["cafe", "restaurant", "bar", "shop"]);
const COLORS = {
  cafe: "#df624b",
  restaurant: "#388473",
  bar: "#9253ad",
  shop: "#3158c9",
};
const TAU = Math.PI * 2;

function spatialIndex() {
  const cells = new Map();
  return {
    add(item, points, padding = 2) {
      const minX = Math.floor(
        (Math.min(...points.map((p) => p.x)) - padding) / 64,
      );
      const maxX = Math.floor(
        (Math.max(...points.map((p) => p.x)) + padding) / 64,
      );
      const minZ = Math.floor(
        (Math.min(...points.map((p) => p.z)) - padding) / 64,
      );
      const maxZ = Math.floor(
        (Math.max(...points.map((p) => p.z)) + padding) / 64,
      );
      for (let x = minX; x <= maxX; x++)
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(item);
        }
    },
    at(p) {
      return cells.get(`${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`) || [];
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
function distance(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function combine(parts) {
  const result = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return result;
}
function box(w, h, d, x = 0, y = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function tube(r, h, y, x = 0, z = 0) {
  return new THREE.CylinderGeometry(r, r, h, 8).translate(x, y, z);
}
function roofSectors(parity) {
  const vertices = [];
  for (let i = parity; i < 12; i += 2) {
    const a = (i * TAU) / 12,
      b = ((i + 1) * TAU) / 12;
    const x1 = Math.cos(a) * 1.05,
      z1 = Math.sin(a) * 1.05;
    const x2 = Math.cos(b) * 1.05,
      z2 = Math.sin(b) * 1.05;
    vertices.push(
      0,
      2.56,
      0,
      x2,
      2.23,
      z2,
      x1,
      2.23,
      z1,
      x1,
      2.23,
      z1,
      x2,
      2.23,
      z2,
      x1,
      2.1,
      z1,
      x1,
      2.1,
      z1,
      x2,
      2.23,
      z2,
      x2,
      2.1,
      z2,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}
function menuGeometry() {
  return combine([
    box(0.5, 0.64, 0.055, 0, 0.61),
    box(0.06, 0.98, 0.07, -0.25, 0.5),
    box(0.06, 0.98, 0.07, 0.25, 0.5),
    box(0.5, 0.06, 0.07, 0, 0.98),
    box(0.5, 0.06, 0.07, 0, 0.27),
    box(0.55, 0.035, 0.55, 0, 0.035),
  ]);
}

export function setStreetLifeNight(group, value) {
  const lighting = group?.userData.streetLighting;
  if (!lighting) return;
  const night = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  lighting.glass.forEach((material) => {
    material.emissiveIntensity = 0.08 + night * 2.2;
  });
  lighting.strength.value = night * 0.27;
}

/** Bounded supplementary dressing of actual mounted venue facades.
 * Pass the group returned by createVenueDecorations, not raw POIs. At most24
 * facades/24 parasols/48 planters, <=13 batches; all resources owned by group.
 * Return metadata includes types/points for review and reservations for landscape.
 */
export function createStreetLife(chunk, storefronts, { projectGeo, geoY }) {
  const group = new THREE.Group();
  group.name = "Lisbon esplanadas and evening shopfronts";
  const points = [],
    reservations = [],
    fronts = [],
    parasols = [],
    lanterns = [],
    strips = [],
    planters = [],
    menus = [];
  const metadata = {
    points,
    reservations,
    venueIds: [],
    fronts: 0,
    parasols: 0,
    lanterns: 0,
    planters: 0,
    menus: 0,
    drawCalls: 0,
  };
  group.userData.streetLife = metadata;
  const bounds = chunk.bounds;
  const sw = projectGeo([bounds[0], bounds[1]]),
    ne = projectGeo([bounds[2], bounds[3]]);
  const toGeo = (p) => [
    bounds[0] + ((p.x - sw.x) / (ne.x - sw.x)) * (bounds[2] - bounds[0]),
    bounds[1] + ((p.z - sw.z) / (ne.z - sw.z)) * (bounds[3] - bounds[1]),
  ];
  const owned = (p) => {
    const geo = toGeo(p);
    return (
      geo[0] >= bounds[0] &&
      geo[0] < bounds[2] &&
      geo[1] >= bounds[1] &&
      geo[1] < bounds[3]
    );
  };
  const buildingRings = (chunk.buildings || [])
    .filter((b) => b.ring?.length >= 3)
    .map((b) => b.ring.map(projectGeo));
  const buildings = spatialIndex(),
    roadIndex = spatialIndex();
  for (const ring of buildingRings) buildings.add(ring, ring);
  const waters = (chunk.surfaces || [])
    .filter((s) => s.kind === "water")
    .map((s) => s.ring.map(projectGeo));
  const roads = (chunk.roads || []).flatMap((road) => {
    const p = road.points.map(projectGeo);
    return p.slice(1).map((b, i) => ({
      a: p[i],
      b,
      half: Math.max(0.5, road.width / 2),
      kind: road.kind,
      width: road.width,
    }));
  });
  for (const road of roads)
    roadIndex.add(road, [road.a, road.b], road.half + 2);
  const roadClear = (p, radius, overhead = false) =>
    roadIndex.at(p).every((road) => {
      const corridor =
        overhead &&
        ["pedestrian", "footway"].includes(road.kind) &&
        road.width >= 4.5
          ? 1.2
          : road.half;
      return distance(p, road.a, road.b) >= corridor + radius;
    });
  const groundClear = (p, radius) =>
    owned(p) &&
    !waters.some((ring) => inside(p, ring)) &&
    buildings
      .at(p)
      .every(
        (ring) =>
          !inside(p, ring) &&
          ring.every(
            (a, i) => distance(p, a, ring[(i + 1) % ring.length]) >= radius,
          ),
      ) &&
    roadClear(p, radius) &&
    reservations.every(
      (q) => Math.hypot(p.x - q.x, p.z - q.z) >= radius + q.radius,
    );
  const record = (type, entry) =>
    points.push({
      type,
      venueId: entry.venue.id,
      name: entry.venue.name,
      category: entry.venue.category,
      x: entry.x,
      y: entry.y,
      z: entry.z,
    });
  const sources = Array.from(
    new Map(
      (storefronts?.children || [])
        .filter(
          (front) =>
            CATEGORIES.has(front.userData.venue?.category) &&
            typeof front.userData.venue?.id === "string" &&
            front.userData.venue.name &&
            front.userData.mappedFacade,
        )
        .map((front) => [front.userData.venue.id, front]),
    ).values(),
  ).slice(0, 24);
  for (const source of sources)
    for (const table of source.userData.terraceTables || [])
      if ([table.x, table.y, table.z].every(Number.isFinite))
        reservations.push({
          x: table.x,
          z: table.z,
          radius: 1.35,
          type: "mapped-terrace",
        });
  for (const source of sources) {
    const venue = source.userData.venue,
      facade = source.userData.mappedFacade;
    const n = facade.normal;
    if (
      ![
        source.position.x,
        source.position.y,
        source.position.z,
        facade.width,
        facade.height,
        facade.groundY,
        n?.x,
        n?.z,
      ].every(Number.isFinite) ||
      facade.width < 1 ||
      Math.abs(Math.hypot(n.x, n.z) - 1) > 0.01
    )
      continue;
    const base = {
      venue,
      x: source.position.x,
      y: source.position.y,
      z: source.position.z,
      turn: Math.atan2(n.x, n.z),
    };
    const right = { x: n.z, z: -n.x };
    const at = (along, depth, height = 0) => ({
      ...base,
      x: base.x + right.x * along + n.x * depth,
      y: base.y + height,
      z: base.z + right.z * along + n.z * depth,
    });
    const tables = (source.userData.terraceTables || []).filter((p) =>
      [p.x, p.y, p.z].every(Number.isFinite),
    );
    fronts.push(base);
    metadata.venueIds.push(venue.id);
    record("mapped-front", base);
    const mountHeight = Math.min(2.24, facade.height - 0.55);
    if (mountHeight >= 1.6)
      for (const side of [-1, 1]) {
        const lantern = at(side * facade.width * 0.37, 0.22, mountHeight);
        lanterns.push(lantern);
        record("warm-front-lantern", lantern);
      }
    if (facade.height >= 1.65) {
      const strip = at(0, 0.22, Math.min(2.13, facade.height - 0.32));
      strip.scaleX = facade.width * 0.68;
      strips.push(strip);
    }
    for (const table of tables) {
      if (
        parasols.length >= 24 ||
        !owned(table) ||
        !roadClear(table, 1.05, true) ||
        buildings
          .at(table)
          .some(
            (ring) =>
              inside(table, ring) ||
              ring.some(
                (a, i) =>
                  distance(table, a, ring[(i + 1) % ring.length]) < 1.08,
              ),
          )
      )
        continue;
      const entry = { ...base, ...table };
      parasols.push(entry);
      record("striped-esplanada-parasol", entry);
    }
    for (const side of [-1, 1]) {
      const entry = at(side * (facade.width / 2 + 0.32), 0.45);
      if (planters.length >= 48 || !groundClear(entry, 0.38)) continue;
      entry.y = geoY(toGeo(entry)) + 0.13;
      planters.push(entry);
      reservations.push({
        x: entry.x,
        z: entry.z,
        radius: 0.55,
        type: "street-planter",
      });
      record("facade-planter", entry);
    }
    if (["cafe", "bar", "restaurant"].includes(venue.category)) {
      const entry = at(-facade.width * 0.4, 0.94);
      if (menus.length < 24 && groundClear(entry, 0.35)) {
        entry.y = geoY(toGeo(entry)) + 0.13;
        menus.push(entry);
        reservations.push({
          x: entry.x,
          z: entry.z,
          radius: 0.5,
          type: "menu-board",
        });
        record("menu-board", entry);
      }
    }
  }
  metadata.fronts = fronts.length;
  metadata.parasols = parasols.length;
  metadata.lanterns = lanterns.length;
  metadata.planters = planters.length;
  metadata.menus = menus.length;
  if (!fronts.length) return group;
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  const material = (hex, extra = {}) =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: 0.84, ...extra });
  const glass = [];
  function batch(name, entries, geometry, mat, tint = false) {
    if (!entries.length) {
      geometry.dispose();
      mat.dispose();
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    mesh.name = name;
    entries.forEach((entry, i) => {
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, entry.turn, 0);
      dummy.scale.set(entry.scaleX || 1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (tint) mesh.setColorAt(i, color.set(COLORS[entry.venue.category]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  batch(
    "Cream esplanada parasol stripes",
    parasols,
    roofSectors(0),
    material("#f4e3bf", { side: THREE.DoubleSide }),
  );
  batch(
    "Colourful esplanada parasol stripes",
    parasols,
    roofSectors(1),
    material("#ffffff", { side: THREE.DoubleSide }),
    true,
  );
  batch(
    "Esplanada parasol poles",
    parasols,
    tube(0.025, 2.5, 1.25),
    material("#6a5948", { metalness: 0.25 }),
  );
  batch(
    "Terrace cups and saucers",
    parasols,
    combine(
      [-0.2, 0.2].flatMap((x) => [
        tube(0.065, 0.015, 0.825, x),
        tube(0.045, 0.075, 0.867, x),
      ]),
    ),
    material("#fff4dc"),
  );
  batch(
    "Mounted front lantern ironwork",
    lanterns,
    combine([
      box(0.27, 0.035, 0.28, 0, 0.22, 0.1),
      box(0.27, 0.035, 0.28, 0, -0.18, 0.1),
      box(0.035, 0.4, 0.035, -0.11, 0.02, 0.21),
      box(0.035, 0.4, 0.035, 0.11, 0.02, 0.21),
      box(0.035, 0.1, 0.26, 0, 0.22, -0.06),
    ]),
    material("#31483f", { metalness: 0.45, roughness: 0.62 }),
  );
  const glowMaterial = material("#fff0c5", {
    emissive: "#ffcb7e",
    emissiveIntensity: 0.08,
    roughness: 0.4,
  });
  if (
    batch(
      "Warm front lantern glass",
      lanterns,
      box(0.18, 0.32, 0.17, 0, 0.02, 0.1),
      glowMaterial,
    )
  )
    glass.push(glowMaterial);
  const stripMaterial = material("#efd4a9", {
    emissive: "#ffce89",
    emissiveIntensity: 0.08,
  });
  if (batch("Warm entrance trim", strips, box(1, 0.035, 0.05), stripMaterial))
    glass.push(stripMaterial);
  batch(
    "Front terracotta planters",
    planters,
    new THREE.CylinderGeometry(0.35, 0.26, 0.65, 10).translate(0, 0.325, 0),
    material("#c88762"),
  );
  batch(
    "Front planter leaves",
    planters,
    new THREE.IcosahedronGeometry(0.37, 1)
      .scale(1, 0.85, 1)
      .translate(0, 0.78, 0),
    material("#4b8658"),
  );
  batch("Street chalkboard frames", menus, menuGeometry(), material("#9e704b"));
  batch(
    "Street chalkboard faces",
    menus,
    box(0.42, 0.54, 0.016, 0, 0.63, 0.04),
    material("#2b4140"),
  );
  // Chalk strokes suggest a daily menu without inventing prices/business claims.
  batch(
    "Menu chalk strokes",
    menus,
    combine(
      [0.48, 0.59, 0.7, 0.81].map((y, i) =>
        box(i % 2 ? 0.22 : 0.3, 0.014, 0.014, -0.015, y, 0.052),
      ),
    ),
    material("#e9e4c9"),
  );
  const strength = { value: 0 };
  const vertices = [],
    uvs = [];
  for (const front of fronts) {
    const source = sources.find(
      (candidate) => candidate.userData.venue.id === front.venue.id,
    );
    const n = source.userData.mappedFacade.normal,
      right = { x: n.z, z: -n.x };
    for (const [x, z, u, v] of [
      [-1.8, 0.3, 0, 0],
      [-1.8, 3.4, 0, 1],
      [1.8, 0.3, 1, 0],
      [1.8, 0.3, 1, 0],
      [-1.8, 3.4, 0, 1],
      [1.8, 3.4, 1, 1],
    ]) {
      const p = {
        x: front.x + right.x * x + n.x * z,
        z: front.z + right.z * x + n.z * z,
      };
      vertices.push(p.x, geoY(toGeo(p)) + 0.22, p.z);
      uvs.push(u, v);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  const glow = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { strength, color: { value: new THREE.Color("#ffd090") } },
      vertexShader:
        "varying vec2 glowUV;void main(){glowUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "uniform float strength;uniform vec3 color;varying vec2 glowUV;void main(){float across=pow(max(0.,1.-abs(glowUV.x-.5)*2.),.7);float fade=pow(1.-glowUV.y,2.);gl_FragColor=vec4(color,strength*across*fade);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
    }),
  );
  glow.name = "Terrain-draped warm storefront light";
  glow.renderOrder = 1;
  group.add(glow);
  group.userData.streetLighting = { glass, strength };
  metadata.drawCalls = group.children.length;
  return group;
}
