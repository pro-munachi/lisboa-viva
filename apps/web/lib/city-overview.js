import * as THREE from "three";

// Overview boxes contain position, size and height, but no architectural tags.
// These shared silhouettes are procedural decoration, not surveyed roof forms.
const FAMILIES = ["hip", "gable-x", "gable-z", "flat"];
const WALL_COLORS = [
  "#f0dfc0",
  "#e7b198",
  "#e9cb7f",
  "#c2d9cf",
  "#adcbd6",
  "#eed2bf",
  "#d5dcd9",
  "#c9b3b0",
  "#ead8a8",
  "#bfd2aa",
  "#dec7a6",
  "#d2e1dd",
].map((color) => new THREE.Color(color));
const FLAT_COLORS = [
  "#d6e0e0",
  "#c1d1d3",
  "#e6dfcf",
  "#c5d2c7",
  "#d5d8df",
  "#ead5c3",
].map((color) => new THREE.Color(color));
const ROOF_COLORS = ["#bd7350", "#b96846", "#cc8059", "#8b9999"];

function positionHash(x, z) {
  // Quantization is finer than the overview's metre-rounded source coordinates.
  // Mix signed coordinates rather than ordering/id to avoid stripes after sorting.
  let hash = Math.imul(Math.round(x * 4) | 0, 0x45d9f3b);
  hash ^= Math.imul(Math.round(z * 4) | 0, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function familyFor(box, hash) {
  const width = box[2],
    length = box[3],
    height = box[4];
  const shortest = Math.min(width, length),
    longest = Math.max(width, length);
  if (height >= 28 || width * length >= 1800 || longest >= 85 || shortest < 2)
    return 3;
  if (height <= 16 && longest / shortest <= 1.65 && (hash >>> 8) % 5 < 2)
    return 0;
  // The ridge follows a rectangular building's long axis. Almost square plots
  // can use either orientation without implying a mapped roof direction.
  return longest / shortest < 1.15
    ? 1 + ((hash >>> 12) & 1)
    : width >= length
      ? 1
      : 2;
}

function prototypeGeometry(family) {
  const positions = [],
    colors = [],
    roofFaces = [];
  const triangle = (a, b, c, roof = false) => {
    for (const point of [a, b, c]) {
      positions.push(...point);
      colors.push(1, 1, 1);
      roofFaces.push(Number(roof));
    }
  };
  const quad = (a, b, c, d, roof = false) => {
    triangle(a, b, c, roof);
    triangle(a, c, d, roof);
  };
  const eave = family === "flat" ? 1 : family === "hip" ? 0.82 : 0.86;
  const corners = [
    [-0.5, eave, -0.5],
    [0.5, eave, -0.5],
    [0.5, eave, 0.5],
    [-0.5, eave, 0.5],
  ];
  const bottom = corners.map(([x, , z]) => [x, 0, z]);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    quad(bottom[i], corners[i], corners[next], bottom[next]);
  }
  quad(bottom[0], bottom[1], bottom[2], bottom[3]);
  if (family === "flat") {
    quad(corners[0], corners[3], corners[2], corners[1], true);
  } else if (family === "hip") {
    const leftRidge = [-0.24, 1, 0],
      rightRidge = [0.24, 1, 0];
    quad(corners[0], leftRidge, rightRidge, corners[1], true);
    triangle(corners[1], rightRidge, corners[2], true);
    quad(corners[2], rightRidge, leftRidge, corners[3], true);
    triangle(corners[3], leftRidge, corners[0], true);
  } else if (family === "gable-x") {
    const leftRidge = [-0.5, 1, 0],
      rightRidge = [0.5, 1, 0];
    quad(corners[0], leftRidge, rightRidge, corners[1], true);
    quad(corners[2], rightRidge, leftRidge, corners[3], true);
    triangle(corners[1], rightRidge, corners[2]);
    triangle(corners[3], leftRidge, corners[0]);
  } else {
    const backRidge = [0, 1, -0.5],
      frontRidge = [0, 1, 0.5];
    quad(corners[1], backRidge, frontRidge, corners[2], true);
    quad(corners[3], frontRidge, backRidge, corners[0], true);
    triangle(corners[0], backRidge, corners[1]);
    triangle(corners[2], frontRidge, corners[3]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "roamRoofFace",
    new THREE.Float32BufferAttribute(roofFaces, 1),
  );
  // Unshared face vertices keep eaves and wall/roof normals crisp.
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function overviewMaterial(familyIndex) {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.92,
  });
  const roofColor = new THREE.Color(ROOF_COLORS[familyIndex]);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roamOverviewRoof = { value: roofColor };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float roamRoofFace;\nuniform vec3 roamOverviewRoof;",
      )
      .replace(
        "#include <color_vertex>",
        "#include <color_vertex>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\nvColor.xyz = mix(vColor.xyz, roamOverviewRoof, roamRoofFace);\n#endif",
      );
  };
  material.customProgramCacheKey = () => "roam-overview-independent-roofs-v1";
  return material;
}

export function createBuildingOverview(boxes, { geoY, unprojectGeo }) {
  const group = new THREE.Group();
  group.name = "Mapped building overview";
  const counts = [0, 0, 0, 0];
  for (const box of boxes) {
    if (
      box.length < 5 ||
      !box.slice(0, 5).every(Number.isFinite) ||
      box[2] <= 0 ||
      box[3] <= 0 ||
      box[4] <= 0
    )
      throw new TypeError(
        "Overview building boxes need finite positions and positive dimensions.",
      );
    counts[familyFor(box, positionHash(box[0], box[1]))]++;
  }
  const meshes = counts.map((count, index) => {
    if (!count) return null;
    const mesh = new THREE.InstancedMesh(
      prototypeGeometry(FAMILIES[index]),
      overviewMaterial(index),
      count,
    );
    mesh.name = `Overview ${FAMILIES[index]}`;
    mesh.userData.family = FAMILIES[index];
    group.add(mesh);
    return mesh;
  });
  const offsets = [0, 0, 0, 0];
  const matrix = new THREE.Matrix4();
  for (const box of boxes) {
    const hash = positionHash(box[0], box[1]);
    const family = familyFor(box, hash),
      mesh = meshes[family];
    const base = geoY(unprojectGeo(box[0], box[1]));
    if (!Number.isFinite(base)) {
      group.children.forEach((child) => {
        child.dispose();
        child.geometry.dispose();
        child.material.dispose();
      });
      throw new TypeError("Overview building ground elevation must be finite.");
    }
    // Unit prototypes run from ground y=0 to peak y=1. Scaling does not alter
    // the provided footprint extent, base elevation or total source height.
    matrix.makeScale(box[2], box[4], box[3]);
    matrix.setPosition(box[0], base, box[1]);
    const offset = offsets[family]++;
    mesh.setMatrixAt(offset, matrix);
    const palette = family === 3 ? FLAT_COLORS : WALL_COLORS;
    mesh.setColorAt(offset, palette[(hash >>> 16) % palette.length]);
  }
  meshes.forEach((mesh) => {
    if (!mesh) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  });
  group.userData.buildingCount = boxes.length;
  return group;
}
