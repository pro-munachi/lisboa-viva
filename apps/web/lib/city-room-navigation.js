/** @typedef {{x: number, z: number}} RoomPoint */
/** @typedef {{minX: number, minZ: number, maxX: number, maxZ: number}} RoomObstacle */
/**
 * @typedef {Object} RoomRouteOptions
 * @property {ReadonlyArray<number>} bounds [minX, minZ, maxX, maxZ] in room metres.
 * @property {ReadonlyArray<RoomObstacle>} [obstacles] Furniture footprints in room metres.
 * @property {number} [clearance] Avatar radius; defaults to 0.3 metres.
 * @property {number} [cellSize] Maximum grid spacing; defaults to 0.4 metres.
 */

const EPSILON = 1e-9;
const MAX_NODES = 10000;
const finitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const copyPoint = (p) => ({ x: p.x, z: p.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function insideObstacle(point, obstacle) {
  return (
    point.x >= obstacle.minX - EPSILON &&
    point.x <= obstacle.maxX + EPSILON &&
    point.z >= obstacle.minZ - EPSILON &&
    point.z <= obstacle.maxZ + EPSILON
  );
}

// Slab intersection includes boundary contact, so a shortcut cannot clip a corner.
function segmentHitsObstacle(a, b, obstacle) {
  let entry = 0,
    exit = 1;
  for (const [axis, low, high] of [
    ["x", obstacle.minX, obstacle.maxX],
    ["z", obstacle.minZ, obstacle.maxZ],
  ]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPSILON) {
      if (a[axis] < low - EPSILON || a[axis] > high + EPSILON) return false;
      continue;
    }
    let first = (low - a[axis]) / delta,
      last = (high - a[axis]) / delta;
    if (first > last) [first, last] = [last, first];
    entry = Math.max(entry, first);
    exit = Math.min(exit, last);
    if (entry > exit + EPSILON) return false;
  }
  return true;
}

// A binary heap bounds A* queue operations without repeatedly sorting the whole grid.
class OpenNodes {
  values = [];
  push(id, score) {
    const entry = { id, score };
    let index = this.values.length;
    this.values.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.values[parent].score <= score) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = entry;
  }
  pop() {
    const first = this.values[0],
      last = this.values.pop();
    if (!this.values.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.values.length &&
        this.values[child + 1].score < this.values[child].score
      )
        child++;
      if (this.values[child].score >= last.score) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

/**
 * Find a furniture-safe route. Returned points include start and target and use
 * room-local coordinates. An empty route leaves the avatar where it is.
 *
 * @param {RoomPoint} start
 * @param {RoomPoint} target
 * @param {RoomRouteOptions} options
 * @returns {RoomPoint[]}
 */
export function findRoomRoute(start, target, options) {
  const bounds = options?.bounds,
    clearance = options?.clearance ?? 0.3,
    cellSize = options?.cellSize ?? 0.4,
    sourceObstacles = options?.obstacles ?? [];
  if (
    !finitePoint(start) ||
    !finitePoint(target) ||
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite) ||
    !Number.isFinite(clearance) ||
    clearance < 0 ||
    !Number.isFinite(cellSize) ||
    cellSize <= 0 ||
    !Array.isArray(sourceObstacles)
  )
    return [];
  const [left, bottom, right, top] = bounds,
    minX = left + clearance,
    minZ = bottom + clearance,
    maxX = right - clearance,
    maxZ = top - clearance,
    width = maxX - minX,
    depth = maxZ - minZ;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    width <= 0 ||
    depth <= 0
  )
    return [];
  const obstacles = [];
  for (const obstacle of sourceObstacles) {
    if (
      !obstacle ||
      ![obstacle.minX, obstacle.minZ, obstacle.maxX, obstacle.maxZ].every(
        Number.isFinite,
      ) ||
      obstacle.minX > obstacle.maxX ||
      obstacle.minZ > obstacle.maxZ
    )
      return [];
    const expanded = {
      minX: obstacle.minX - clearance,
      minZ: obstacle.minZ - clearance,
      maxX: obstacle.maxX + clearance,
      maxZ: obstacle.maxZ + clearance,
    };
    if (
      expanded.maxX >= minX &&
      expanded.minX <= maxX &&
      expanded.maxZ >= minZ &&
      expanded.minZ <= maxZ
    )
      obstacles.push(expanded);
  }
  const freePoint = (point) =>
    point.x >= minX &&
    point.x <= maxX &&
    point.z >= minZ &&
    point.z <= maxZ &&
    !obstacles.some((o) => insideObstacle(point, o));
  const clearSegment = (a, b) =>
    !obstacles.some((o) => segmentHitsObstacle(a, b, o));
  if (!freePoint(start) || !freePoint(target)) return [];
  if (distance(start, target) <= EPSILON) return [copyPoint(start)];
  if (clearSegment(start, target)) return [copyPoint(start), copyPoint(target)];

  const columns = Math.ceil(width / cellSize) + 1,
    rows = Math.ceil(depth / cellSize) + 1,
    count = columns * rows;
  if (!Number.isFinite(count) || count > MAX_NODES) return [];
  const stepX = width / (columns - 1),
    stepZ = depth / (rows - 1),
    points = Array.from({ length: count }, (_, index) => ({
      x: minX + (index % columns) * stepX,
      z: minZ + Math.floor(index / columns) * stepZ,
    })),
    free = Uint8Array.from(points, (point) => Number(freePoint(point))),
    closed = new Uint8Array(count),
    costs = new Float64Array(count).fill(Infinity),
    previous = new Int32Array(count).fill(-2),
    open = new OpenNodes();
  // Exact start connections avoid snapping through nearby furniture or a wall.
  for (let id = 0; id < count; id++) {
    if (!free[id] || !clearSegment(start, points[id])) continue;
    costs[id] = distance(start, points[id]);
    previous[id] = -1;
    open.push(id, costs[id] + distance(points[id], target));
  }
  while (open.values.length) {
    const { id } = open.pop();
    if (closed[id]) continue;
    closed[id] = 1;
    const point = points[id];
    if (clearSegment(point, target)) {
      const route = [copyPoint(target)];
      for (let current = id; current !== -1; current = previous[current])
        route.push(points[current]);
      route.push(copyPoint(start));
      route.reverse();
      // Smooth only across exact unobstructed segments, not just free endpoint cells.
      const smooth = [route[0]];
      for (let at = 0; at < route.length - 1; ) {
        let next = route.length - 1;
        while (next > at + 1 && !clearSegment(route[at], route[next])) next--;
        if (distance(smooth.at(-1), route[next]) > EPSILON)
          smooth.push(copyPoint(route[next]));
        at = next;
      }
      return smooth;
    }
    const col = id % columns,
      row = Math.floor(id / columns);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dz) ||
          col + dx < 0 ||
          col + dx >= columns ||
          row + dz < 0 ||
          row + dz >= rows
        )
          continue;
        const next = id + dz * columns + dx;
        if (!free[next] || closed[next]) continue;
        if (dx && dz && (!free[id + dx] || !free[id + dz * columns])) continue;
        if (!clearSegment(point, points[next])) continue;
        const cost = costs[id] + distance(point, points[next]);
        if (cost >= costs[next]) continue;
        costs[next] = cost;
        previous[next] = id;
        open.push(next, cost + distance(points[next], target));
      }
  }
  return [];
}
