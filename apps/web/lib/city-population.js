// Visible, deterministic simulated residents on actual mapped walking routes.
// These are animation profiles, not real people or live location information.
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
const SHIRTS = [
  "#c28559",
  "#527b7c",
  "#c55f50",
  "#ece4c9",
  "#827294",
  "#608968",
  "#d3b049",
];
const SKINS = [
  "#c3926d",
  "#77523b",
  "#d9b596",
  "#a67552",
  "#573c2e",
  "#ba8b67",
];
const STYLES = ["casual", "jacket", "dress", "tourist"];
const HAIR = ["short", "curly", "bob", "bun"];
// Original fictional first names for the explicitly simulated local characters.
const NAMES = [
  "Inês",
  "Duarte",
  "Marta",
  "Tiago",
  "Leonor",
  "Rafael",
  "Amélia",
  "João",
  "Clara",
  "Tomás",
  "Sara",
  "André",
  "Lúcia",
  "Miguel",
  "Ana",
  "Bruno",
  "Carolina",
  "David",
  "Beatriz",
  "Nuno",
  "Rita",
  "Gonçalo",
  "Helena",
  "Luís",
  "Mariana",
  "Pedro",
  "Sofia",
  "Diogo",
  "Teresa",
  "Ricardo",
  "Matilde",
  "Vasco",
];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function usableLine(line) {
  return (
    WALK_KINDS.has(line.kind) &&
    line.length > 8 &&
    Array.isArray(line.ps) &&
    line.ps.length >= 2 &&
    line.ps.every(finitePoint) &&
    Array.isArray(line.lengths) &&
    line.lengths.length === line.ps.length &&
    line.lengths.every(Number.isFinite)
  );
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

function buildingAvoidance(buildings, target, projectGeo, radius) {
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
    const x0 = Math.floor(Math.max(minX - 1, target.x - radius) / cell);
    const x1 = Math.floor(Math.min(maxX + 1, target.x + radius) / cell);
    const z0 = Math.floor(Math.max(minZ - 1, target.z - radius) / cell);
    const z1 = Math.floor(Math.min(maxZ + 1, target.z + radius) / cell);
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
    ).some((polygon) => blockedByPolygon(point, polygon));
}

function clearWalkingSection(line, nearestD, side, target, blocked, radius) {
  const min = Math.max(0.7, nearestD - 62),
    max = Math.min(line.length - 0.7, nearestD + 62);
  if (max - min < 8) return null;
  const count = Math.max(2, Math.ceil((max - min) / 2.2)),
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
 * @param {{projectGeo?: GeographicProjector, maxDistance?: number, maxRoutes?: number}} [options]
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
  const blocked = buildingAvoidance(
    buildings,
    target,
    options.projectGeo,
    radius + 12,
  );
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
    routes.push({
      line,
      ...section,
      priority: section.distance + (pedestrian ? 0 : 7),
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
 * @param {{paths: any[], target: {x: number, z: number}, buildings?: BuildingFootprint[], projectGeo?: GeographicProjector, max?: number, maxDistance?: number}} options
 */
export function createLocalWalkerProfiles({
  paths,
  target,
  buildings = [],
  projectGeo,
  max = 28,
  maxDistance = 110,
}) {
  const routes = chooseWalkingRoutes(paths, target, buildings, {
    projectGeo,
    maxDistance,
  });
  const profiles = [],
    occupied = [];
  const wanted = clamp(Math.floor(max), 0, 32);
  // A first pass spreads residents across different streets. Later passes add
  // neighbours to longer nearby sections, keeping at least 3.6 metres apart.
  const offsets = [0, 9, -11, 23, -27, 38, -43, 51, -56];
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
      const i = profiles.length;
      const seed = Math.abs(Number(route.line.id) || r);
      profiles.push({
        line: route.line,
        d,
        side: route.side,
        minD: route.minD,
        maxD: route.maxD,
        direction: (i + seed) % 2 ? -1 : 1,
        speed: 0.92 + (i % 5) * 0.1,
        phase: i * 0.73,
        name: NAMES[i % NAMES.length],
        label: [
          "Neighbour · walking",
          "Local · strolling",
          "Commuter · walking",
          "Visitor · exploring",
        ][i % 4],
        simulated: true,
        character: {
          shirt: SHIRTS[i % SHIRTS.length],
          skin: SKINS[(i + seed) % SKINS.length],
          style: STYLES[i % STYLES.length],
          hairStyle: HAIR[(i + seed) % HAIR.length],
          hair: ["#302823", "#513c2e", "#4b443d", "#8a8074"][i % 4],
          trousers: ["#344750", "#574b43", "#465b4d", "#c8bea4"][i % 4],
          phase: i * 0.73,
        },
      });
      occupied.push(p);
    }
  }
  return profiles;
}

/** O(1) reflection inside the safe nearby section, including a very large time step. */
export function advanceLocalWalker(profile, dt) {
  const span = profile.maxD - profile.minD;
  if (!(span > 0) || !Number.isFinite(dt) || dt <= 0) return profile;
  const travelled = Math.max(0, dt) * profile.speed;
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
