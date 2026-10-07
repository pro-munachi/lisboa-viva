import * as THREE from "three";

const EPSILON = 1e-9;

function cross(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

// Both the subject and clip polygon are convex triangles. Their intersection
// remains convex, so its final fan never fills gaps in the original footprint.
function clipTriangle(subject, clip) {
  let polygon = subject;
  for (let i = 0; i < 3 && polygon.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % 3];
    const output = [];
    let previous = polygon.at(-1),
      previousDistance = cross(a, b, previous);
    for (const point of polygon) {
      const distance = cross(a, b, point);
      const inside = distance >= -EPSILON,
        previousInside = previousDistance >= -EPSILON;
      if (inside !== previousInside) {
        const t = previousDistance / (previousDistance - distance);
        output.push({
          x: previous.x + (point.x - previous.x) * t,
          y: previous.y + (point.y - previous.y) * t,
        });
      }
      if (inside) output.push(point);
      previous = point;
      previousDistance = distance;
    }
    polygon = output;
  }
  return polygon;
}

/** Drape an exact footprint over the same TL/BL/TR + TR/BL/BR cells as the DEM.
 * Triangulating the footprint first allows concave polygons to be clipped
 * without bridges across their empty portions. Coverage outside the DEM is
 * omitted, matching the visible terrain boundary.
 */
export function drapedPolygonGeometry(
  ring,
  { projectGeo, unprojectGeo, geoY, terrain, holes = [] },
  lift = 0.1,
) {
  const cleanRing = (input) => {
    const clean = input.filter(
      (p, i, list) => !i || p[0] !== list[i - 1][0] || p[1] !== list[i - 1][1],
    );
    if (
      clean.length > 1 &&
      clean[0][0] === clean.at(-1)[0] &&
      clean[0][1] === clean.at(-1)[1]
    )
      clean.pop();
    return clean;
  };
  const clean = cleanRing(ring),
    cleanHoles = holes.map(cleanRing).filter((hole) => hole.length >= 3);
  const positions = [],
    uvs = [];
  const result = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  };
  if (clean.length < 3) return result();

  function emit(projected, geographic) {
    const direction =
      (projected[1].x - projected[0].x) * (projected[2].z - projected[0].z) -
      (projected[1].z - projected[0].z) * (projected[2].x - projected[0].x);
    if (Math.abs(direction) < 1e-7) return;
    for (const index of direction > 0 ? [0, 2, 1] : [0, 1, 2]) {
      const p = projected[index];
      positions.push(
        p.x,
        geoY(geographic[index] ?? unprojectGeo(p.x, p.z)) + lift,
        p.z,
      );
      uvs.push(p.x / 4, p.z / 4);
    }
  }

  if (!terrain || terrain.width < 2 || terrain.height < 2) {
    const points = clean.map(projectGeo);
    const holePoints = cleanHoles.map((hole) => hole.map(projectGeo));
    const allPoints = [...points, ...holePoints.flat()],
      allGeo = [...clean, ...cleanHoles.flat()];
    const triangles = THREE.ShapeUtils.triangulateShape(
      points.map((p) => new THREE.Vector2(p.x, p.z)),
      holePoints.map((hole) => hole.map((p) => new THREE.Vector2(p.x, p.z))),
    );
    for (const triangle of triangles)
      emit(
        triangle.map((index) => allPoints[index]),
        triangle.map((index) => allGeo[index]),
      );
    return result();
  }

  const [west, south, east, north] = terrain.bounds;
  const columns = terrain.width - 1,
    rows = terrain.height - 1;
  const gridPoint = ([longitude, latitude]) =>
    new THREE.Vector2(
      ((longitude - west) / (east - west)) * columns,
      ((north - latitude) / (north - south)) * rows,
    );
  const points = clean.map(gridPoint),
    holePoints = cleanHoles.map((hole) => hole.map(gridPoint));
  const allPoints = [...points, ...holePoints.flat()];
  const triangles = THREE.ShapeUtils.triangulateShape(points, holePoints);
  const geographic = (p) => [
    west + (p.x / columns) * (east - west),
    north - (p.y / rows) * (north - south),
  ];

  for (const triangle of triangles) {
    const subject = triangle.map((index) => allPoints[index]);
    const minX = Math.max(0, Math.floor(Math.min(...subject.map((p) => p.x))));
    const maxX = Math.min(
      columns - 1,
      Math.floor(Math.max(...subject.map((p) => p.x))),
    );
    const minY = Math.max(0, Math.floor(Math.min(...subject.map((p) => p.y))));
    const maxY = Math.min(
      rows - 1,
      Math.floor(Math.max(...subject.map((p) => p.y))),
    );
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tl = { x, y },
          tr = { x: x + 1, y },
          bl = { x, y: y + 1 },
          br = { x: x + 1, y: y + 1 };
        // Clip orientations are CCW in grid coordinates. The emitter chooses
        // upward-facing world winding independently of footprint orientation.
        for (const cell of [
          [tl, tr, bl],
          [tr, br, bl],
        ]) {
          const polygon = clipTriangle(subject, cell);
          if (polygon.length < 3) continue;
          const geo = polygon.map(geographic),
            projected = geo.map(projectGeo);
          for (let i = 1; i < polygon.length - 1; i++)
            emit(
              [projected[0], projected[i], projected[i + 1]],
              [geo[0], geo[i], geo[i + 1]],
            );
        }
      }
    }
  }
  return result();
}
