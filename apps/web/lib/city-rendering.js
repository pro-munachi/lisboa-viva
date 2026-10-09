import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drapedPolygonGeometry } from "./city-surfaces.js";

// The world has a coarse city layer and up to three nearby detailed chunks.
// Their source ways overlap; depth offsets alone cannot make two different
// versions of the same road/building agree. These masks give each area one owner.
const MAX_LAYER_BOUNDS = 8;

function footprintKey(ring) {
  if (!Array.isArray(ring)) return null;
  const points = ring
    .filter(
      (p, i) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        p.every(Number.isFinite) &&
        (!i || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]),
    )
    .map((p) => `${p[0]},${p[1]}`);
  if (points[0] === points.at(-1)) points.pop();
  if (points.length < 3) return null;
  const smallest = points.reduce(
    (best, p, i) => (p < points[best] ? i : best),
    0,
  );
  const ordered = [...points.slice(smallest), ...points.slice(0, smallest)];
  const forward = ordered.join(";"),
    reverse = [ordered[0], ...ordered.slice(1).reverse()].join(";");
  return forward < reverse ? forward : reverse;
}

/** OSM relation parts can share an ID and must all survive. Conversely the
 * snapshot includes a few duplicated ways with different IDs and identical
 * rings. Remove only exact geometric duplicates to prevent coplanar façades.
 */
export function uniqueCityBuildingFootprints(buildings = []) {
  const unique = new Map(),
    invalid = [];
  const score = (b) =>
    (b.heightSource === "height" ? 2 : b.heightSource === "levels" ? 1 : 0) *
      10000 +
    (Number(b.height) || 0);
  for (const building of buildings) {
    const key = footprintKey(building.ring);
    if (!key) {
      invalid.push(building);
      continue;
    }
    const previous = unique.get(key);
    if (!previous || score(building) > score(previous))
      unique.set(key, building);
  }
  return [...unique.values(), ...invalid];
}

export function projectedCityBounds(bounds, projectGeo) {
  const corners = [
    projectGeo([bounds[0], bounds[1]]),
    projectGeo([bounds[2], bounds[3]]),
  ];
  return [
    Math.min(corners[0].x, corners[1].x),
    Math.min(corners[0].z, corners[1].z),
    Math.max(corners[0].x, corners[1].x),
    Math.max(corners[0].z, corners[1].z),
  ];
}

/** @param {any} material @param {number[][]} [bounds] */
export function updateCityLayerBounds(material, bounds = []) {
  const state = material?.userData?.cityLayer;
  if (!state) return false;
  const valid = bounds.filter(
    (b) =>
      Array.isArray(b) &&
      b.length === 4 &&
      b.every(Number.isFinite) &&
      b[2] > b[0] &&
      b[3] > b[1],
  );
  if (valid.length > MAX_LAYER_BOUNDS)
    throw new RangeError(
      "City layers support up to eight nearby chunk bounds.",
    );
  state.count.value = valid.length;
  valid.forEach((b, i) => state.bounds.value[i].set(...b));
  return true;
}

/** Clone, never mutate, a shared palette material. The include mask uses half
 * open boundaries so adjacent detailed chunks cannot paint the same fragment.
 * Whole-instance masks remove overview boxes by their centre rather than
 * slicing a simplified box through an exact neighbouring building façade.
 * @param {any} source
 * @param {{mode?: string, bounds?: number[][], wholeInstance?: boolean}} [options]
 */
export function createCityLayerMaterial(
  source,
  { mode = "outside", bounds = [], wholeInstance = false } = {},
) {
  if (!["inside", "outside"].includes(mode))
    throw new TypeError("A city layer mask must be inside or outside.");
  const material = source.clone();
  const state = {
    count: { value: 0 },
    bounds: {
      value: Array.from(
        { length: MAX_LAYER_BOUNDS },
        () => new THREE.Vector4(),
      ),
    },
    mode,
    wholeInstance,
  };
  material.userData.cityLayer = state;
  const compile = source.onBeforeCompile,
    cacheKey = source.customProgramCacheKey.bind(source);
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(source, shader, renderer);
    shader.uniforms.roamLayerCount = state.count;
    shader.uniforms.roamLayerBounds = state.bounds;
    const declaration = `\nuniform int roamLayerCount;\nuniform vec4 roamLayerBounds[${MAX_LAYER_BOUNDS}];\nvarying vec2 vRoamLayerXZ;\n`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec2 vRoamLayerXZ;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>\nvec4 roamLayerPosition = vec4(${wholeInstance ? "0.0, 0.0, 0.0" : "transformed"}, 1.0);\n#ifdef USE_INSTANCING\nroamLayerPosition = instanceMatrix * roamLayerPosition;\n#endif\nvRoamLayerXZ = (modelMatrix * roamLayerPosition).xz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>" + declaration,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `void main() {\nbool roamCovered = false;\nfor (int i = 0; i < ${MAX_LAYER_BOUNDS}; i++) {\nif(i >= roamLayerCount) break;\nvec4 b = roamLayerBounds[i];\nif(vRoamLayerXZ.x >= b.x && vRoamLayerXZ.y >= b.y && vRoamLayerXZ.x < b.z && vRoamLayerXZ.y < b.w) roamCovered = true;\n}\nif(${mode === "inside" ? "!roamCovered" : "roamCovered"}) discard;`,
    );
  };
  material.customProgramCacheKey = () =>
    `${cacheKey()}:roam-layer-${mode}-${wholeInstance ? "instance" : "fragment"}-v1`;
  updateCityLayerBounds(material, bounds);
  return material;
}

/** Exact DEM-cell draping replaces four-corner road quads, which can intersect
 * the terrain between corners on Lisbon's hills. Joins are capped to prevent
 * narrow acute bends producing long triangles through neighbouring buildings.
 */
export function safeRoadRibbonGeometry(
  geographic,
  width,
  context,
  { side = 0, lift = 0.19 } = {},
) {
  const { projectGeo, unprojectGeo } = context;
  if (
    !Array.isArray(geographic) ||
    geographic.some(
      (p) => !Array.isArray(p) || p.length < 2 || !p.every(Number.isFinite),
    ) ||
    !Number.isFinite(side) ||
    !Number.isFinite(lift)
  )
    return new THREE.BufferGeometry();
  const points = geographic
    .map(projectGeo)
    .filter(
      (p, i, list) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.z) &&
        (!i || Math.hypot(p.x - list[i - 1].x, p.z - list[i - 1].z) > 0.01),
    );
  if (points.length < 2 || !Number.isFinite(width) || width <= 0)
    return new THREE.BufferGeometry();
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01) continue;
    segments.push({
      a,
      b,
      nx: -(b.z - a.z) / length,
      nz: (b.x - a.x) / length,
    });
  }
  const parts = [];
  const drape = (ring) => {
    const geo = ring.map((p) => unprojectGeo(p.x, p.z));
    const geometry = drapedPolygonGeometry(geo, context, lift);
    if (geometry.attributes.position.count) parts.push(geometry);
    else geometry.dispose();
  };
  for (const segment of segments) {
    const offset = (p, distance) => ({
      x: p.x + segment.nx * distance,
      z: p.z + segment.nz * distance,
    });
    drape([
      offset(segment.a, side + width / 2),
      offset(segment.a, side - width / 2),
      offset(segment.b, side - width / 2),
      offset(segment.b, side + width / 2),
    ]);
  }
  for (let i = 1; i < segments.length; i++) {
    const before = segments[i - 1],
      after = segments[i],
      joint = before.b;
    // Only join genuinely contiguous segments, never a gap in malformed data.
    if (Math.hypot(joint.x - after.a.x, joint.z - after.a.z) > 0.02) continue;
    if (Math.abs(side) > 1e-8) {
      const at = (segment, distance) => ({
        x: joint.x + segment.nx * distance,
        z: joint.z + segment.nz * distance,
      });
      drape([
        at(before, side - width / 2),
        at(before, side + width / 2),
        at(after, side + width / 2),
        at(after, side - width / 2),
      ]);
      continue;
    }
    for (const distance of [-width / 2, width / 2]) {
      if (Math.abs(distance) < 1e-8) continue;
      const a = {
          x: joint.x + before.nx * distance,
          z: joint.z + before.nz * distance,
        },
        b = {
          x: joint.x + after.nx * distance,
          z: joint.z + after.nz * distance,
        };
      // A bevel fills only the corner gap; no unlimited miter at near U-turns.
      drape([joint, a, b]);
    }
  }
  if (!parts.length) return new THREE.BufferGeometry();
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function updateCityCameraClip(camera, range, interior = false) {
  const distance = Number.isFinite(range) ? Math.max(0, range) : 250;
  const near = interior ? 0.15 : Math.max(0.5, Math.min(8, distance * 0.00015));
  const far = interior
    ? 4000
    : Math.max(4500, Math.min(150000, distance * 2 + 3500));
  if (Math.abs(camera.near - near) < 0.01 && Math.abs(camera.far - far) < 10)
    return false;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
  return true;
}
