// Visible, deterministic simulated residents on actual mapped walking routes.
// These are animation profiles, not real people or live location information.
import { demographicProfile, npcSeed } from "./npc-demographics";
/** @typedef {{ id: number|string, ring: ReadonlyArray<ReadonlyArray<number>> }} BuildingFootprint */
/** @typedef {(point: any) => {x: number, z: number}} GeographicProjector */
/** @typedef {{x:number,y:number,z:number,angle:number,distance:number,reverse?:boolean}} WalkerSample */
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

/** @param {WalkerSample} [output] @returns {WalkerSample} */
function positionAt(
  line,
  d,
  side = 0,
  output = { x: 0, y: 0, z: 0, angle: 0, distance: 0 },
) {
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
  output.x = a.x + dx * t - (dz / horizontalLength) * side;
  output.y = (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t;
  output.z = a.z + dz * t + (dx / horizontalLength) * side;
  output.angle = Math.atan2(dx, dz);
  output.distance = at;
  return output;
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

function clearWalkingSections(line, nearestD, side, target, blocked, radius) {
  const min = Math.max(0.7, nearestD - 62),
    max = Math.min(line.length - 0.7, nearestD + 62);
  if (max - min < 8) return [];
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
  const sections = [];
  for (const [a, b] of spans) {
    // Keep a margin from a rejected point so a turning avatar's shoulders stay clear.
    const minD = a + 0.55,
      maxD = b - 0.55,
      d = clamp(nearestD, minD, maxD);
    const p = positionAt(line, d, side),
      delta = distance(p, target);
    const score = delta - Math.min(50, maxD - minD) * 0.035;
    sections.push({ minD, maxD, nearestD: d, side, distance: delta, score });
  }
  return sections.sort((a, b) => a.score - b.score).slice(0, 3);
}

/**
 * Sorted safe route sections close to the camera, rather than the first ways in a chunk.
 * @param {any[]} paths
 * @param {{x: number, z: number}} target
 * @param {BuildingFootprint[]} [buildings]
 * @param {{projectGeo?: GeographicProjector, maxDistance?: number, maxRoutes?: number, reservations?: {x:number,z:number,radius:number}[], waterAt?: (point:any,line:any)=>boolean}} [options]
 */
export function chooseWalkingRoutes(
  paths,
  target,
  buildings = [],
  options = {},
) {
  if (!finitePoint(target)) return [];
  const radius = clamp(options.maxDistance || 125, 25, 180);
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
    // Both carriageway edges get residents. Alternative offsets belong to the
    // same pavement, rather than creating overlapping parallel routes there.
    const sideChoices = pedestrian
      ? width >= 3.6
        ? [[Math.min(0.85, width / 4)], [-Math.min(0.85, width / 4)]]
        : [[0, Math.min(0.35, width * 0.15), -Math.min(0.35, width * 0.15)]]
      : [
          ...(line.sidewalk === "right" ? [] : [[offset, width / 2 + 0.15]]),
          ...(line.sidewalk === "left" ? [] : [[-offset, -(width / 2 + 0.15)]]),
        ];
    const waterBlocked = (point) => Boolean(options.waterAt?.(point, line));
    const blocked = (point) =>
      waterBlocked(point) ||
      buildingBlocked(point) ||
      furnitureBlocked(point, 0.42);
    const sections = [];
    for (const choices of sideChoices) {
      let best = [];
      for (const side of choices) {
        const safe = clearWalkingSections(
          line,
          candidate.d,
          side,
          target,
          blocked,
          radius,
        );
        if (safe.length && (!best.length || safe[0].score < best[0].score))
          best = safe;
      }
      sections.push(...best.slice(0, 2));
    }
    if (!sections.length) continue;
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
    for (const section of sections) {
      const familySection = familyCandidate
        ? clearWalkingSections(
            line,
            section.nearestD,
            section.side,
            target,
            (point) => waterBlocked(point) || strollerBlocked(point),
            radius,
          ).find(
            (safe) =>
              safe.minD >= section.minD - 1 && safe.maxD <= section.maxD + 1,
          )
        : null;
      routes.push({
        line,
        ...section,
        priority: section.distance + (pedestrian ? 0 : 5),
        accessible: gentleRoute(line),
        familyEligible:
          !!familySection && familySection.maxD - familySection.minD >= 18,
        familySection,
        context:
          line.context ||
          (line.kind === "pedestrian" ? "pedestrian-street" : "street"),
      });
    }
  }
  routes.sort(
    (a, b) =>
      a.priority - b.priority ||
      Number(a.line.id || 0) - Number(b.line.id || 0),
  );
  return routes.slice(0, clamp(options.maxRoutes || 48, 1, 72));
}

/**
 * Character options and original-line distances; the renderer owns the meshes.
 * @param {{paths: any[], target: {x: number, z: number}, buildings?: BuildingFootprint[], projectGeo?: GeographicProjector, max?: number, maxDistance?: number, context?: string, waterAt?: (point:any,line:any)=>boolean, surfaces?: {kind:string, ring:ReadonlyArray<ReadonlyArray<number>>}[], reservations?: {x:number,z:number,radius:number}[]}} options
 * @returns {any[]}
 */
export function createLocalWalkerProfiles({
  paths,
  target,
  buildings = [],
  projectGeo,
  max = 64,
  maxDistance = 125,
  context,
  waterAt,
  surfaces = [],
  reservations = [],
}) {
  const routes = chooseWalkingRoutes(paths, target, buildings, {
    projectGeo,
    maxDistance,
    reservations,
    waterAt,
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
    else if (context) route.context = context;
  }
  const profiles = [],
    occupied = [];
  const wanted = clamp(Number.isFinite(max) ? Math.floor(max) : 64, 0, 72);
  // A first pass spreads residents across different streets. Later passes add
  // neighbours to nearby sections. Seeded uneven spacing avoids identical
  // ranks of avatars, while preserving at least 2.2 metres between groups.
  const offsets = [
    0, 4.8, -5.4, 10.3, -11.1, 16.4, -17.6, 23, -24.7, 30.2, -32.1, 38.2, -40.9,
    47.1, -50.3, 57.8, -60,
  ];
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
      const routeId = `${route.line.id ?? `${route.line.ps[0].x}:${route.line.ps[0].z}`}:${route.side.toFixed(2)}:${Math.round(route.minD)}`;
      const identity = `${routeId}:slot-${pass}`;
      const jitter =
        pass === 0 ? 0 : ((npcSeed(identity) % 1000) / 1000 - 0.5) * 1.4;
      const d = clamp(
        route.nearestD + offsets[pass] + jitter,
        route.minD,
        route.maxD,
      );
      const p = positionAt(route.line, d, route.side);
      if (occupied.some((q) => distance(p, q) < 2.2)) continue;
      let categoryId =
        categories[(npcSeed(routeId) + pass * 3) % categories.length];
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
        routeIndex: r,
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
        const points = members.map((member) => sampleLocalWalker(member));
        if (
          points.some((point) => occupied.some((q) => distance(point, q) < 2.2))
        )
          continue;
        profiles.push(...members);
        occupied.push(...points);
      } else {
        const identityProfile = demographicProfile(categoryId, identity, {
          context: route.context,
        });
        const walk =
          (identityProfile.ageBand === "elder"
            ? 16
            : identityProfile.role === "commuter"
              ? 28
              : 20) +
          (npcSeed(identity) % 8);
        const stop =
          identityProfile.role === "visitor"
            ? 5
            : identityProfile.ageBand === "elder"
              ? 4
              : identityProfile.role === "shopper"
                ? 3.6
                : 1.2 + (npcSeed(`${identity}:stop`) % 15) / 10;
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
        // Visitors and local shoppers often travel with a companion. A shared
        // pavement interval and pause clock keeps their formation together.
        const companionEligible =
          ["visitor", "neighbour", "shopper"].includes(profile.role) &&
          profile.ageBand === "adult" &&
          profiles.length + 2 <= wanted &&
          npcSeed(`${identity}:companion`) % 4 === 0 &&
          route.maxD - route.minD >= 16;
        if (companionEligible) {
          const along = -1.55;
          const anchor = clamp(d, route.minD + 2, route.maxD - 2);
          const companionD = anchor + along;
          const companionPoint = positionAt(route.line, companionD, route.side);
          const anchorPoint = positionAt(route.line, anchor, route.side);
          if (
            !occupied.some(
              (q) =>
                distance(companionPoint, q) < 2.2 ||
                distance(anchorPoint, q) < 2.2,
            )
          ) {
            const groupId = `scenic-companions:${identity}`;
            const companionIdentity = demographicProfile(
              categoryId,
              `${identity}:companion`,
              {
                context: route.context,
                role: profile.role,
              },
            );
            const shared = {
              minD: route.minD + 2,
              maxD: route.maxD - 2,
              groupId,
              groupSize: 2,
            };
            profiles.push(
              { ...profile, ...shared, d: anchor, groupRole: "companion" },
              {
                ...profile,
                ...companionIdentity,
                ...shared,
                id: `scenic:${identity}:companion`,
                groupRole: "companion",
                d: companionD,
                minD: shared.minD + along,
                maxD: shared.maxD + along,
                speed: profile.speed,
                pace: profile.pace,
              },
            );
            occupied.push(anchorPoint, companionPoint);
            continue;
          }
        }
        profiles.push(profile);
        occupied.push(p);
      }
    }
  }
  const network = createWalkingNetwork(routes, {
    target,
    buildings,
    projectGeo,
    reservations,
    waterAt,
    maxDistance,
  });
  for (const profile of profiles) {
    if (profile.groupId) {
      // Groups pause and turn together at the safe section limits, rather than
      // flipping their bodies through 180 degrees in a single animation frame.
      profile.groupJourney = {
        turnSeconds: 1.4,
        clock: null,
        facing: profile.direction < 0 ? Math.PI : 0,
      };
    } else {
      const current = positionAt(profile.line, profile.d, profile.side);
      profile.journey = {
        network,
        routeIndex: profile.routeIndex,
        leg: 0,
        goal: profile.direction > 0 ? profile.maxD : profile.minD,
        rest: 0,
        connector: null,
        facing: current.angle + (profile.direction < 0 ? Math.PI : 0),
        turning: null,
      };
    }
  }
  return profiles;
}

/** Only join already validated walking sections when every point of the short
 * connector stays clear of buildings, street furniture, water and carriageways.
 * This is a local simulation graph, not a city-wide routing service.
 * @param {any[]} routes
 * @param {{target?:{x:number,z:number},buildings?:BuildingFootprint[],projectGeo?:GeographicProjector,reservations?:{x:number,z:number,radius:number}[],waterAt?:(point:any,line:any)=>boolean,maxDistance?:number}} [options]
 * @returns {{routes:any[],connections:any[]}}
 */
export function createWalkingNetwork(
  routes,
  {
    target,
    buildings = [],
    projectGeo,
    reservations = [],
    waterAt,
    maxDistance = 125,
  } = {},
) {
  const network = {
    routes,
    connections: routes.map(() => ({ min: [], max: [] })),
  };
  if (!finitePoint(target)) return network;
  const buildingBlocked = buildingAvoidance(
    buildings,
    target,
    projectGeo,
    maxDistance + 12,
    0.48,
  );
  const carriages = [
    ...new Set(
      routes
        .filter((route) => !PEDESTRIAN_KINDS.has(route.line.kind))
        .map((route) => route.line),
    ),
  ];
  const blocked = (point, a, b) => {
    if (
      distance(point, target) > maxDistance ||
      buildingBlocked(point) ||
      waterAt?.(point, a.line) ||
      waterAt?.(point, b.line) ||
      reservations.some(
        (circle) =>
          finitePoint(circle) && distance(point, circle) < circle.radius + 0.48,
      )
    )
      return true;
    // A connector is not permission to cut across an unmarked traffic lane.
    for (const line of carriages)
      for (let i = 1; i < line.ps.length; i++) {
        if (
          segmentDistance(point, line.ps[i - 1], line.ps[i]) <
          line.width / 2 + 0.08
        )
          return true;
      }
    return false;
  };
  for (let i = 0; i < routes.length; i++)
    for (let j = 0; j < i; j++) {
      const a = routes[i],
        b = routes[j];
      if (
        Math.abs((a.line.layer || 0) - (b.line.layer || 0)) > 0 ||
        !!a.line.bridge !== !!b.line.bridge
      )
        continue;
      for (const ae of ["min", "max"])
        for (const be of ["min", "max"]) {
          const start = positionAt(
              a.line,
              ae === "min" ? a.minD : a.maxD,
              a.side,
            ),
            end = positionAt(b.line, be === "min" ? b.minD : b.maxD, b.side);
          const gap = distance(start, end);
          if (gap < 0.45 || gap > 5.5 || Math.abs(start.y - end.y) > 0.5)
            continue;
          const count = Math.max(2, Math.ceil(gap / 0.25));
          let clear = true;
          for (let n = 0; n <= count; n++) {
            const t = n / count,
              point = {
                x: start.x + (end.x - start.x) * t,
                z: start.z + (end.z - start.z) * t,
              };
            if (blocked(point, a, b)) {
              clear = false;
              break;
            }
          }
          if (!clear) continue;
          network.connections[i][ae].push({
            routeIndex: j,
            end: be,
            length: gap,
            start,
            endPoint: end,
          });
          network.connections[j][be].push({
            routeIndex: i,
            end: ae,
            length: gap,
            start: end,
            endPoint: start,
          });
        }
    }
  return network;
}

const shortestTurn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function faceJourney(profile, angle) {
  const journey = profile.journey,
    delta = shortestTurn(journey.facing, angle);
  if (Math.abs(delta) > 0.12)
    journey.turning = {
      from: journey.facing,
      to: journey.facing + delta,
      elapsed: 0,
      duration: Math.max(0.35, Math.abs(delta) * 0.36),
    };
  else journey.facing = angle;
}
function chooseNextWalkingGoal(profile) {
  const journey = profile.journey,
    network = journey.network,
    route = network.routes[journey.routeIndex];
  const atEnd =
    Math.abs(profile.d - profile.minD) < 0.001
      ? "min"
      : Math.abs(profile.d - profile.maxD) < 0.001
        ? "max"
        : null;
  const connections = atEnd
    ? network.connections[journey.routeIndex][atEnd]
    : [];
  const choice = npcSeed(`${profile.id}:journey:${journey.leg++}`);
  if (connections.length && choice % 4 !== 0) {
    const connection = connections[choice % connections.length];
    journey.connector = { ...connection, progress: 0 };
    faceJourney(
      profile,
      Math.atan2(
        connection.endPoint.x - connection.start.x,
        connection.endPoint.z - connection.start.z,
      ),
    );
    return;
  }
  // Browsing residents stop at shopfronts/lookouts as well as street ends.
  // Commuters generally cross the whole section, while visitors wander between
  // several destinations. The next goal is deterministic but changes per visit.
  const span = profile.maxD - profile.minD;
  const fractions =
    profile.role === "commuter" ? [0, 1] : [0, 0.24, 0.53, 0.79, 1];
  let fraction = fractions[choice % fractions.length];
  if (
    Math.abs(profile.minD + span * fraction - profile.d) <
    Math.min(4, span * 0.22)
  )
    fraction = profile.d > (profile.minD + profile.maxD) / 2 ? 0 : 1;
  journey.goal = profile.minD + span * fraction;
  profile.direction = journey.goal > profile.d ? 1 : -1;
  faceJourney(
    profile,
    positionAt(route.line, profile.d, route.side).angle +
      (profile.direction < 0 ? Math.PI : 0),
  );
}

function advanceWalkingJourney(profile, seconds) {
  const journey = profile.journey;
  // Long browser suspensions do not produce millions of destination visits.
  let left = seconds > 600 ? seconds % 600 : seconds,
    events = 0;
  while (left > 1e-8 && events++ < 2048) {
    if (journey.rest > 0) {
      const used = Math.min(left, journey.rest);
      journey.rest -= used;
      left -= used;
      profile.moving = false;
      if (journey.rest <= 1e-8) chooseNextWalkingGoal(profile);
      continue;
    }
    if (journey.turning) {
      const turn = journey.turning,
        used = Math.min(left, turn.duration - turn.elapsed);
      turn.elapsed += used;
      left -= used;
      const t = clamp(turn.elapsed / turn.duration, 0, 1),
        ease = t * t * (3 - 2 * t);
      journey.facing = turn.from + (turn.to - turn.from) * ease;
      profile.moving = false;
      if (turn.elapsed >= turn.duration - 1e-8) {
        journey.facing = turn.to;
        journey.turning = null;
      }
      continue;
    }
    if (journey.connector) {
      const connector = journey.connector,
        needed = (connector.length - connector.progress) / profile.speed,
        used = Math.min(left, needed);
      connector.progress += used * profile.speed;
      left -= used;
      profile.moving = true;
      if (connector.progress >= connector.length - 1e-8) {
        journey.routeIndex = connector.routeIndex;
        const route = journey.network.routes[journey.routeIndex];
        profile.line = route.line;
        profile.side = route.side;
        profile.minD = route.minD;
        profile.maxD = route.maxD;
        profile.d = connector.end === "min" ? profile.minD : profile.maxD;
        profile.context = route.context;
        journey.connector = null;
        journey.goal = connector.end === "min" ? profile.maxD : profile.minD;
        profile.direction = connector.end === "min" ? 1 : -1;
        faceJourney(
          profile,
          positionAt(profile.line, profile.d, profile.side).angle +
            (profile.direction < 0 ? Math.PI : 0),
        );
      }
      continue;
    }
    const gap = Math.abs(journey.goal - profile.d),
      used = Math.min(left, gap / profile.speed);
    profile.d = clamp(
      profile.d + profile.direction * used * profile.speed,
      profile.minD,
      profile.maxD,
    );
    left -= used;
    journey.facing =
      positionAt(profile.line, profile.d, profile.side).angle +
      (profile.direction < 0 ? Math.PI : 0);
    profile.moving = true;
    if (Math.abs(journey.goal - profile.d) < 1e-7) {
      profile.d = journey.goal;
      journey.rest =
        (profile.role === "visitor"
          ? 3.1
          : profile.ageBand === "elder"
            ? 2.8
            : profile.role === "shopper"
              ? 2.4
              : 1.0) +
        (npcSeed(`${profile.id}:rest:${journey.leg}`) % 11) / 10;
      profile.moving = false;
    }
  }
}

function walkingTimeUntil(time, walk, period) {
  return Math.floor(time / period) * walk + Math.min(time % period, walk);
}

/** Destination-led journeys and formation-safe group pauses/turns. Legacy
 * externally supplied profiles without a journey retain their bounded sampler.
 */
export function advanceLocalWalker(profile, dt) {
  const span = profile.maxD - profile.minD;
  if (!(span > 0) || !Number.isFinite(dt) || dt <= 0) return profile;
  let walkingTime = dt;
  if (profile.pause) {
    const period = profile.pause.walk + profile.pause.stop;
    const previous = (profile.elapsed || 0) + profile.pause.phase;
    const next = previous + dt;
    walkingTime = Math.max(
      0,
      walkingTimeUntil(next, profile.pause.walk, period) -
        walkingTimeUntil(previous, profile.pause.walk, period),
    );
    profile.elapsed = (profile.elapsed || 0) + dt;
    profile.moving = next % period < profile.pause.walk;
  }
  const authoredMoving = profile.moving !== false;
  if (profile.journey) {
    advanceWalkingJourney(profile, walkingTime);
    if (!authoredMoving) profile.moving = false;
    return profile;
  }
  if (profile.groupJourney) {
    const journey = profile.groupJourney,
      travel = span / profile.speed,
      turn = journey.turnSeconds,
      cycle = 2 * (travel + turn);
    if (journey.clock === null)
      journey.clock =
        profile.direction > 0
          ? (profile.d - profile.minD) / profile.speed
          : travel + turn + (profile.maxD - profile.d) / profile.speed;
    journey.clock += walkingTime;
    const phase = ((journey.clock % cycle) + cycle) % cycle;
    if (phase < travel) {
      profile.d = profile.minD + phase * profile.speed;
      profile.direction = 1;
      journey.facing = 0;
      profile.moving = authoredMoving;
    } else if (phase < travel + turn) {
      const t = (phase - travel) / turn;
      profile.d = profile.maxD;
      profile.direction = 1;
      journey.facing = Math.PI * t * t * (3 - 2 * t);
      profile.moving = false;
    } else if (phase < 2 * travel + turn) {
      profile.d = profile.maxD - (phase - travel - turn) * profile.speed;
      profile.direction = -1;
      journey.facing = Math.PI;
      profile.moving = authoredMoving;
    } else {
      const t = (phase - 2 * travel - turn) / turn;
      profile.d = profile.minD;
      profile.direction = -1;
      journey.facing = Math.PI + Math.PI * t * t * (3 - 2 * t);
      profile.moving = false;
    }
    return profile;
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

/**
 * Plain coordinates for easy reuse; caller samples terrain at the returned x/z.
 * @param {any} profile
 * @param {WalkerSample} [output]
 * @returns {WalkerSample}
 */
export function sampleLocalWalker(profile, output) {
  const p = positionAt(profile.line, profile.d, profile.side, output);
  if (profile.journey) {
    const connector = profile.journey.connector;
    if (connector) {
      const t = clamp(connector.progress / connector.length, 0, 1);
      p.x = connector.start.x + (connector.endPoint.x - connector.start.x) * t;
      p.y = connector.start.y + (connector.endPoint.y - connector.start.y) * t;
      p.z = connector.start.z + (connector.endPoint.z - connector.start.z) * t;
    }
    p.angle = profile.journey.facing;
  } else
    p.angle += profile.groupJourney
      ? profile.groupJourney.facing
      : profile.direction < 0
        ? Math.PI
        : 0;
  p.reverse = profile.direction < 0;
  return p;
}
