// Ground-plane navigation for mapped city geometry. The renderer owns the
// meshes; this world indexes footprints, furniture and tree trunks only.
const EPSILON = 1e-7;
const CELL = 16;
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
  "primary",
  "service",
]);
const PEDESTRIAN_KINDS = new Set(["footway", "pedestrian", "path", "steps"]);
const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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

function segmentDistanceSquared(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(
    ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  );
  return (p.x - a.x - dx * t) ** 2 + (p.z - a.z - dz * t) ** 2;
}

function polygonBlocked(p, shape, radius) {
  if (
    p.x < shape.minX - radius ||
    p.x > shape.maxX + radius ||
    p.z < shape.minZ - radius ||
    p.z > shape.maxZ + radius
  )
    return false;
  if (inside(p, shape.ring) && !shape.holes.some((hole) => inside(p, hole)))
    return true;
  const squared = radius * radius;
  for (const edge of shape.edges)
    if (segmentDistanceSquared(p, edge.a, edge.b) < squared - EPSILON)
      return true;
  return false;
}

function indexShape(grid, shape, bounds) {
  const minX = Math.floor(Math.max(shape.minX - 2, bounds.minX) / CELL);
  const maxX = Math.floor(Math.min(shape.maxX + 2, bounds.maxX) / CELL);
  const minZ = Math.floor(Math.max(shape.minZ - 2, bounds.minZ) / CELL);
  const maxZ = Math.floor(Math.min(shape.maxZ + 2, bounds.maxZ) / CELL);
  for (let x = minX; x <= maxX; x++)
    for (let z = minZ; z <= maxZ; z++) {
      const key = `${x}:${z}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(shape);
    }
}

function readRing(ring, projectGeo) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const points = [];
  for (const raw of ring) {
    const p = Array.isArray(raw) ? projectGeo?.(raw) : raw;
    if (!finite(p)) return null;
    if (!points.length || distance(points[points.length - 1], p) > EPSILON)
      points.push({ x: p.x, z: p.z });
  }
  if (
    points.length > 3 &&
    distance(points[0], points[points.length - 1]) < EPSILON
  )
    points.pop();
  return points.length >= 3 ? points : null;
}

function footprintKey(ring) {
  const points = ring.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`);
  let first = 0;
  for (let i = 1; i < points.length; i++)
    if (points[i] < points[first]) first = i;
  const forward = points
    .map((_, i) => points[(first + i) % points.length])
    .join(";");
  const backward = points
    .map((_, i) => points[(first - i + points.length) % points.length])
    .join(";");
  return forward < backward ? forward : backward;
}

/**
 * Build once when mapped chunks/furniture change, never once per animation frame.
 * `trees` are trunk/base circles, not canopy spheres. `waterAt` receives the
 * owning bridge line when a sample is on a mapped walking bridge.
 * @param {{buildings?:any[],projectGeo?:(p:any)=>{x:number,z:number},reservations?:any[],trees?:any[],waterAt?:(p:any,line?:any)=>boolean,elevationAt?:(p:any)=>number,paths?:any[],target?:{x:number,z:number},radius?:number}} [options]
 */
export function createNavigationWorld(options = {}) {
  const center = finite(options.target) ? options.target : { x: 0, z: 0 };
  const radius = clamp(
    Number.isFinite(options.radius) ? options.radius : 360,
    20,
    700,
  );
  const bounds = {
    minX: center.x - radius,
    maxX: center.x + radius,
    minZ: center.z - radius,
    maxZ: center.z + radius,
  };
  const grid = new Map(),
    pathGrid = new Map(),
    bridgeGrid = new Map();
  const shapes = [],
    seen = new Set();
  for (const building of options.buildings || []) {
    if (!building) continue;
    const ring = readRing(building.ring, options.projectGeo);
    if (!ring) continue;
    const holes = (building.holes || [])
      .map((hole) => readRing(hole, options.projectGeo))
      .filter(Boolean);
    // Multipolygon relation parts can share an OSM ID. Deduplicate the actual
    // footprint, including courtyards, rather than silently dropping its wings.
    const geometryKey = `${building.id ?? "anonymous"}:${footprintKey(ring)}:${holes.map(footprintKey).sort().join("|")}`;
    if (seen.has(geometryKey)) continue;
    seen.add(geometryKey);
    const shape = {
      kind: "polygon",
      id: building.id,
      ring,
      holes,
      minX: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxZ: -Infinity,
      edges: [],
      base: 0,
      height: 10,
    };
    for (const p of ring) {
      shape.minX = Math.min(shape.minX, p.x);
      shape.maxX = Math.max(shape.maxX, p.x);
      shape.minZ = Math.min(shape.minZ, p.z);
      shape.maxZ = Math.max(shape.maxZ, p.z);
    }
    if (
      shape.maxX < bounds.minX ||
      shape.minX > bounds.maxX ||
      shape.maxZ < bounds.minZ ||
      shape.minZ > bounds.maxZ
    )
      continue;
    for (const boundary of [ring, ...holes])
      for (let i = 0; i < boundary.length; i++)
        shape.edges.push({
          a: boundary[i],
          b: boundary[(i + 1) % boundary.length],
        });
    // The rendered walls span the lowest footprint corner to the highest
    // corner plus the mapped height. A first-vertex sample depends on ring
    // winding and leaves either the downhill facade or uphill roof unguarded.
    const ground = ring
      .map((point) => options.elevationAt?.(point))
      .filter(Number.isFinite);
    shape.base = ground.length ? Math.min(...ground) : 0;
    const height = Number(building.height);
    shape.height =
      (ground.length ? Math.max(...ground) - shape.base : 0) +
      (Number.isFinite(height) && height > 0 ? clamp(height, 1, 200) : 10);
    shapes.push(shape);
    indexShape(grid, shape, bounds);
  }
  for (const [kind, records] of [
    ["furniture", options.reservations],
    ["tree", options.trees],
  ]) {
    for (const circle of (records || []).slice(0, 4096)) {
      if (
        !finite(circle) ||
        !Number.isFinite(circle.radius) ||
        circle.radius <= 0
      )
        continue;
      const r = clamp(circle.radius, 0.05, 30);
      const shape = {
        kind: "circle",
        type: kind,
        id: circle.id,
        x: circle.x,
        z: circle.z,
        radius: r,
        minX: circle.x - r,
        maxX: circle.x + r,
        minZ: circle.z - r,
        maxZ: circle.z + r,
        base: Number(circle.y) || options.elevationAt?.(circle) || 0,
        height: Number(circle.height) || (kind === "tree" ? 5 : 1.2),
      };
      if (
        shape.maxX < bounds.minX ||
        shape.minX > bounds.maxX ||
        shape.maxZ < bounds.minZ ||
        shape.minZ > bounds.maxZ
      )
        continue;
      shapes.push(shape);
      indexShape(grid, shape, bounds);
    }
  }
  const sources = new Map();
  for (const line of options.paths || []) {
    if (
      !line ||
      !WALK_KINDS.has(line.kind) ||
      ["no", "private"].includes(line.foot) ||
      line.sidewalk === "no" ||
      !Array.isArray(line.ps) ||
      line.ps.length < 2 ||
      !line.ps.every(finite)
    )
      continue;
    const key = line.id ?? line;
    const previous = sources.get(key);
    if (
      !previous ||
      (previous.owner === "overview" && line.owner !== "overview")
    )
      sources.set(key, line);
  }
  let pathCount = 0;
  for (const line of sources.values()) {
    const width = Number.isFinite(line.width) ? clamp(line.width, 0.5, 30) : 4;
    const pedestrian = PEDESTRIAN_KINDS.has(line.kind);
    const sides = pedestrian
      ? [0]
      : [
          ...(line.sidewalk === "right" ? [] : [width / 2 + 0.5]),
          ...(line.sidewalk === "left" ? [] : [-width / 2 - 0.5]),
        ];
    for (let i = 1; i < line.ps.length; i++) {
      const a = line.ps[i - 1],
        b = line.ps[i];
      const length = distance(a, b);
      if (length < 0.01) continue;
      for (const side of sides) {
        const dx = (b.x - a.x) / length,
          dz = (b.z - a.z) / length;
        const segment = {
          a: { x: a.x - dz * side, z: a.z + dx * side },
          b: { x: b.x - dz * side, z: b.z + dx * side },
          line,
          width: pedestrian ? width : 1.4,
          minX: 0,
          maxX: 0,
          minZ: 0,
          maxZ: 0,
        };
        segment.minX = Math.min(segment.a.x, segment.b.x) - 4;
        segment.maxX = Math.max(segment.a.x, segment.b.x) + 4;
        segment.minZ = Math.min(segment.a.z, segment.b.z) - 4;
        segment.maxZ = Math.max(segment.a.z, segment.b.z) + 4;
        if (
          segment.maxX < bounds.minX ||
          segment.minX > bounds.maxX ||
          segment.maxZ < bounds.minZ ||
          segment.minZ > bounds.maxZ
        )
          continue;
        indexShape(pathGrid, segment, bounds);
        pathCount++;
      }
      if (line.bridge) {
        const bridge = {
          a,
          b,
          line,
          width,
          minX: Math.min(a.x, b.x) - width,
          maxX: Math.max(a.x, b.x) + width,
          minZ: Math.min(a.z, b.z) - width,
          maxZ: Math.max(a.z, b.z) + width,
        };
        indexShape(bridgeGrid, bridge, bounds);
      }
    }
  }
  const world = {
    bounds,
    shapes,
    pathCount,
    _grid: grid,
    _pathGrid: pathGrid,
    _bridgeGrid: bridgeGrid,
    _candidates: [],
    _seen: new Set(),
    _hit: { time: 1, nx: 0, nz: 0 },
    _waterPoint: { x: 0, z: 0 },
    _sweepPoint: { x: 0, z: 0 },
    _cameraHit: { time: 1, nx: 0, nz: 0 },
    _motion: { x: 0, z: 0, dx: 0, dz: 0 },
    _waterAt: typeof options.waterAt === "function" ? options.waterAt : null,
    _elevationAt:
      typeof options.elevationAt === "function" ? options.elevationAt : null,
    blocked(point, padding = 0.42) {
      return !navigationPointIsClear(world, point, padding);
    },
  };
  return world;
}

function query(world, minX, maxX, minZ, maxZ) {
  const result = world._candidates;
  result.length = 0;
  world._seen.clear();
  // Requests beyond the cached local world never trigger an unbounded grid scan.
  minX = Math.max(minX, world.bounds.minX);
  maxX = Math.min(maxX, world.bounds.maxX);
  minZ = Math.max(minZ, world.bounds.minZ);
  maxZ = Math.min(maxZ, world.bounds.maxZ);
  for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++)
    for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
      for (const shape of world._grid.get(`${x}:${z}`) || []) {
        if (world._seen.has(shape)) continue;
        world._seen.add(shape);
        result.push(shape);
      }
    }
  return result;
}

function rawWaterBlocked(world, p) {
  if (!world._waterAt) return false;
  const bridges =
    world._bridgeGrid.get(
      `${Math.floor(p.x / CELL)}:${Math.floor(p.z / CELL)}`,
    ) || [];
  for (const bridge of bridges)
    if (
      segmentDistanceSquared(p, bridge.a, bridge.b) <=
      (bridge.width / 2) ** 2
    )
      return false;
  return Boolean(world._waterAt(p));
}

function waterBlocked(world, p, padding) {
  if (!world._waterAt) return false;
  if (rawWaterBlocked(world, p)) return true;
  const sample = world._waterPoint;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    sample.x = p.x + Math.cos(angle) * padding;
    sample.z = p.z + Math.sin(angle) * padding;
    if (rawWaterBlocked(world, sample)) return true;
  }
  return false;
}

/** Check the whole shoulder capsule, including courtyard boundaries and shoreline. */
export function navigationPointIsClear(world, point, radius = 0.42) {
  if (!world || !finite(point) || !Number.isFinite(radius) || radius < 0)
    return false;
  const b = world.bounds;
  if (
    point.x < b.minX + radius ||
    point.x > b.maxX - radius ||
    point.z < b.minZ + radius ||
    point.z > b.maxZ - radius
  )
    return false;
  for (const shape of query(
    world,
    point.x - radius,
    point.x + radius,
    point.z - radius,
    point.z + radius,
  )) {
    if (shape.kind === "circle") {
      if (distance(point, shape) < shape.radius + radius - EPSILON)
        return false;
    } else if (polygonBlocked(point, shape, radius)) return false;
  }
  return !waterBlocked(world, point, radius);
}

function considerHit(hit, time, nx, nz) {
  if (time < -EPSILON || time > hit.time || time > 1 + EPSILON) return;
  const length = Math.hypot(nx, nz);
  if (length < EPSILON) return;
  hit.time = Math.max(0, time);
  hit.nx = nx / length;
  hit.nz = nz / length;
}

function sweepCircle(hit, p, dx, dz, circle, radius, allowEscape = true) {
  const ox = p.x - circle.x,
    oz = p.z - circle.z;
  const r = radius + (circle.radius || 0);
  const c = ox * ox + oz * oz - r * r;
  const approach = ox * dx + oz * dz;
  if (c < -EPSILON) {
    if (allowEscape && (approach > EPSILON || ox * ox + oz * oz < EPSILON))
      return;
    considerHit(hit, 0, ox || -dx, oz || -dz);
    return;
  }
  const a = dx * dx + dz * dz;
  if (a < EPSILON || approach >= 0) return;
  const discriminant = approach * approach - a * c;
  if (discriminant < 0) return;
  const time = (-approach - Math.sqrt(discriminant)) / a;
  considerHit(hit, time, ox + dx * time, oz + dz * time);
}

function sweepEdge(hit, p, dx, dz, edge, radius) {
  const ex = edge.b.x - edge.a.x,
    ez = edge.b.z - edge.a.z;
  const length = Math.hypot(ex, ez);
  if (length < EPSILON) return;
  const tx = ex / length,
    tz = ez / length,
    nx = -tz,
    nz = tx;
  const signed = (p.x - edge.a.x) * nx + (p.z - edge.a.z) * nz;
  const vn = dx * nx + dz * nz;
  const alongStart = (p.x - edge.a.x) * tx + (p.z - edge.a.z) * tz;
  if (
    alongStart >= 0 &&
    alongStart <= length &&
    Math.abs(signed) < radius - EPSILON &&
    signed * vn < 0
  )
    considerHit(hit, 0, nx * Math.sign(signed), nz * Math.sign(signed));
  for (const side of [-1, 1]) {
    if (side * vn >= -EPSILON) continue;
    const time = (side * radius - signed) / vn;
    const along =
      (p.x + dx * time - edge.a.x) * tx + (p.z + dz * time - edge.a.z) * tz;
    if (along >= 0 && along <= length)
      considerHit(hit, time, nx * side, nz * side);
  }
  sweepCircle(hit, p, dx, dz, { x: edge.a.x, z: edge.a.z, radius: 0 }, radius);
  sweepCircle(hit, p, dx, dz, { x: edge.b.x, z: edge.b.z, radius: 0 }, radius);
}

function sweep(world, p, dx, dz, radius, dynamic = [], ignoreId) {
  const hit = world._hit;
  hit.time = 1;
  hit.nx = hit.nz = 0;
  for (const shape of query(
    world,
    Math.min(p.x, p.x + dx) - radius,
    Math.max(p.x, p.x + dx) + radius,
    Math.min(p.z, p.z + dz) - radius,
    Math.max(p.z, p.z + dz) + radius,
  )) {
    if (shape.kind === "circle")
      sweepCircle(hit, p, dx, dz, shape, radius, false);
    else {
      if (inside(p, shape.ring) && !shape.holes.some((hole) => inside(p, hole)))
        considerHit(hit, 0, -dx, -dz);
      else
        for (const edge of shape.edges) sweepEdge(hit, p, dx, dz, edge, radius);
    }
  }
  for (let i = 0; i < Math.min(256, dynamic.length); i++) {
    const actor = dynamic[i];
    const point = actor?.position || actor;
    if (!finite(point) || (ignoreId != null && actor?.id === ignoreId))
      continue;
    // People on an overpass or a different floor are not ground-level blockers.
    if (
      Number.isFinite(p.y) &&
      Number.isFinite(point.y) &&
      Math.abs(p.y - point.y) > 2.2
    )
      continue;
    const r = Number.isFinite(actor.radius)
      ? clamp(actor.radius, 0.1, 3)
      : 0.42;
    sweepCircle(hit, p, dx, dz, { x: point.x, z: point.z, radius: r }, radius);
  }
  const b = world.bounds;
  if (dx > 0 && p.x + dx > b.maxX - radius)
    considerHit(hit, (b.maxX - radius - p.x) / dx, -1, 0);
  if (dx < 0 && p.x + dx < b.minX + radius)
    considerHit(hit, (b.minX + radius - p.x) / dx, 1, 0);
  if (dz > 0 && p.z + dz > b.maxZ - radius)
    considerHit(hit, (b.maxZ - radius - p.z) / dz, 0, -1);
  if (dz < 0 && p.z + dz < b.minZ + radius)
    considerHit(hit, (b.minZ + radius - p.z) / dz, 0, 1);
  if (world._waterAt) {
    const count = Math.min(
      512,
      Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2)),
    );
    const sample = world._sweepPoint;
    sample.x = p.x;
    sample.z = p.z;
    let previous = 0;
    for (let i = 1; i <= count; i++) {
      const time = i / count;
      if (time > hit.time) break;
      sample.x = p.x + dx * time;
      sample.z = p.z + dz * time;
      if (waterBlocked(world, sample, radius)) {
        let low = previous,
          high = time;
        for (let step = 0; step < 12; step++) {
          const middle = (low + high) / 2;
          sample.x = p.x + dx * middle;
          sample.z = p.z + dz * middle;
          if (waterBlocked(world, sample, radius)) high = middle;
          else low = middle;
        }
        sample.x = p.x + dx * high;
        sample.z = p.z + dz * high;
        const x = sample.x,
          z = sample.z;
        sample.x = x - 0.12;
        const left = waterBlocked(world, sample, radius);
        sample.x = x + 0.12;
        const right = waterBlocked(world, sample, radius);
        sample.x = x;
        sample.z = z - 0.12;
        const back = waterBlocked(world, sample, radius);
        sample.z = z + 0.12;
        const front = waterBlocked(world, sample, radius);
        const nx = Number(left) - Number(right),
          nz = Number(back) - Number(front);
        considerHit(hit, low, nx || (nz ? 0 : -dx), nz || (nx ? 0 : -dz));
        break;
      }
      previous = time;
    }
  }
  return hit;
}

/**
 * Continuous collision detection followed by up to four wall-slide contacts.
 * A long frame is bounded to 50 metres and still cannot tunnel through a thin
 * wall or another player. Pass `output` to reuse the same result each frame.
 * Neither the input position nor delta is mutated.
 * @param {any} world
 * @param {{x:number,z:number,y?:number}} position
 * @param {{x:number,z:number}} delta
 * @param {{radius?:number,dynamic?:any[],ignoreId?:any,output?:any}} [options]
 */
export function moveWithCollisions(world, position, delta, options = {}) {
  const out = options.output || {};
  out.x = Number.isFinite(position?.x) ? position.x : 0;
  out.y = Number.isFinite(position?.y) ? position.y : 0;
  out.z = Number.isFinite(position?.z) ? position.z : 0;
  out.moved = false;
  out.blocked = false;
  if (!world || !finite(position) || !finite(delta)) {
    out.blocked = true;
    return out;
  }
  const radius = clamp(
    Number.isFinite(options.radius) ? options.radius : 0.42,
    0.1,
    1.5,
  );
  const work = world._motion;
  work.x = position.x;
  work.y = out.y;
  work.z = position.z;
  let dx = delta.x,
    dz = delta.z;
  const requested = Math.hypot(dx, dz);
  if (requested > 50) {
    dx *= 50 / requested;
    dz *= 50 / requested;
  }
  for (let i = 0; i < 4 && Math.hypot(dx, dz) > EPSILON; i++) {
    const hit = sweep(
      world,
      work,
      dx,
      dz,
      radius,
      options.dynamic || [],
      options.ignoreId,
    );
    const nx = hit.nx,
      nz = hit.nz;
    const time =
      nx || nz ? Math.max(0, hit.time - 0.002 / Math.hypot(dx, dz)) : 1;
    work.x += dx * time;
    work.z += dz * time;
    if (!nx && !nz) break;
    out.blocked = true;
    dx *= 1 - time;
    dz *= 1 - time;
    const into = dx * nx + dz * nz;
    if (into < 0) {
      dx -= into * nx;
      dz -= into * nz;
    }
  }
  out.x = work.x;
  out.z = work.z;
  out.moved = Math.hypot(out.x - position.x, out.z - position.z) > 1e-5;
  return out;
}

/** Static straight-line clearance, with exact wall/circle sweeps. */
export function navigationSegmentIsClear(world, a, b, radius = 0.42) {
  if (
    !navigationPointIsClear(world, a, radius) ||
    !navigationPointIsClear(world, b, radius)
  )
    return false;
  const hit = sweep(world, a, b.x - a.x, b.z - a.z, radius);
  return hit.time >= 1 - EPSILON && !hit.nx && !hit.nz;
}

function walkingCost(world, point) {
  if (!world.pathCount) return 1;
  const candidates =
    world._pathGrid.get(
      `${Math.floor(point.x / CELL)}:${Math.floor(point.z / CELL)}`,
    ) || [];
  let nearest = Infinity;
  for (const segment of candidates)
    nearest = Math.min(
      nearest,
      Math.max(
        0,
        Math.sqrt(segmentDistanceSquared(point, segment.a, segment.b)) -
          segment.width / 2,
      ),
    );
  // Mapped pavements are preferred; open plazas, park paths and beach approaches
  // remain reachable. No source sidewalk or pedestrian geometry is invented.
  return 1 + Math.min(3, nearest * 0.38);
}

function pushHeap(heap, entry) {
  heap.push(entry);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].score <= entry.score) break;
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = entry;
}

function popHeap(heap) {
  const first = heap[0],
    last = heap.pop();
  if (heap.length && last) {
    let i = 0;
    while (i * 2 + 1 < heap.length) {
      const left = i * 2 + 1,
        right = left + 1;
      const child =
        right < heap.length && heap[right].score < heap[left].score
          ? right
          : left;
      if (last.score <= heap[child].score) break;
      heap[i] = heap[child];
      i = child;
    }
    heap[i] = last;
  }
  return first;
}

/**
 * Bounded A* on a local grid aligned with the journey, favouring actual mapped
 * walking corridors. The last waypoint is always the requested safe destination.
 * Returns [] if unreachable, rather than walking through a blocked destination.
 * @param {any} world
 * @param {{x:number,z:number}} start
 * @param {{x:number,z:number}} goal
 * @param {{radius?:number,maxNodes?:number,gridStep?:number,margin?:number}} [options]
 * @returns {{x:number,z:number}[]}
 */
export function planWalkingPath(world, start, goal, options = {}) {
  const radius = clamp(
    Number.isFinite(options.radius) ? options.radius : 0.42,
    0.1,
    1.5,
  );
  if (
    !navigationPointIsClear(world, start, radius) ||
    !navigationPointIsClear(world, goal, radius)
  )
    return [];
  const span = distance(start, goal);
  if (span < 0.05) return [{ x: goal.x, z: goal.z }];
  if (span > 320) return [];
  const direct = navigationSegmentIsClear(world, start, goal, radius);
  if (direct && (!world.pathCount || span < 3))
    return [{ x: goal.x, z: goal.z }];
  if (direct) {
    let onPavement = true;
    const count = Math.ceil(span / 2);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      if (
        walkingCost(world, {
          x: start.x + (goal.x - start.x) * t,
          z: start.z + (goal.z - start.z) * t,
        }) > 1.08
      ) {
        onPavement = false;
        break;
      }
    }
    if (onPavement) return [{ x: goal.x, z: goal.z }];
  }
  const step = clamp(
    Number.isFinite(options.gridStep) ? options.gridStep : 0.8,
    0.5,
    1.5,
  );
  const maxNodes = clamp(
    Number.isFinite(options.maxNodes) ? options.maxNodes : 18000,
    100,
    32000,
  );
  const margin = clamp(
    Number.isFinite(options.margin) ? options.margin : 18 + span * 0.11,
    8,
    64,
  );
  const ux = (goal.x - start.x) / span,
    uz = (goal.z - start.z) / span;
  const alongCount = Math.ceil((span + margin * 2) / step) + 1;
  const acrossCount = Math.ceil((margin * 2) / step) + 1;
  const total = alongCount * acrossCount;
  if (total > 120000) return [];
  const costs = new Float32Array(total);
  costs.fill(Infinity);
  const parent = new Int32Array(total);
  parent.fill(-1);
  const closed = new Uint8Array(total),
    blocked = new Uint8Array(total),
    weights = new Float32Array(total);
  const at = (index) => {
    const along = (index % alongCount) * step - margin;
    const across = Math.floor(index / alongCount) * step - margin;
    return {
      x: start.x + ux * along - uz * across,
      z: start.z + uz * along + ux * across,
    };
  };
  const indexAt = (p) => {
    const dx = p.x - start.x,
      dz = p.z - start.z;
    const x = clamp(
      Math.round((dx * ux + dz * uz + margin) / step),
      0,
      alongCount - 1,
    );
    const z = clamp(
      Math.round((-dx * uz + dz * ux + margin) / step),
      0,
      acrossCount - 1,
    );
    return z * alongCount + x;
  };
  const nodeClear = (index) => {
    if (!blocked[index])
      blocked[index] = navigationPointIsClear(world, at(index), radius) ? 1 : 2;
    return blocked[index] === 1;
  };
  // Find a clear grid node beside either exact endpoint, keeping their connector
  // swept and collision-free even when a narrow pavement lies between cells.
  const endpointIndex = (point) => {
    const origin = indexAt(point),
      ox = origin % alongCount,
      oz = Math.floor(origin / alongCount);
    let best = -1,
      nearest = Infinity;
    for (
      let x = Math.max(0, ox - 2);
      x <= Math.min(alongCount - 1, ox + 2);
      x++
    )
      for (
        let z = Math.max(0, oz - 2);
        z <= Math.min(acrossCount - 1, oz + 2);
        z++
      ) {
        const index = z * alongCount + x,
          p = at(index),
          delta = distance(point, p);
        if (
          delta < nearest &&
          nodeClear(index) &&
          navigationSegmentIsClear(world, point, p, radius)
        ) {
          best = index;
          nearest = delta;
        }
      }
    return best;
  };
  const first = endpointIndex(start),
    last = endpointIndex(goal);
  if (first < 0 || last < 0) return [];
  const heap = [];
  costs[first] = 0;
  pushHeap(heap, { index: first, score: distance(at(first), goal) });
  let expanded = 0,
    found = false;
  while (heap.length && expanded < maxNodes) {
    const current = popHeap(heap).index;
    if (closed[current]) continue;
    closed[current] = 1;
    expanded++;
    if (current === last) {
      found = true;
      break;
    }
    const cx = current % alongCount,
      cz = Math.floor(current / alongCount),
      p = at(current);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx,
          z = cz + dz;
        if (x < 0 || z < 0 || x >= alongCount || z >= acrossCount) continue;
        const next = z * alongCount + x;
        if (closed[next] || !nodeClear(next)) continue;
        if (
          dx &&
          dz &&
          (!nodeClear(cz * alongCount + x) || !nodeClear(z * alongCount + cx))
        )
          continue;
        const q = at(next);
        if (!navigationSegmentIsClear(world, p, q, radius)) continue;
        if (!weights[next]) weights[next] = walkingCost(world, q);
        const cost = costs[current] + Math.hypot(dx, dz) * step * weights[next];
        if (cost >= costs[next]) continue;
        costs[next] = cost;
        parent[next] = current;
        pushHeap(heap, { index: next, score: cost + distance(q, goal) });
      }
  }
  if (!found) return [];
  const raw = [{ x: goal.x, z: goal.z }];
  for (let index = last; index !== first && index >= 0; index = parent[index])
    raw.push(at(index));
  raw.push(at(first));
  raw.reverse();
  // Remove only short, collinear detours. A global visibility shortcut would
  // erase the pavement preference and send people straight across carriageways.
  const result = [];
  let previous = start;
  for (let i = 0; i < raw.length; i++) {
    let next = i;
    while (
      next + 1 < raw.length &&
      distance(previous, raw[next + 1]) < 4.5 &&
      navigationSegmentIsClear(world, previous, raw[next + 1], radius) &&
      walkingCost(world, raw[next + 1]) <= walkingCost(world, raw[i]) + 0.15
    )
      next++;
    const point = raw[next];
    if (distance(previous, point) > 0.04) {
      result.push(point);
      previous = point;
    }
    i = next;
  }
  if (!result.length || distance(result[result.length - 1], goal) > 0.01)
    result.push({ x: goal.x, z: goal.z });
  return result;
}

/** Snap an arrival to a nearby safe shoulder position; never move through it. */
export function findSafeWalkingPoint(world, point, options = {}) {
  if (!finite(point)) return null;
  const radius = options.radius ?? 0.42;
  if (navigationPointIsClear(world, point, radius))
    return { x: point.x, z: point.z };
  const maximum = clamp(options.searchRadius || 4, 0.5, 12);
  for (let span = 0.25; span <= maximum; span += 0.25)
    for (let i = 0; i < 24; i++) {
      const angle = (i * Math.PI) / 12;
      const p = {
        x: point.x + Math.cos(angle) * span,
        z: point.z + Math.sin(angle) * span,
      };
      if (navigationPointIsClear(world, p, radius)) return p;
    }
  return null;
}

/**
 * Preserve the player's chosen orbit offset while following their actual motion.
 * State and vector coordinates are reused; no Three.js dependency is necessary.
 */
export function updateFollowCamera(state, camera, target, player, dt) {
  if (
    !state ||
    !finite(camera) ||
    !finite(target) ||
    !finite(player) ||
    !Number.isFinite(camera.y) ||
    !Number.isFinite(target.y) ||
    !Number.isFinite(player.y)
  )
    return false;
  if (!state.initialized) {
    state.x = player.x;
    state.y = player.y;
    state.z = player.z;
    state.initialized = true;
    return true;
  }
  const alpha = 1 - Math.exp(-12 * clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1));
  const dx = (player.x - state.x) * alpha,
    dy = (player.y - state.y) * alpha,
    dz = (player.z - state.z) * alpha;
  camera.x += dx;
  camera.y += dy;
  camera.z += dz;
  target.x += dx;
  target.y += dy;
  target.z += dz;
  state.x += dx;
  state.y += dy;
  state.z += dz;
  return true;
}

/**
 * Keep a close orbit shot outside facades and tree trunks. Building height is
 * tested at the swept contact, so an aerial camera is free to clear the roof.
 * @param {any} world
 * @param {{x:number,y:number,z:number}} target
 * @param {{x:number,y:number,z:number}} desired
 * @param {{radius?:number,clearance?:number,output?:any}} [options]
 */
export function cameraCollisionPosition(world, target, desired, options = {}) {
  const out = options.output || {};
  out.x = Number.isFinite(desired?.x) ? desired.x : 0;
  out.y = Number.isFinite(desired?.y) ? desired.y : 0;
  out.z = Number.isFinite(desired?.z) ? desired.z : 0;
  out.blocked = false;
  if (
    !world ||
    !finite(target) ||
    !finite(desired) ||
    !Number.isFinite(target.y) ||
    !Number.isFinite(desired.y)
  )
    return out;
  const radius = clamp(options.radius ?? 0.25, 0.05, 0.6);
  const clearance = clamp(options.clearance ?? 0.35, 0.05, 1);
  const dx = desired.x - target.x,
    dy = desired.y - target.y,
    dz = desired.z - target.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.01) return out;
  let earliest = 1;
  const test = world._cameraHit;
  for (const shape of query(
    world,
    Math.min(target.x, desired.x) - radius,
    Math.max(target.x, desired.x) + radius,
    Math.min(target.z, desired.z) - radius,
    Math.max(target.z, desired.z) + radius,
  )) {
    // Low furniture is handled by the orbit's terrain-height floor; it should
    // not pull a camera into the avatar while shooting over a terrace.
    if (shape.type === "furniture") continue;
    const minimum = shape.base - 0.2,
      maximum = shape.base + shape.height + radius;
    test.time = 1;
    test.nx = test.nz = 0;
    if (shape.kind === "circle")
      sweepCircle(test, target, dx, dz, shape, radius, false);
    else
      for (const edge of shape.edges)
        sweepEdge(test, target, dx, dz, edge, radius);
    if (
      (test.nx || test.nz) &&
      target.y + dy * test.time >= minimum &&
      target.y + dy * test.time <= maximum
    )
      earliest = Math.min(earliest, test.time);
    // An orbit can also descend vertically through the roof after it has
    // cleared an earlier wall above its height.
    if (dy < -EPSILON && target.y > maximum && desired.y < maximum) {
      const time = (maximum - target.y) / dy;
      const p = { x: target.x + dx * time, z: target.z + dz * time };
      if (
        shape.kind === "polygon"
          ? polygonBlocked(p, shape, radius)
          : distance(p, shape) < shape.radius + radius
      )
        earliest = Math.min(earliest, time);
    }
  }
  if (earliest < 1) {
    const t = Math.max(0, earliest - clearance / length);
    out.x = target.x + dx * t;
    out.y = target.y + dy * t;
    out.z = target.z + dz * t;
    out.blocked = true;
  }
  const floor = world._elevationAt?.(out);
  if (Number.isFinite(floor)) out.y = Math.max(out.y, floor + 1.25);
  return out;
}
