const EPSILON = 1e-7;

function inside(point, ring) {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    )
      contained = !contained;
  }
  return contained;
}

function crosses(a, b, c, d) {
  const turn = (p, q, r) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const abC = turn(a, b, c),
    abD = turn(a, b, d);
  const cdA = turn(c, d, a),
    cdB = turn(c, d, b);
  if (abC * abD < -EPSILON && cdA * cdB < -EPSILON) return true;
  const on = (p, q, r, value) =>
    Math.abs(value) < EPSILON &&
    r.x >= Math.min(p.x, q.x) - EPSILON &&
    r.x <= Math.max(p.x, q.x) + EPSILON &&
    r.z >= Math.min(p.z, q.z) - EPSILON &&
    r.z <= Math.max(p.z, q.z) + EPSILON;
  return (
    on(a, b, c, abC) || on(a, b, d, abD) || on(c, d, a, cdA) || on(c, d, b, cdB)
  );
}

/**
 * Frame the original beach point from the land side, looking across its mapped
 * shoreline. Both samplers use projected metre coordinates. No geography is
 * moved, and a missing coast or obstructed camera returns the caller's fallback.
 * @param {{point: {x:number,z:number}, groundY: number, waterAt: (point: {x:number,z:number}) => boolean, elevationAt?: (point: {x:number,z:number}) => number, footprints?: {x:number,z:number}[][], aspect?: number}} options
 */
export function beachCameraView({
  point,
  groundY,
  waterAt,
  elevationAt,
  footprints = [],
  aspect = 1.5,
}) {
  if (!waterAt || !Number.isFinite(groundY)) return null;
  const directions = [];
  // A fixed 16-direction, five-radius search accommodates curved coves and
  // rotated shorelines without a Lisbon-specific north/south assumption.
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    const direction = { x: Math.cos(angle), z: Math.sin(angle) };
    const at = (distance) => ({
      x: point.x + direction.x * distance,
      z: point.z + direction.z * distance,
    });
    let dry = 0;
    for (const radius of [8, 16, 32, 64, 128]) {
      if (!waterAt(at(radius))) {
        dry = radius;
        continue;
      }
      let wet = radius;
      for (let step = 0; step < 5; step++) {
        const middle = (dry + wet) / 2;
        if (waterAt(at(middle))) wet = middle;
        else dry = middle;
      }
      directions.push({ ...direction, distance: wet });
      break;
    }
  }
  directions.sort((a, b) => a.distance - b.distance);
  const clear = (camera) =>
    !waterAt(camera) &&
    footprints.every(
      (ring) =>
        !inside(camera, ring) &&
        !inside(point, ring) &&
        ring.every(
          (a, i) => !crosses(camera, point, a, ring[(i + 1) % ring.length]),
        ),
    );
  const inland = Math.min(40, 24 / Math.max(0.6, Math.min(1, aspect)));
  // Reject camera positions and sightlines through real building footprints;
  // shorter offsets allow narrow beaches below a promenade or hotel frontage.
  for (const direction of directions) {
    const tangent = { x: -direction.z, z: direction.x };
    for (const distance of [inland, inland * 0.75, inland * 0.5, 8]) {
      for (const along of [0, 10, -10, 20, -20]) {
        const at = {
          x: point.x - direction.x * distance + tangent.x * along,
          z: point.z - direction.z * distance + tangent.z * along,
        };
        if (!clear(at)) continue;
        const elevation = elevationAt?.(at) ?? groundY;
        if (!Number.isFinite(elevation)) continue;
        const forward = Math.min(12, direction.distance * 0.35);
        return {
          camera: { ...at, y: Math.max(groundY, elevation) + 18 },
          target: {
            x: point.x + direction.x * forward,
            y: groundY + 1.4,
            z: point.z + direction.z * forward,
          },
          shoreline: {
            x: point.x + direction.x * (direction.distance + 2),
            y: 0.06,
            z: point.z + direction.z * (direction.distance + 2),
          },
          seaward: { x: direction.x, z: direction.z },
        };
      }
    }
  }
  return null;
}
