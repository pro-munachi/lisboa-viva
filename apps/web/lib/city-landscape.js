import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Original, illustrative street dressing. Park outlines and street positions
// come from OSM; individual trees and furniture are deliberately procedural.
const CELL = 48;
const TAU = Math.PI * 2;
const WALKING_STREETS = new Set([
  "footway",
  "pedestrian",
  "living_street",
  "residential",
  "tertiary",
]);

function randomFor(value) {
  let seed = 2166136261;
  for (const c of String(value))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6d2b79f5;
    let n = Math.imul(seed ^ (seed >>> 15), seed | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

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

function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function segmentDistanceSquared(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
}

function spatialIndex() {
  const cells = new Map();
  return {
    add(item, bounds, padding = 0) {
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

function combine(parts) {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return geometry;
}

function box(x, y, z, px = 0, py = 0, pz = 0) {
  return new THREE.BoxGeometry(x, y, z).translate(px, py, pz);
}

function cylinder(top, bottom, height, y, segments = 7) {
  return new THREE.CylinderGeometry(top, bottom, height, segments).translate(
    0,
    y,
    0,
  );
}

function palmFronds() {
  const vertices = [],
    indices = [];
  // Eight arching fronds with a folded centre ridge, all in one low-poly crown.
  for (let leaf = 0; leaf < 8; leaf++) {
    const angle = (leaf * TAU) / 8;
    const start = vertices.length / 3;
    for (let step = 0; step <= 5; step++) {
      const t = step / 5;
      const radius = t * 2.9;
      const width = Math.sin(t * Math.PI) * 0.48;
      const y = Math.sin(t * Math.PI * 0.92) * 0.64 - t * t * 0.94;
      for (const side of [-1, 0, 1]) {
        const across = width * side;
        vertices.push(
          Math.cos(angle) * radius - Math.sin(angle) * across,
          y + (side === 0 ? 0.13 : 0),
          Math.sin(angle) * radius + Math.cos(angle) * across,
        );
      }
    }
    for (let step = 0; step < 5; step++) {
      const a = start + step * 3;
      for (let side = 0; side < 2; side++)
        indices.push(
          a + side,
          a + side + 3,
          a + side + 1,
          a + side + 1,
          a + side + 3,
          a + side + 4,
        );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roundCanopy() {
  return combine([
    new THREE.IcosahedronGeometry(1, 1).scale(2.15, 1.85, 2.05),
    new THREE.IcosahedronGeometry(1, 0)
      .scale(1.45, 1.35, 1.55)
      .translate(1.0, -0.35, 0.6),
    new THREE.IcosahedronGeometry(1, 0)
      .scale(1.6, 1.45, 1.45)
      .translate(-0.8, -0.2, -0.7),
  ]);
}

function cypressCanopy() {
  return combine([
    new THREE.ConeGeometry(1.05, 4.4, 8).translate(0, 0, 0),
    new THREE.ConeGeometry(0.78, 3.9, 8).translate(0, 1.2, 0),
    new THREE.ConeGeometry(0.53, 3.2, 8).translate(0, 2.45, 0),
  ]);
}

function lampIron() {
  const arm = cylinder(0.07, 0.07, 0.84, 0, 6);
  arm.rotateZ(Math.PI / 2).translate(0.35, 4.45, 0);
  return combine([
    cylinder(0.065, 0.105, 4.6, 2.3),
    cylinder(0.18, 0.22, 0.36, 0.18, 8),
    arm,
    box(0.5, 0.08, 0.5, 0.76, 4.82),
    box(0.44, 0.075, 0.44, 0.76, 4.38),
    ...[-0.18, 0.18].flatMap((x) =>
      [-0.18, 0.18].map((z) => box(0.035, 0.42, 0.035, 0.76 + x, 4.61, z)),
    ),
    new THREE.ConeGeometry(0.39, 0.24, 4)
      .rotateY(Math.PI / 4)
      .translate(0.76, 4.97, 0),
  ]);
}

function benchWood() {
  return combine([
    ...[-0.2, -0.1, 0, 0.1, 0.2].map((z) =>
      box(1.75, 0.055, 0.083, 0, 0.55, z),
    ),
    ...[0.83, 0.97, 1.11].map((y) => box(1.75, 0.09, 0.055, 0, y, -0.27)),
  ]);
}

function benchIron() {
  return combine(
    [-0.68, 0.68].flatMap((x) => [
      box(0.055, 0.55, 0.43, x, 0.28),
      box(0.055, 0.64, 0.055, x, 0.84, -0.29),
      box(0.055, 0.2, 0.055, x, 0.69, 0.23),
      box(0.055, 0.045, 0.52, x, 0.78),
    ]),
  );
}

/** Bounded, terrain-grounded landscaping for one lazily loaded detail chunk.
 * Every mesh owns its geometry/material within the returned group, so normal
 * scene traversal disposal is sufficient when the chunk leaves the camera.
 */
export function createLandscape(chunk, { projectGeo, geoY, focusPoint }) {
  const group = new THREE.Group();
  group.name = "Lisbon gardens and street life";
  const southWest = projectGeo([chunk.bounds[0], chunk.bounds[1]]);
  const northEast = projectGeo([chunk.bounds[2], chunk.bounds[3]]);
  const worldBounds = [southWest.x, northEast.z, northEast.x, southWest.z];
  const focus = focusPoint ? projectGeo(focusPoint) : null;
  const toGeo = (p) => [
    chunk.bounds[0] +
      ((p.x - southWest.x) / (northEast.x - southWest.x)) *
        (chunk.bounds[2] - chunk.bounds[0]),
    chunk.bounds[1] +
      ((p.z - southWest.z) / (northEast.z - southWest.z)) *
        (chunk.bounds[3] - chunk.bounds[1]),
  ];
  const owned = (p) =>
    p.x >= worldBounds[0] &&
    p.x < worldBounds[2] &&
    p.z >= worldBounds[1] &&
    p.z < worldBounds[3];
  const buildings = spatialIndex(),
    roads = spatialIndex(),
    reserved = spatialIndex();
  const waters = (chunk.surfaces || [])
    .filter((surface) => surface.kind === "water")
    .map((surface) => {
      const ring = surface.ring.map(projectGeo);
      return { ring, bounds: boundsOf(ring) };
    });
  for (const building of chunk.buildings || []) {
    if (building.ring.length < 3) continue;
    const ring = building.ring.map(projectGeo),
      bounds = boundsOf(ring);
    buildings.add({ ring, bounds }, bounds, 3.3);
  }
  const streets = [];
  for (const road of chunk.roads || []) {
    const points = road.points.map(projectGeo);
    streets.push({ ...road, points });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      roads.add(
        { a, b, halfWidth: Math.max(0.5, road.width / 2) },
        boundsOf([a, b]),
        Math.max(0.5, road.width / 2) + 2,
      );
    }
  }
  const blocked = (p, buildingClearance = 1, roadClearance = 0.5) => {
    if (!owned(p)) return true;
    for (const water of waters)
      if (
        p.x >= water.bounds[0] &&
        p.x <= water.bounds[2] &&
        p.z >= water.bounds[1] &&
        p.z <= water.bounds[3] &&
        inRing(p, water.ring)
      )
        return true;
    for (const b of buildings.at(p)) {
      if (
        p.x < b.bounds[0] - buildingClearance ||
        p.x > b.bounds[2] + buildingClearance ||
        p.z < b.bounds[1] - buildingClearance ||
        p.z > b.bounds[3] + buildingClearance
      )
        continue;
      if (inRing(p, b.ring)) return true;
      for (let i = 0; i < b.ring.length; i++)
        if (
          segmentDistanceSquared(
            p,
            b.ring[i],
            b.ring[(i + 1) % b.ring.length],
          ) <
          buildingClearance ** 2
        )
          return true;
    }
    for (const r of roads.at(p))
      if (
        segmentDistanceSquared(p, r.a, r.b) <
        (r.halfWidth + roadClearance) ** 2
      )
        return true;
    return false;
  };
  const spaceAvailable = (p, radius) =>
    !reserved
      .at(p)
      .some(
        (q) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2 < (radius + q.radius) ** 2,
      );
  const reserve = (p, radius) =>
    reserved.add({ ...p, radius }, [p.x, p.z, p.x, p.z], radius + 3.3);
  const trees = [],
    lamps = [],
    benches = [],
    umbrellas = [],
    planters = [];
  const addTree = (p, rand, woodland = false) => {
    if (blocked(p, 2.6, 0.45) || !spaceAvailable(p, 2.6)) return false;
    const pick = rand();
    const type = woodland
      ? pick < 0.3
        ? "cypress"
        : "round"
      : pick < 0.25
        ? "palm"
        : pick < 0.45
          ? "cypress"
          : "round";
    trees.push({
      ...p,
      type,
      scale: 0.82 + rand() * 0.36,
      turn: rand() * TAU,
      tint: rand(),
    });
    reserve(p, 2.6);
    return true;
  };

  const parkSurfaces = (chunk.surfaces || [])
    .filter((s) => s.kind === "park" || s.kind === "wood")
    .map((s) => ({ ...s, ring: s.ring.map(projectGeo) }));
  const budgets = parkSurfaces
    .map((surface) => {
      const b = boundsOf(surface.ring);
      const x = Math.max(b[0], worldBounds[0]),
        z = Math.max(b[1], worldBounds[1]);
      const width = Math.max(0, Math.min(b[2], worldBounds[2]) - x);
      const depth = Math.max(0, Math.min(b[3], worldBounds[3]) - z);
      return {
        surface,
        bounds: [x, z, x + width, z + depth],
        area: width * depth,
        distance: focus
          ? Math.hypot(
              Math.max(x - focus.x, 0, focus.x - x - width),
              Math.max(z - focus.z, 0, focus.z - z - depth),
            )
          : 0,
      };
    })
    .filter((s) => s.area > 20);
  const totalArea = budgets.reduce((sum, s) => sum + s.area, 0);
  // Forty percent remains distributed across the mapped green spaces. The
  // nearer gardens receive the other sixty percent so street-level scenery
  // reads clearly without spending the entire cap on distant woodland.
  const nearWeight = (budget) =>
    Math.sqrt(budget.area) / (budget.distance + 120) ** 1.75;
  const totalNearWeight = budgets.reduce(
    (sum, budget) => sum + nearWeight(budget),
    0,
  );
  if (focus)
    budgets.sort(
      (a, b) => a.distance - b.distance || a.surface.id - b.surface.id,
    );
  for (const budget of budgets) {
    const { surface, bounds, area } = budget;
    const rand = randomFor(`garden-${surface.id}`);
    const wanted = Math.min(
      200,
      Math.ceil(
        focus
          ? (168 * area) / (totalArea || 1) +
              (252 * nearWeight(budget)) / (totalNearWeight || 1)
          : (420 * area) / (totalArea || 1),
      ),
      Math.ceil(area / 150),
    );
    let placed = 0;
    // Rejection attempts are bounded even for narrow parks or heavily built sites.
    for (
      let attempt = 0;
      attempt < wanted * 12 && placed < wanted && trees.length < 420;
      attempt++
    ) {
      const p = {
        x: bounds[0] + rand() * (bounds[2] - bounds[0]),
        z: bounds[1] + rand() * (bounds[3] - bounds[1]),
      };
      if (inRing(p, surface.ring) && addTree(p, rand, surface.kind === "wood"))
        placed++;
    }
  }

  let roadsideTrees = 0;
  const candidates = [];
  // Candidate positions are generated independently of camera distance. Only
  // their priority changes, and furniture keeps deterministic random choices.
  for (const street of streets) {
    if (!WALKING_STREETS.has(street.kind) || street.points.length < 2) continue;
    const rand = randomFor(`street-${street.id}`);
    let travelled = rand() * 22;
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1],
        b = street.points[i];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        length = Math.hypot(dx, dz);
      if (length < 4) continue;
      const nx = -dz / length,
        nz = dx / length,
        angle = Math.atan2(dx, dz);
      for (let d = travelled; d < length; d += 35) {
        const sign = rand() < 0.5 ? -1 : 1;
        const offset = Math.max(0.5, street.width / 2) + 1.5;
        const p = {
          x: a.x + (dx * d) / length + nx * offset * sign,
          z: a.z + (dz * d) / length + nz * offset * sign,
        };
        if (!owned(p)) continue;
        const key = `${street.id}-${i}-${Math.round(d * 100)}`;
        candidates.push({
          street,
          p,
          dx,
          dz,
          length,
          nx,
          nz,
          angle,
          sign,
          key,
          distance: focus ? (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 : 0,
          tie: randomFor(key)(),
        });
      }
      travelled = (((travelled - length) % 35) + 35) % 35;
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.tie - b.tie);
  for (const candidate of candidates) {
    const { street, p, dx, dz, length, nx, nz, angle, sign } = candidate;
    const rand = randomFor(`furniture-${candidate.key}`);
    if (
      lamps.length < 100 &&
      !blocked(p, 0.8, 0.4) &&
      spaceAvailable(p, 0.55)
    ) {
      lamps.push({ ...p, turn: angle + (sign < 0 ? Math.PI : 0) });
      reserve(p, 0.55);
    }
    const treeP = {
      x: p.x + (dx / length) * 8 + nx * sign * 0.9,
      z: p.z + (dz / length) * 8 + nz * sign * 0.9,
    };
    if (
      trees.length < 600 &&
      roadsideTrees < 180 &&
      rand() < 0.62 &&
      addTree(treeP, rand)
    )
      roadsideTrees++;
    const benchP = {
      x: p.x + (dx / length) * 15,
      z: p.z + (dz / length) * 15,
    };
    if (
      benches.length < 48 &&
      ["pedestrian", "footway", "living_street"].includes(street.kind) &&
      rand() < 0.48 &&
      !blocked(benchP, 1.1, 0.75) &&
      spaceAvailable(benchP, 1.1)
    ) {
      benches.push({ ...benchP, turn: angle + (Math.PI / 2) * sign });
      reserve(benchP, 1.1);
    }
    const cafeP = {
      x: p.x + (dx / length) * 23 + nx * sign * 1.7,
      z: p.z + (dz / length) * 23 + nz * sign * 1.7,
    };
    if (
      umbrellas.length < 18 &&
      street.kind === "pedestrian" &&
      rand() < 0.25 &&
      !blocked(cafeP, 1.8, 1.7) &&
      spaceAvailable(cafeP, 1.8)
    ) {
      umbrellas.push({ ...cafeP, turn: angle, tint: rand() });
      reserve(cafeP, 1.8);
    }
    const planterP = {
      x: p.x + (dx / length) * 27,
      z: p.z + (dz / length) * 27,
    };
    if (
      planters.length < 42 &&
      street.kind !== "tertiary" &&
      rand() < 0.3 &&
      !blocked(planterP, 0.65, 0.55) &&
      spaceAvailable(planterP, 0.65)
    ) {
      planters.push({ ...planterP, turn: angle });
      reserve(planterP, 0.65);
    }
    if (
      lamps.length >= 100 &&
      roadsideTrees >= 180 &&
      benches.length >= 48 &&
      planters.length >= 42 &&
      umbrellas.length >= 18
    )
      break;
  }

  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  function batch(name, entries, geometry, material, transform, tint) {
    if (!entries.length) {
      geometry.dispose();
      material.dispose();
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.name = name;
    entries.forEach((entry, i) => {
      const ground = geoY(toGeo(entry)) + 0.12;
      dummy.position.set(entry.x, ground, entry.z);
      dummy.rotation.set(0, entry.turn || 0, 0);
      dummy.scale.set(1, 1, 1);
      transform?.(entry, dummy, ground);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (tint) mesh.setColorAt(i, tint(entry, color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const material = (hex, extra = {}) =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: 0.87, ...extra });
  const treeHeight = (tree) =>
    (tree.type === "palm" ? 6.5 : tree.type === "cypress" ? 3.1 : 3.35) *
    tree.scale;
  batch(
    "Mediterranean tree trunks",
    trees,
    cylinder(0.13, 0.2, 1, 0.5),
    material("#806446"),
    (tree, obj) => obj.scale.set(tree.scale, treeHeight(tree), tree.scale),
  );
  batch(
    "Olive and shade canopies",
    trees.filter((tree) => tree.type === "round"),
    roundCanopy(),
    material("#ffffff"),
    (tree, obj, ground) => {
      obj.position.y = ground + 4.3 * tree.scale;
      obj.scale.setScalar(tree.scale);
    },
    (tree, c) =>
      c.setHSL(
        0.22 + tree.tint * 0.055,
        0.22 + tree.tint * 0.12,
        0.3 + tree.tint * 0.07,
      ),
  );
  batch(
    "Cypress silhouettes",
    trees.filter((tree) => tree.type === "cypress"),
    cypressCanopy(),
    material("#ffffff"),
    (tree, obj, ground) => {
      obj.position.y = ground + 4.2 * tree.scale;
      obj.scale.setScalar(tree.scale);
    },
    (tree, c) =>
      c.setHSL(0.29, 0.25 + tree.tint * 0.08, 0.23 + tree.tint * 0.07),
  );
  batch(
    "Riverside palm crowns",
    trees.filter((tree) => tree.type === "palm"),
    palmFronds(),
    material("#597e47", { side: THREE.DoubleSide }),
    (tree, obj, ground) => {
      obj.position.y = ground + 6.5 * tree.scale;
      obj.scale.setScalar(tree.scale);
    },
  );
  batch(
    "Lisbon iron lanterns",
    lamps,
    lampIron(),
    material("#263d3b", { metalness: 0.45 }),
  );
  batch(
    "Warm lantern glass",
    lamps,
    box(0.32, 0.32, 0.32, 0.76, 4.59),
    material("#fff0ba", { emissive: "#d4ad60", emissiveIntensity: 0.25 }),
  );
  batch("Wooden promenade benches", benches, benchWood(), material("#ae7f4d"));
  batch(
    "Bench ironwork",
    benches,
    benchIron(),
    material("#2a4744", { metalness: 0.35 }),
  );
  batch(
    "Café shade",
    umbrellas,
    new THREE.ConeGeometry(1.65, 0.58, 10, 1, true).translate(0, 2.7, 0),
    material("#ffffff", { side: THREE.DoubleSide }),
    undefined,
    (entry, c) =>
      c.set(
        entry.tint < 0.33
          ? "#a45c43"
          : entry.tint < 0.66
            ? "#ecdbb5"
            : "#617971",
      ),
  );
  batch(
    "Café tables and parasol poles",
    umbrellas,
    combine([
      cylinder(0.035, 0.04, 2.75, 1.375),
      cylinder(0.48, 0.48, 0.075, 0.79, 10),
      cylinder(0.045, 0.065, 0.8, 0.4),
      ...[-0.9, 0.9].flatMap((x) => [
        box(0.38, 0.06, 0.38, x, 0.48),
        box(0.38, 0.34, 0.06, x, 0.65, -0.18),
        box(0.06, 0.46, 0.3, x, 0.23),
      ]),
    ]),
    material("#694a36"),
  );
  batch(
    "Terracotta street planters",
    planters,
    cylinder(0.47, 0.34, 0.8, 0.4, 8),
    material("#b97752"),
  );
  batch(
    "Planter foliage",
    planters,
    new THREE.IcosahedronGeometry(0.54, 1)
      .scale(1, 0.7, 1)
      .translate(0, 1.0, 0),
    material("#59795a"),
  );
  group.userData.landscape = {
    trees: trees.length,
    roadsideTrees,
    lamps: lamps.length,
    benches: benches.length,
    umbrellas: umbrellas.length,
    planters: planters.length,
    drawCalls: group.children.length,
  };
  return group;
}
