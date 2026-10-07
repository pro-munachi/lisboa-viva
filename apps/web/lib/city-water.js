/**
 * OpenStreetMap coastline ways keep land on their left. Clip those directed
 * edges to the world bounds, then walk the faces formed by coast + boundary.
 * This fills the Tagus/Atlantic on the seaward side without flooding Lisbon or
 * the small Almada peninsula at the southern edge of the published region.
 */
const EPSILON = 1e-10;

function signedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++)
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return area / 2;
}

function boundsOf(ring) {
  return ring.reduce(
    (bounds, p) => [
      Math.min(bounds[0], p[0]),
      Math.min(bounds[1], p[1]),
      Math.max(bounds[2], p[0]),
      Math.max(bounds[3], p[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

function insideBounds(point, bounds) {
  return (
    point[0] >= bounds[0] &&
    point[0] <= bounds[2] &&
    point[1] >= bounds[1] &&
    point[1] <= bounds[3]
  );
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

// Liang–Barsky clips each segment, preserving its original direction.
function clipSegment(a, b, bounds) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [
    a[0] - bounds[0],
    bounds[2] - a[0],
    a[1] - bounds[1],
    bounds[3] - a[1],
  ];
  let low = 0,
    high = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPSILON) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) low = Math.max(low, t);
      else high = Math.min(high, t);
      if (low > high) return null;
    }
  }
  if (high - low < EPSILON) return null;
  return [
    [a[0] + low * dx, a[1] + low * dy],
    [a[0] + high * dx, a[1] + high * dy],
  ];
}

/** Extracts both sides of the coastline, clipped to the published world bounds. */
export function coastRegions(manifest) {
  const bounds = manifest.bounds;
  const vertices = new Map();
  const edges = [];
  const edgeKeys = new Set();
  const vertex = (point) => {
    const key = `${point[0].toFixed(10)},${point[1].toFixed(10)}`;
    if (!vertices.has(key)) vertices.set(key, { key, point, outgoing: [] });
    return vertices.get(key);
  };
  const addEdge = (a, b, coast = false) => {
    const from = vertex(a),
      to = vertex(b);
    if (from.key === to.key) return;
    const key = [from.key, to.key].sort().join("|");
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    const forward = { from, to, side: coast ? "land" : null, visited: false };
    const reverse = {
      from: to,
      to: from,
      side: coast ? "water" : null,
      visited: false,
    };
    forward.reverse = reverse;
    reverse.reverse = forward;
    from.outgoing.push(forward);
    to.outgoing.push(reverse);
    edges.push(forward, reverse);
  };
  for (const coast of manifest.coastlines ?? [])
    for (let i = 1; i < coast.points.length; i++) {
      const clipped = clipSegment(coast.points[i - 1], coast.points[i], bounds);
      if (clipped) addEdge(clipped[0], clipped[1], true);
    }

  // Split the enclosing boundary at every clipped coastline crossing.
  const [west, south, east, north] = bounds;
  const corners = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
  corners.forEach(vertex);
  const perimeter = (p) => {
    if (Math.abs(p[1] - south) < EPSILON) return p[0] - west;
    if (Math.abs(p[0] - east) < EPSILON) return east - west + p[1] - south;
    if (Math.abs(p[1] - north) < EPSILON)
      return east - west + north - south + east - p[0];
    return 2 * (east - west) + north - south + north - p[1];
  };
  const boundary = [...vertices.values()]
    .filter(
      ({ point: p }) =>
        Math.abs(p[0] - west) < EPSILON ||
        Math.abs(p[0] - east) < EPSILON ||
        Math.abs(p[1] - south) < EPSILON ||
        Math.abs(p[1] - north) < EPSILON,
    )
    .sort((a, b) => perimeter(a.point) - perimeter(b.point));
  boundary.forEach((v, i) =>
    addEdge(v.point, boundary[(i + 1) % boundary.length].point),
  );

  for (const v of vertices.values())
    v.outgoing.sort(
      (a, b) =>
        Math.atan2(a.to.point[1] - v.point[1], a.to.point[0] - v.point[0]) -
        Math.atan2(b.to.point[1] - v.point[1], b.to.point[0] - v.point[0]),
    );

  const faces = [];
  for (const first of edges) {
    if (first.visited) continue;
    const ring = [];
    const sides = new Set();
    let edge = first,
      closed = false;
    for (let steps = 0; steps <= edges.length; steps++) {
      if (edge.visited) {
        closed = edge === first;
        break;
      }
      edge.visited = true;
      ring.push(edge.from.point);
      if (edge.side) sides.add(edge.side);
      const outgoing = edge.to.outgoing;
      const reverseIndex = outgoing.indexOf(edge.reverse);
      // Clockwise successor of the reverse edge keeps this face to our left.
      edge = outgoing[(reverseIndex + outgoing.length - 1) % outgoing.length];
    }
    if (!closed || ring.length < 3 || sides.size !== 1) continue;
    ring.push(ring[0]);
    const area = signedArea(ring);
    if (Math.abs(area) > EPSILON)
      faces.push({ ring, area, side: [...sides][0], bounds: boundsOf(ring) });
  }

  const collect = (side) => {
    const sideFaces = faces.filter((face) => face.side === side);
    const polygons = sideFaces
      .filter((face) => face.area > 0)
      .map((face) => ({ ring: face.ring, holes: [], bounds: face.bounds }));
    // Disconnected closed coastline rings describe islands: their water-facing
    // clockwise cycle becomes a hole in the smallest enclosing water polygon.
    for (const hole of sideFaces.filter((face) => face.area < 0)) {
      const owner = polygons
        .filter(
          (polygon) =>
            insideBounds(hole.ring[0], polygon.bounds) &&
            pointInRing(hole.ring[0], polygon.ring),
        )
        .sort((a, b) => signedArea(a.ring) - signedArea(b.ring))[0];
      if (owner) owner.holes.push(hole.ring);
    }
    return polygons;
  };
  const water = collect("water");
  const land = collect("land");
  return { water, land, waterAt: (point) => waterAt(point, water) };
}

/** Returns WGS84 water polygons with island holes, all clipped to manifest.bounds. */
export function coastWaterPolygons(manifest) {
  return coastRegions(manifest).water;
}

/** Whether a WGS84 point lies seaward of the mapped coastline, excluding islands. */
export function waterAt(point, polygons) {
  return polygons.some(
    (polygon) =>
      insideBounds(point, polygon.bounds ?? boundsOf(polygon.ring)) &&
      pointInRing(point, polygon.ring) &&
      !(polygon.holes ?? []).some((hole) => pointInRing(point, hole)),
  );
}

/** Prepares a reusable sampler for DEM clipping without rebuilding coast topology. */
export function createWaterMask(manifest) {
  const regions = coastRegions(manifest);
  return { ...regions, polygons: regions.water };
}
