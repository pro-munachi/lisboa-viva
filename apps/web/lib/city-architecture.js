import * as THREE from "three";

// The architecture is original, procedural decoration of the mapped footprints.
// It is not a reconstruction of individual buildings or surveyed roof forms.
const PALETTES = [
  {
    plaster: "#e8ddc4",
    shadow: "#c8bca3",
    shutter: "#446c66",
    stone: "#eee4cd",
    tiles: "#a5b9b1",
  },
  {
    plaster: "#d7a58e",
    shadow: "#b48171",
    shutter: "#42585d",
    stone: "#e7d8c0",
    tiles: "#b5c1c0",
  },
  {
    plaster: "#e4cc8d",
    shadow: "#bea870",
    shutter: "#586a54",
    stone: "#efe3c5",
    tiles: "#b9bb9b",
  },
  {
    plaster: "#b7c4bf",
    shadow: "#91a59d",
    shutter: "#475966",
    stone: "#e7e1d0",
    tiles: "#9aacb6",
  },
  {
    plaster: "#c7d7d7",
    shadow: "#a0bbbe",
    shutter: "#4b6169",
    stone: "#eee9d8",
    tiles: "#6d97ac",
    tiled: true,
  },
  {
    plaster: "#ddd7c7",
    shadow: "#b8b09e",
    shutter: "#596a60",
    stone: "#f0e8d7",
    tiles: "#b0a57d",
    tiled: true,
  },
];
const BAY = 4;
const STOREY = 3.2;

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function canvasTexture(draw, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  draw(ctx, seeded(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function tilework(ctx, color, top, bottom, subtle = false) {
  ctx.save();
  ctx.strokeStyle = subtle ? "rgba(255,255,255,.20)" : "rgba(247,247,232,.42)";
  ctx.lineWidth = 1;
  for (let y = top; y < bottom; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      ctx.strokeStyle = color;
      ctx.globalAlpha = subtle ? 0.24 : 0.62;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 3);
      ctx.lineTo(x + 13, y + 8);
      ctx.lineTo(x + 8, y + 13);
      ctx.lineTo(x + 3, y + 8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = subtle
        ? "rgba(255,255,255,.20)"
        : "rgba(247,247,232,.42)";
    }
  }
  ctx.restore();
}

function drawFacade(ctx, random, p, index) {
  ctx.fillStyle = p.plaster;
  ctx.fillRect(0, 0, 256, 256);
  // Fine limewash grain survives close views without competing with the windows.
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle =
      random() > 0.5 ? "rgba(255,249,222,.045)" : "rgba(81,70,51,.035)";
    ctx.fillRect(
      random() * 256,
      random() * 256,
      1 + random() * 3,
      1 + random() * 2,
    );
  }
  if (p.tiled) tilework(ctx, p.tiles, 0, 256);
  else tilework(ctx, p.tiles, 220, 252, true);

  // Upper half of the atlas is one 3.2 m storey. The shader repeats only this
  // band above the ground floor, so shop doors never reappear on upper floors.
  const stone = p.stone;
  ctx.fillStyle = "rgba(77,67,51,.20)";
  ctx.fillRect(74, 14, 112, 96);
  ctx.fillStyle = stone;
  ctx.fillRect(75, 13, 106, 91);
  ctx.fillStyle = "#405a5e";
  ctx.fillRect(85, 20, 86, 76);
  const glass = ctx.createLinearGradient(88, 24, 164, 94);
  glass.addColorStop(0, "#718a86");
  glass.addColorStop(0.5, "#3f5357");
  glass.addColorStop(1, "#253b40");
  ctx.fillStyle = glass;
  ctx.fillRect(89, 24, 78, 67);
  ctx.fillStyle = "rgba(204,216,191,.35)";
  ctx.beginPath();
  ctx.moveTo(91, 25);
  ctx.lineTo(118, 25);
  ctx.lineTo(91, 73);
  ctx.fill();
  // Painted sash frames, lintel, sill, and narrow louvered shutters.
  ctx.fillStyle = "#d5d7c6";
  ctx.fillRect(125, 21, 4, 74);
  ctx.fillRect(86, 56, 84, 4);
  ctx.fillStyle = p.shutter;
  for (const x of [48, 183]) {
    ctx.fillRect(x, 21, 23, 76);
    ctx.strokeStyle = "rgba(23,41,37,.32)";
    ctx.lineWidth = 1;
    for (let y = 26; y < 95; y += 5) {
      ctx.beginPath();
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 20, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(218,222,195,.26)";
    ctx.fillRect(x + 1, 22, 2, 74);
    ctx.fillStyle = p.shutter;
  }
  ctx.fillStyle = stone;
  ctx.fillRect(72, 100, 114, 6);
  ctx.fillStyle = "rgba(89,74,56,.26)";
  ctx.fillRect(69, 106, 120, 3);
  // A restrained iron Juliet balcony, with its ledge painted into the atlas.
  if (index !== 3) {
    ctx.fillStyle = "rgba(41,50,45,.24)";
    ctx.fillRect(76, 89, 105, 23);
    ctx.strokeStyle = "#34413e";
    ctx.lineWidth = 2;
    ctx.strokeRect(73, 85, 109, 23);
    for (let x = 81; x < 181; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 85);
      ctx.lineTo(x, 107);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(74, 96);
    ctx.lineTo(181, 96);
    ctx.stroke();
  }
  ctx.fillStyle = stone;
  ctx.fillRect(0, 2, 256, 3);
  ctx.fillStyle = "rgba(78,68,48,.13)";
  ctx.fillRect(0, 6, 256, 2);
  ctx.fillRect(0, 123, 256, 3);

  // Ground-floor limestone surround and recessed door / café shopfront.
  ctx.fillStyle = "rgba(80,67,49,.15)";
  ctx.fillRect(38, 146, 183, 106);
  ctx.fillStyle = stone;
  ctx.fillRect(41, 144, 174, 108);
  ctx.fillStyle = "#384c4b";
  ctx.fillRect(50, 152, 155, 96);
  ctx.fillStyle = "#728a80";
  ctx.fillRect(55, 157, 65, 69);
  ctx.fillStyle = "#42595b";
  ctx.fillRect(132, 157, 65, 69);
  ctx.fillStyle = "rgba(228,221,193,.18)";
  ctx.fillRect(58, 160, 4, 61);
  ctx.fillRect(136, 160, 4, 61);
  ctx.fillStyle = p.shutter;
  ctx.fillRect(52, 226, 151, 21);
  ctx.fillStyle = "#dfd6ba";
  ctx.fillRect(123, 153, 5, 92);
  ctx.fillRect(53, 181, 149, 3);
  ctx.fillStyle = "#b7a276";
  ctx.fillRect(132, 201, 3, 9);
  ctx.fillStyle = p.shutter;
  ctx.fillRect(41, 136, 174, 11);
  ctx.fillStyle = "rgba(247,235,200,.76)";
  for (let x = 96; x < 159; x += 8) ctx.fillRect(x, 140, 4, 2);
  ctx.fillStyle = "#b5ae99";
  ctx.fillRect(0, 252, 256, 4);
  ctx.fillStyle = "rgba(245,236,213,.45)";
  ctx.fillRect(0, 249, 256, 2);
}

function drawRoof(ctx, random) {
  ctx.fillStyle = "#aa654b";
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 12; row++) {
    const y = row * (256 / 12);
    const shift = row % 2 ? -16 : 0;
    for (let col = 0; col < 9; col++) {
      const x = col * 32 + shift;
      const gradient = ctx.createLinearGradient(x, y, x + 32, y);
      gradient.addColorStop(0, "#9b573f");
      gradient.addColorStop(0.28, random() > 0.5 ? "#ca8a65" : "#bd7955");
      gradient.addColorStop(0.72, "#b77452");
      gradient.addColorStop(1, "#91503d");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, 32, 23);
      ctx.strokeStyle = "rgba(92,48,35,.43)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 20);
      ctx.quadraticCurveTo(x + 16, y + 24, x + 32, y + 20);
      ctx.stroke();
      ctx.strokeStyle = "rgba(231,164,113,.25)";
      ctx.beginPath();
      ctx.moveTo(x + 9, y + 2);
      ctx.lineTo(x + 9, y + 17);
      ctx.stroke();
    }
  }
}

export function createArchitecturePalette() {
  const night = { value: 0 };
  // Same atlas layout as drawFacade; only glass emits, including its sash gaps.
  const windowMask = canvasTexture((ctx) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(89, 24, 78, 61);
    ctx.fillRect(55, 157, 65, 69);
    ctx.fillRect(132, 157, 65, 69);
    ctx.fillStyle = "#000000";
    ctx.fillRect(125, 21, 4, 74);
    ctx.fillRect(86, 56, 84, 4);
    ctx.fillRect(53, 181, 149, 3);
  }, 0);
  const textures = PALETTES.map((p, i) =>
    canvasTexture((ctx, random) => drawFacade(ctx, random, p, i), i + 101),
  );
  const wallMaterials = textures.map((map) => {
    const material = new THREE.MeshStandardMaterial({
      map,
      color: "#ffffff",
      roughness: 0.86,
      emissive: "#f4b667",
      emissiveMap: windowMask,
      emissiveIntensity: 1.1,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.roamNight = night;
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        "uniform float roamNight;\nfloat roamFacadeV(float v) { return (v < 1.0 ? 0.0 : 0.5) + fract(v) * 0.5; }\nvoid main() {",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        THREE.ShaderChunk.emissivemap_fragment.replace(
          "texture2D( emissiveMap, vEmissiveMapUv )",
          "texture2D( emissiveMap, vec2(vEmissiveMapUv.x, roamFacadeV(vEmissiveMapUv.y)) )",
        ) + "\ntotalEmissiveRadiance *= roamNight;",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        THREE.ShaderChunk.map_fragment.replace(
          "texture2D( map, vMapUv )",
          "texture2D( map, vec2(vMapUv.x, roamFacadeV(vMapUv.y)) )",
        ),
      );
    };
    material.userData.nightUniform = night;
    material.customProgramCacheKey = () => "roam-lisbon-facade-atlas-night-v2";
    return material;
  });
  const roofTexture = canvasTexture(drawRoof, 801);
  const roofMaterial = new THREE.MeshStandardMaterial({
    map: roofTexture,
    color: "#ffffff",
    roughness: 0.92,
  });
  return {
    wallMaterials,
    roofMaterial,
    setNight(value) {
      night.value = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;
    },
    dispose() {
      textures.forEach((texture) => texture.dispose());
      roofTexture.dispose();
      windowMask.dispose();
      wallMaterials.forEach((material) => material.dispose());
      roofMaterial.dispose();
    },
  };
}

function geometry(positions, uvs) {
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  result.computeVertexNormals();
  return result;
}

function distanceToBoundary(x, z, points) {
  let distanceSquared = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    distanceSquared = Math.min(
      distanceSquared,
      (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2,
    );
  }
  return Math.sqrt(distanceSquared);
}

export function buildingArchitecture(building, { projectGeo, geoY }) {
  // Remove only a duplicated closing point / consecutive zero-length edges.
  // All meaningful mapped footprint vertices retain their exact coordinates.
  const ring = building.ring.filter(
    (p, i, list) => !i || p[0] !== list[i - 1][0] || p[1] !== list[i - 1][1],
  );
  if (
    ring.length > 1 &&
    ring[0][0] === ring.at(-1)[0] &&
    ring[0][1] === ring.at(-1)[1]
  )
    ring.pop();
  if (ring.length < 3) return null;
  const points = ring.map(projectGeo);
  const ground = ring.map(geoY);
  const base = Math.min(...ground),
    top = Math.max(...ground) + building.height;
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z);
  const width = Math.max(...xs) - Math.min(...xs),
    length = Math.max(...zs) - Math.min(...zs);
  const industrial = /industrial|warehouse|hangar|garage|shed|roof/.test(
    building.kind || "",
  );
  const flat =
    industrial ||
    building.height > 40 ||
    width * length > 9000 ||
    points.length > 40;
  const rise = flat
    ? 0
    : Math.min(3.2, Math.min(width, length) * 0.25, building.height * 0.18);
  const eave = top - rise,
    depth = eave - base;
  let area = 0,
    dominant = { x: 1, z: 0 },
    longest = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
    const edge = Math.hypot(b.x - a.x, b.z - a.z);
    if (edge > longest) {
      longest = edge;
      dominant = { x: (b.x - a.x) / edge, z: (b.z - a.z) / edge };
    }
  }
  const wallPositions = [],
    wallUVs = [];
  const pushWall = (vertices, uv) => {
    for (let i = 0; i < 3; i++) {
      wallPositions.push(...vertices[i]);
      wallUVs.push(...uv[i]);
    }
  };
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const edge = Math.hypot(b.x - a.x, b.z - a.z);
    if (edge < 0.01) continue;
    const u = edge / BAY,
      v = depth / STOREY;
    const vertices = [
      [a.x, base, a.z],
      [a.x, eave, a.z],
      [b.x, eave, b.z],
      [b.x, base, b.z],
    ];
    const uv = [
      [0, 0],
      [0, v],
      [u, v],
      [u, 0],
    ];
    for (const ids of area >= 0
      ? [
          [0, 1, 2],
          [0, 2, 3],
        ]
      : [
          [0, 2, 1],
          [0, 3, 2],
        ])
      pushWall(
        ids.map((id) => vertices[id]),
        ids.map((id) => uv[id]),
      );
  }

  // Earcut respects concave boundaries. Sampling within its triangles creates
  // a low hip profile without an unsafe centroid fan or a second flat roof.
  const triangles = THREE.ShapeUtils.triangulateShape(
    points.map((p) => new THREE.Vector2(p.x, p.z)),
    [],
  );
  const roofPositions = [],
    roofUVs = [];
  const roofVertex = (p) => [
    p.x,
    eave +
      (flat ? 0 : Math.min(rise, distanceToBoundary(p.x, p.z, points) * 0.5)),
    p.z,
  ];
  const roofUV = (p) => [
    (p.x * dominant.x + p.z * dominant.z) / 4,
    (p.z * dominant.x - p.x * dominant.z) / 4,
  ];
  const pushRoof = (a, b, c) => {
    const ordered =
      (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) > 0
        ? [a, c, b]
        : [a, b, c];
    for (const p of ordered) {
      roofPositions.push(...roofVertex(p));
      roofUVs.push(...roofUV(p));
    }
  };
  // At most 9 triangles per source triangle, 8 for a typical rectangular roof.
  const subdivisions = flat ? 1 : points.length === 4 ? 2 : 3;
  for (const ids of triangles) {
    const [a, b, c] = ids.map((id) => points[id]);
    const sample = (i, j) => ({
      x:
        a.x +
        ((b.x - a.x) * i) / subdivisions +
        ((c.x - a.x) * j) / subdivisions,
      z:
        a.z +
        ((b.z - a.z) * i) / subdivisions +
        ((c.z - a.z) * j) / subdivisions,
    });
    for (let i = 0; i < subdivisions; i++) {
      for (let j = 0; j < subdivisions - i; j++) {
        pushRoof(sample(i, j), sample(i + 1, j), sample(i, j + 1));
        if (i + j < subdivisions - 1)
          pushRoof(sample(i + 1, j), sample(i + 1, j + 1), sample(i, j + 1));
      }
    }
  }
  return {
    wall: geometry(wallPositions, wallUVs),
    roof: geometry(roofPositions, roofUVs),
    paletteIndex: Math.abs(Number(building.id) || 0) % PALETTES.length,
  };
}
