// Visible, deterministic simulated residents on actual mapped walking routes.
// These are animation profiles, not real people or live location information.
import { demographicProfile, npcSeed } from "./npc-demographics";
/** @typedef {{ id: number|string, ring: ReadonlyArray<ReadonlyArray<number>> }} BuildingFootprint */
/** @typedef {(point: any) => {x: number, z: number}} GeographicProjector */
const WALK_KINDS = new Set([
  "footway",
  "pedestrian",
  "path",
  "steps",
  "residential",
  "living_street",
  "unclassified",
  "tertiary",
  "secondary",
  "service",
]);
const PEDESTRIAN_KINDS = new Set(["footway", "pedestrian", "path", "steps"]);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function usableLine(line) {
  return (
    WALK_KINDS.has(line.kind) &&
    !["no", "private"].includes(line.foot) &&
    line.sidewalk !== "no" &&
    line.length > 8 &&
    Array.isArray(line.ps) &&
    line.ps.length >= 2 &&
    line.ps.every(finitePoint) &&
    Array.isArray(line.lengths) &&
    line.lengths.length === line.ps.length &&
    line.lengths.every(
      (d, i) => Number.isFinite(d) && (i === 0 || d >= line.lengths[i - 1]),
    )
  );
}

function gentleRoute(line) {
  if (line.kind === "steps") return false;
  for (let i = 1; i < line.ps.length; i++) {
    const a = line.ps[i - 1],
      b = line.ps[i];
    const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
    if (
      horizontal > 0.01 &&
      Math.abs((b.y || 0) - (a.y || 0)) / horizontal > 0.12
    )
      return false;
  }
  return true;
}

function nearestSegment(line, target) {
  let closest = null;
  for (let i = 1; i < line.ps.length; i++) {
    const a = line.ps[i - 1],
      b = line.ps[i];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      squared = dx * dx + dz * dz;
    if (squared < 0.01) continue;
    const t = clamp(
      ((target.x - a.x) * dx + (target.z - a.z) * dz) / squared,
      0,
      1,
    );
    const point = { x: a.x + dx * t, z: a.z + dz * t };
    const delta = distance(point, target);
    if (!closest || delta < closest.distance)
      closest = {
        distance: delta,
        d: line.lengths[i - 1] + (line.lengths[i] - line.lengths[i - 1]) * t,
      };
  }
  return closest;
}

function positionAt(line, d, side = 0) {
  const at = clamp(d, 0, line.length);
  let i = 1;
  while (i < line.lengths.length - 1 && line.lengths[i] < at) i++;
  const a = line.ps[i - 1],
    b = line.ps[i];
  const span = line.lengths[i] - line.lengths[i - 1];
  const t = span > 0 ? clamp((at - line.lengths[i - 1]) / span, 0, 1) : 0;
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const horizontalLength = Math.max(0.001, Math.hypot(dx, dz));
  return {
    x: a.x + dx * t - (dz / horizontalLength) * side,
    y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
    z: a.z + dz * t + (dx / horizontalLength) * side,
    angle: Math.atan2(dx, dz),
    distance: at,
  };
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    squared = dx * dx + dz * dz;
  const t =
    squared > 0
      ? clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / squared, 0, 1)
      : 0;
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}

function blockedByPolygon(point, polygon, padding = 0.42) {
  const { ring, minX, maxX, minZ, maxZ } = polygon;
  if (
    point.x < minX - padding ||
    point.x > maxX + padding ||
    point.z < minZ - padding ||
    point.z > maxZ + padding
  )
    return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (segmentDistance(point, a, b) <= padding) return true;
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function buildingAvoidance(
  buildings,
  target,
  projectGeo,
  radius,
  padding = 0.42,
) {
  if (!projectGeo || !buildings?.length) return () => false;
  const cell = 20,
    grid = new Map(),
    seen = new Set();
  for (const building of buildings) {
    if (
      seen.has(building.id) ||
      !Array.isArray(building.ring) ||
      building.ring.length < 4
    )
      continue;
    seen.add(building.id);
    const ring = building.ring.map(projectGeo);
    if (!ring.every(finitePoint)) continue;
    const minX = Math.min(...ring.map((p) => p.x)),
      maxX = Math.max(...ring.map((p) => p.x));
    const minZ = Math.min(...ring.map((p) => p.z)),
      maxZ = Math.max(...ring.map((p) => p.z));
    if (
      maxX < target.x - radius ||
      minX > target.x + radius ||
      maxZ < target.z - radius ||
      minZ > target.z + radius
    )
      continue;
    const polygon = { ring, minX, maxX, minZ, maxZ };
    // Clip grid coverage to the local camera region even for a huge mapped ring.
    const x0 = Math.floor(Math.max(minX - padding, target.x - radius) / cell);
    const x1 = Math.floor(Math.min(maxX + padding, target.x + radius) / cell);
    const z0 = Math.floor(Math.max(minZ - padding, target.z - radius) / cell);
    const z1 = Math.floor(Math.min(maxZ + padding, target.z + radius) / cell);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const key = `${x}:${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(polygon);
      }
  }
  return (point) =>
    (
      grid.get(`${Math.floor(point.x / cell)}:${Math.floor(point.z / cell)}`) ||
      []
    ).some((polygon) => blockedByPolygon(point, polygon, padding));
}

function clearWalkingSection(line, nearestD, side, target, blocked, radius) {
  const min = Math.max(0.7, nearestD - 62),
    max = Math.min(line.length - 0.7, nearestD + 62);
  if (max - min < 8) return null;
  const count = Math.max(2, Math.ceil((max - min) / 0.75)),
    spans = [];
  let start = null,
    previous = min;
  for (let i = 0; i <= count; i++) {
    const d = min + ((max - min) * i) / count;
    const p = positionAt(line, d, side);
    const safe = distance(p, target) <= radius && !blocked(p);
    if (safe && start === null) start = d;
    if (!safe && start !== null) {
      if (previous - start >= 8) spans.push([start, previous]);
      start = null;
    }
    previous = d;
  }
  if (start !== null && max - start >= 8) spans.push([start, max]);
  let best = null;
  for (const [a, b] of spans) {
    // Keep a margin from a rejected point so a turning avatar's shoulders stay clear.
    const minD = a + 0.55,
      maxD = b - 0.55,
      d = clamp(nearestD, minD, maxD);
    const p = positionAt(line, d, side),
      delta = distance(p, target);
    const score = delta - Math.min(50, maxD - minD) * 0.035;
    if (!best || score < best.score)
      best = { minD, maxD, nearestD: d, side, distance: delta, score };
  }
  return best;
}

/**
 * Sorted safe route sections close to the camera, rather than the first ways in a chunk.
 * @param {any[]} paths
 * @param {{x: number, z: number}} target
 * @param {BuildingFootprint[]} [buildings]
 * @param {{projectGeo?: GeographicProjector, maxDistance?: number, maxRoutes?: number, reservations?: {x:number,z:number,radius:number}[]}} [options]
 */
export function chooseWalkingRoutes(
  paths,
  target,
  buildings = [],
  options = {},
) {
  if (!finitePoint(target)) return [];
  const radius = clamp(options.maxDistance || 110, 25, 180);
  const byId = new Map();
  for (const line of paths || []) {
    if (!usableLine(line)) continue;
    const key =
      line.id ??
      `${line.ps[0].x}:${line.ps[0].z}:${line.ps.at(-1).x}:${line.ps.at(-1).z}`;
    const previous = byId.get(key);
    // The overview and detail layers contain the same OSM ways. Keep one route.
    if (
      !previous ||
      (previous.owner === "overview" && line.owner !== "overview")
    )
      byId.set(key, line);
  }
  const candidates = [];
  for (const line of byId.values()) {
    const nearest = nearestSegment(line, target);
    if (nearest && nearest.distance <= radius)
      candidates.push({ line, ...nearest });
  }
  candidates.sort(
    (a, b) =>
      a.distance - b.distance ||
      Number(a.line.id || 0) - Number(b.line.id || 0),
  );
  const buildingBlocked = buildingAvoidance(
    buildings,
    target,
    options.projectGeo,
    radius + 12,
  );
  const reservations = (options.reservations || [])
    .filter(
      (circle) =>
        finitePoint(circle) &&
        Number.isFinite(circle.radius) &&
        circle.radius > 0 &&
        circle.radius <= 30 &&
        distance(circle, target) <= radius + circle.radius + 12,
    )
    .slice(0, 512);
  const furnitureBlocked = (point, padding) =>
    reservations.some(
      (circle) => distance(point, circle) <= circle.radius + padding,
    );
  const blocked = (point) =>
    buildingBlocked(point) || furnitureBlocked(point, 0.42);
  // Strollers need space for their forward projection while turning; this is
  // deliberately more conservative than a walking adult's shoulder clearance.
  let strollerBlocked = null;
  const routes = [];
  for (const candidate of candidates.slice(0, 100)) {
    const { line } = candidate;
    const pedestrian = PEDESTRIAN_KINDS.has(line.kind),
      width = Number(line.width) || 4;
    // The detailed paving is one metre outside each carriageway edge.
    const offset = width / 2 + 0.5;
    const sides = pedestrian
      ? [0, Math.min(0.55, width * 0.2), -Math.min(0.55, width * 0.2)]
      : [offset, -offset, width / 2 + 0.15, -(width / 2 + 0.15)];
    let section = null;
    for (const side of sides) {
      const safe = clearWalkingSection(
        line,
        candidate.d,
        side,
        target,
        blocked,
        radius,
      );
      if (safe && (!section || safe.score < section.score)) section = safe;
    }
    if (!section) continue;
    const familyCandidate =
      pedestrian && line.kind !== "steps" && width >= 2.4 && gentleRoute(line);
    if (familyCandidate && !strollerBlocked) {
      const familyBuildingBlocked = buildingAvoidance(
        buildings,
        target,
        options.projectGeo,
        radius + 12,
        1.3,
      );
      strollerBlocked = (point) =>
        familyBuildingBlocked(point) || furnitureBlocked(point, 1.3);
    }
    const familySection = familyCandidate
      ? clearWalkingSection(
          line,
          candidate.d,
          section.side,
          target,
          strollerBlocked,
          radius,
        )
      : null;
    routes.push({
      line,
      ...section,
      priority: section.distance + (pedestrian ? 0 : 7),
      accessible: gentleRoute(line),
      familyEligible:
        !!familySection && familySection.maxD - familySection.minD >= 18,
      familySection,
      context:
        line.context ||
        (line.kind === "pedestrian" ? "pedestrian-street" : "street"),
    });
  }
  routes.sort(
    (a, b) =>
      a.priority - b.priority ||
      Number(a.line.id || 0) - Number(b.line.id || 0),
  );
  return routes.slice(0, clamp(options.maxRoutes || 36, 1, 60));
}

/**
 * Character options and original-line distances; the renderer owns the meshes.
 * @param {{paths: any[], target: {x: number, z: number}, buildings?: BuildingFootprint[], projectGeo?: GeographicProjector, max?: number, maxDistance?: number, surfaces?: {kind:string, ring:ReadonlyArray<ReadonlyArray<number>>}[], reservations?: {x:number,z:number,radius:number}[]}} options
 */
export function createLocalWalkerProfiles({
  paths,
  target,
  buildings = [],
  projectGeo,
  max = 28,
  maxDistance = 110,
  surfaces = [],
  reservations = [],
}) {
  const routes = chooseWalkingRoutes(paths, target, buildings, {
    projectGeo,
    maxDistance,
    reservations,
  });
  const parks = projectGeo
    ? surfaces
        .filter(
          (surface) =>
            ["park", "wood"].includes(surface.kind) &&
            Array.isArray(surface.ring),
        )
        .map((surface) => {
          const ring = surface.ring.map(projectGeo);
          return {
            ring,
            minX: Math.min(...ring.map((p) => p.x)),
            maxX: Math.max(...ring.map((p) => p.x)),
            minZ: Math.min(...ring.map((p) => p.z)),
            maxZ: Math.max(...ring.map((p) => p.z)),
          };
        })
        .filter(
          (polygon) =>
            polygon.ring.length >= 3 && polygon.ring.every(finitePoint),
        )
    : [];
  for (const route of routes) {
    const p = positionAt(route.line, route.nearestD, route.side);
    if (parks.some((polygon) => blockedByPolygon(p, polygon, 0)))
      route.context = "park";
  }
  const profiles = [],
    occupied = [];
  const wanted = clamp(Math.floor(max), 0, 32);
  // A first pass spreads residents across different streets. Later passes add
  // neighbours to longer nearby sections, keeping at least 3.6 metres apart.
  const offsets = [0, 9, -11, 23, -27, 38, -43, 51, -56];
  const categories = [
    "DEMO_001",
    "DEMO_002",
    "DEMO_006",
    "DEMO_007",
    "DEMO_008",
    "DEMO_005",
    "DEMO_004",
    "DEMO_003",
  ];
  for (
    let pass = 0;
    pass < offsets.length && profiles.length < wanted;
    pass++
  ) {
    for (let r = 0; r < routes.length && profiles.length < wanted; r++) {
      const route = routes[r];
      const d = clamp(route.nearestD + offsets[pass], route.minD, route.maxD);
      const p = positionAt(route.line, d, route.side);
      if (occupied.some((q) => distance(p, q) < 3.6)) continue;
      const identity = `${route.line.id ?? `${route.line.ps[0].x}:${route.line.ps[0].z}`}:slot-${pass}`;
      let categoryId =
        categories[
          (npcSeed(route.line.id ?? identity) + pass * 3) % categories.length
        ];
      if (
        categoryId === "DEMO_003" &&
        (!route.familyEligible || profiles.length + 3 > wanted)
      )
        categoryId = "DEMO_006";
      if (categoryId === "DEMO_004" && !PEDESTRIAN_KINDS.has(route.line.kind))
        categoryId = "DEMO_006";
      if (categoryId === "DEMO_005" && !route.accessible)
        categoryId = "DEMO_006";
      const base = {
        line: route.line,
        d,
        side: route.side,
        minD: route.minD,
        maxD: route.maxD,
        direction: npcSeed(identity) % 2 ? -1 : 1,
        context: route.context,
        groupId: null,
        groupRole: null,
        groupSize: 1,
      };
      if (categoryId === "DEMO_003") {
        const groupId = `scenic-family:${identity}`,
          formation = [0, -1.9, -3.2];
        const min = route.familySection.minD + 4,
          max = route.familySection.maxD - 4;
        if (max - min < 8) continue;
        const anchor = clamp(d, min, max),
          speed = 0.87 + (npcSeed(groupId) % 14) / 100;
        const members = formation.map((along, member) => {
          const identityProfile = demographicProfile(
            categoryId,
            `${groupId}:${member}`,
            {
              groupRole:
                member === 0
                  ? "stroller-caregiver"
                  : member === 1
                    ? "caregiver"
                    : "child",
              gender:
                member === 2
                  ? "unspecified"
                  : ["woman", "man", "unspecified"][
                      (npcSeed(groupId) + member) % 3
                    ],
              familySpeed: speed,
            },
          );
          return {
            ...base,
            ...identityProfile,
            id: `${groupId}:${member}`,
            groupId,
            groupRole: identityProfile.role,
            groupSize: 3,
            d: anchor + along,
            minD: min + along,
            maxD: max + along,
            moving: true,
            pause: { walk: 26, stop: 3, phase: (npcSeed(groupId) % 290) / 10 },
            elapsed: 0,
          };
        });
        const points = members.map(sampleLocalWalker);
        if (
          points.some((point) => occupied.some((q) => distance(point, q) < 3.6))
        )
          continue;
        profiles.push(...members);
        occupied.push(...points);
      } else {
        const identityProfile = demographicProfile(categoryId, identity, {
          context: route.context,
        });
        const walk = identityProfile.ageBand === "elder" ? 18 : 23;
        const stop =
          identityProfile.role === "visitor"
            ? 5
            : identityProfile.ageBand === "elder"
              ? 4
              : 1.8;
        const profile = {
          ...base,
          ...identityProfile,
          id: `scenic:${identity}`,
          moving: true,
          pause: {
            walk,
            stop,
            phase: ((npcSeed(identity) % 1000) / 1000) * (walk + stop),
          },
          elapsed: 0,
        };
        profiles.push(profile);
        occupied.push(p);
      }
    }
  }
  return profiles;
}

/** O(1) reflection inside the safe nearby section, including a very large time step. */
export function advanceLocalWalker(profile, dt) {
  const span = profile.maxD - profile.minD;
  if (!(span > 0) || !Number.isFinite(dt) || dt <= 0) return profile;
  let walkingTime = dt;
  if (profile.pause) {
    const period = profile.pause.walk + profile.pause.stop;
    const previous = (profile.elapsed || 0) + profile.pause.phase;
    const next = previous + dt;
    const walkingUntil = (t) =>
      Math.floor(t / period) * profile.pause.walk +
      Math.min(t % period, profile.pause.walk);
    walkingTime = Math.max(0, walkingUntil(next) - walkingUntil(previous));
    profile.elapsed = (profile.elapsed || 0) + dt;
    profile.moving = next % period < profile.pause.walk;
  }
  const travelled = Math.max(0, walkingTime) * profile.speed;
  const initial =
    profile.direction < 0
      ? 2 * span - (profile.d - profile.minD)
      : profile.d - profile.minD;
  const phase = (((initial + travelled) % (2 * span)) + 2 * span) % (2 * span);
  profile.direction = phase < span ? 1 : -1;
  profile.d = profile.minD + (phase <= span ? phase : 2 * span - phase);
  return profile;
}

/** Plain coordinates for easy reuse; caller samples terrain at the returned x/z. */
export function sampleLocalWalker(profile) {
  const p = positionAt(profile.line, profile.d, profile.side);
  p.angle += profile.direction < 0 ? Math.PI : 0;
  p.reverse = profile.direction < 0;
  return p;
}
