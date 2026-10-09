import * as THREE from "three";

// Original procedural decoration, not surveyed façades or roof reconstructions.
// Footprints, positions and the source building-height envelope remain intact.
const FAMILIES = [
  {
    name: "historic",
    bay: 3.5,
    storey: 3.2,
    roof: "hip",
    colors: ["#eea58f", "#f2cb68"],
    trim: "#fff0d5",
    frame: "#406f64",
  },
  {
    name: "azulejo",
    bay: 3.3,
    storey: 3.1,
    roof: "gable",
    colors: ["#6ba9db", "#62bcb0"],
    trim: "#f8f0d7",
    frame: "#f1eedc",
  },
  {
    name: "townhouse",
    bay: 4.1,
    storey: 3,
    roof: "gable",
    colors: ["#d49ec6", "#97cdb0"],
    trim: "#fff1d8",
    frame: "#667852",
  },
  {
    name: "civic",
    bay: 5.2,
    storey: 4.1,
    roof: "mansard",
    colors: ["#efdbb6", "#e5b099"],
    trim: "#fff4e1",
    frame: "#485a66",
  },
  {
    name: "modern",
    bay: 5.6,
    storey: 3.1,
    roof: "flat",
    colors: ["#edf0e8", "#e49b74"],
    trim: "#f6f0df",
    frame: "#58696e",
  },
  {
    name: "office",
    bay: 5.8,
    storey: 3.5,
    roof: "flat",
    colors: ["#87b9ce", "#648eac"],
    trim: "#c7dadc",
    frame: "#d9e7e7",
  },
  {
    name: "industrial",
    bay: 7.2,
    storey: 4.8,
    roof: "gable",
    colors: ["#a9bcc1", "#d1b667"],
    trim: "#e4e3d8",
    frame: "#465c63",
  },
];
const FACADES = FAMILIES.flatMap((family) =>
  family.colors.map((plaster, variant) => ({ ...family, plaster, variant })),
);
const MAX_DETAIL_VERTICES = 3600;

function hash(value) {
  let result = 2166136261;
  for (const char of String(value))
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function seeded(seed) {
  let value = seed >>> 0;
  return () =>
    (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function canvasTexture(draw, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  draw(canvas.getContext("2d"), seeded(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Each atlas has one ground-floor bay below, one repeatable upper storey above.
// Window shapes are shared by the colour atlas and its emissive glass mask.
function windowsFor(family) {
  switch (family) {
    case "historic":
      return [
        {
          x: 91,
          y: 22,
          w: 74,
          h: 74,
          sash: true,
          shutters: true,
          balcony: true,
        },
        { x: 51, y: 155, w: 68, h: 78, sash: true },
        { x: 137, y: 155, w: 68, h: 78, sash: true },
      ];
    case "azulejo":
      return [
        { x: 91, y: 19, w: 74, h: 85, sash: true },
        { x: 37, y: 156, w: 86, h: 76, arch: true, sash: true },
        { x: 156, y: 158, w: 47, h: 81, sash: true },
      ];
    case "townhouse":
      return [
        { x: 45, y: 26, w: 61, h: 66, shutters: true },
        { x: 153, y: 26, w: 61, h: 66, shutters: true },
        { x: 44, y: 163, w: 65, h: 58 },
        { x: 151, y: 158, w: 60, h: 81, arch: true },
      ];
    case "civic":
      return [
        { x: 35, y: 17, w: 65, h: 82, arch: true, sash: true },
        { x: 157, y: 17, w: 65, h: 82, arch: true, sash: true },
        { x: 34, y: 147, w: 68, h: 95, arch: true, sash: true },
        { x: 156, y: 147, w: 68, h: 95, arch: true, sash: true },
      ];
    case "modern":
      return [
        { x: 24, y: 23, w: 208, h: 65, thirds: true, balcony: true },
        { x: 24, y: 151, w: 93, h: 85 },
        { x: 143, y: 151, w: 89, h: 85 },
      ];
    case "office":
      return [
        { x: 7, y: 7, w: 242, h: 111, thirds: true, sash: true },
        { x: 7, y: 139, w: 242, h: 108, thirds: true, sash: true },
      ];
    default:
      return [
        { x: 25, y: 35, w: 82, h: 57, sash: true },
        { x: 149, y: 35, w: 82, h: 57, sash: true },
        { x: 27, y: 144, w: 83, h: 39, sash: true },
      ];
  }
}

function opening(ctx, x, y, w, h, arch = false) {
  if (!arch) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 2);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function paintWindow(ctx, p, win, mask) {
  const { x, y, w, h, arch } = win;
  if (!mask) {
    ctx.fillStyle = "rgba(50,47,40,.2)";
    opening(ctx, x - 6, y - 4, w + 14, h + 13, arch);
    ctx.fillStyle = p.trim;
    opening(ctx, x - 5, y - 6, w + 10, h + 13, arch);
    const glass = ctx.createLinearGradient(x, y, x + w, y + h);
    glass.addColorStop(0, p.name === "office" ? "#679bab" : "#749695");
    glass.addColorStop(0.55, "#3f626b");
    glass.addColorStop(1, "#29454e");
    ctx.fillStyle = glass;
  } else ctx.fillStyle = "#ffffff";
  opening(ctx, x, y, w, h, arch);
  if (!mask) {
    ctx.fillStyle = "rgba(224,241,225,.2)";
    ctx.fillRect(x + 4, y + (arch ? w / 2 : 4), 3, h - (arch ? w / 2 : 8));
  }
  ctx.fillStyle = mask ? "#000000" : p.frame;
  if (win.sash) {
    ctx.fillRect(x + w / 2 - 2, y, 4, h);
    ctx.fillRect(x, y + h * 0.53, w, 3);
  }
  if (win.thirds)
    for (const fraction of [1 / 3, 2 / 3])
      ctx.fillRect(x + w * fraction - 2, y, 4, h);
  if (mask) {
    if (win.balcony) {
      ctx.fillRect(x - 10, y + h - 17, w + 20, 3);
      for (let sx = x - 10; sx < x + w + 10; sx += 11)
        ctx.fillRect(sx, y + h - 17, 2, 27);
    }
    return;
  }
  if (win.shutters) {
    ctx.fillStyle = p.frame;
    for (const sx of [x - 22, x + w + 7]) {
      ctx.fillRect(sx, y + 3, 15, h - 4);
      ctx.fillStyle = "rgba(26,40,32,.4)";
      for (let sy = y + 9; sy < y + h - 3; sy += 6)
        ctx.fillRect(sx + 2, sy, 11, 1);
      ctx.fillStyle = p.frame;
    }
  }
  ctx.fillStyle = p.trim;
  ctx.fillRect(x - 8, y + h + 5, w + 16, 4);
  if (win.balcony) {
    ctx.fillStyle = "#43545a";
    ctx.fillRect(x - 10, y + h - 17, w + 20, 3);
    for (let sx = x - 10; sx < x + w + 10; sx += 11)
      ctx.fillRect(sx, y + h - 17, 2, 27);
    ctx.fillStyle = p.trim;
    ctx.fillRect(x - 12, y + h + 11, w + 24, 5);
  }
}

function drawFacade(ctx, random, p, mask = false) {
  ctx.fillStyle = mask ? "#000000" : p.plaster;
  ctx.fillRect(0, 0, 256, 256);
  if (!mask) {
    for (let i = 0; i < 350; i++) {
      ctx.fillStyle =
        random() > 0.5 ? "rgba(255,255,231,.065)" : "rgba(54,58,48,.04)";
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1);
    }
    if (p.name === "azulejo") {
      for (let y = 0; y < 256; y += 16)
        for (let x = 0; x < 256; x += 16) {
          ctx.strokeStyle = "rgba(247,244,220,.6)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
          ctx.beginPath();
          ctx.moveTo(x + 8, y + 2);
          ctx.lineTo(x + 14, y + 8);
          ctx.lineTo(x + 8, y + 14);
          ctx.lineTo(x + 2, y + 8);
          ctx.closePath();
          ctx.stroke();
        }
    }
    if (p.name === "civic") {
      ctx.fillStyle = p.trim;
      for (const x of [5, 122, 239]) ctx.fillRect(x, 0, 12, 256);
      ctx.strokeStyle = "rgba(109,84,64,.16)";
      for (let y = 0; y < 256; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
    }
    if (p.name === "industrial") {
      ctx.fillStyle = "rgba(68,87,94,.18)";
      for (let x = 0; x < 256; x += 9) ctx.fillRect(x, 0, 2, 256);
      // Service-door louvres, never included in the emissive glass mask.
      ctx.fillStyle = p.frame;
      ctx.fillRect(140, 146, 92, 97);
      ctx.fillStyle = "#809198";
      for (let y = 151; y < 239; y += 6) ctx.fillRect(144, y, 84, 2);
    }
    ctx.fillStyle = p.trim;
    ctx.fillRect(0, 0, 256, p.name === "modern" ? 12 : 5);
    ctx.fillRect(0, 120, 256, p.name === "modern" ? 8 : 5);
    ctx.fillRect(0, 250, 256, 6);
    if (p.name === "historic") {
      ctx.fillStyle = p.frame;
      ctx.fillRect(40, 139, 176, 10);
      ctx.fillStyle = "rgba(255,243,210,.72)";
      for (let x = 83; x < 178; x += 10) ctx.fillRect(x, 143, 5, 2);
    }
  }
  for (const win of windowsFor(p.name)) paintWindow(ctx, p, win, mask);
}

function drawRoof(ctx, random, finish) {
  const colors = ["#c07852", "#637078", "#d4d7cc", "#a8b7bb"];
  ctx.fillStyle = colors[finish];
  ctx.fillRect(0, 0, 256, 256);
  if (finish === 0) {
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 9; col++) {
        const x = col * 32 - (row % 2 ? 16 : 0),
          y = row * 22;
        const gradient = ctx.createLinearGradient(x, y, x + 32, y);
        gradient.addColorStop(0, "#92523b");
        gradient.addColorStop(0.3, random() > 0.5 ? "#dd9c72" : "#c7845b");
        gradient.addColorStop(1, "#a26043");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, 32, 22);
        ctx.fillStyle = "rgba(80,46,31,.2)";
        ctx.fillRect(x, y + 20, 32, 2);
      }
  } else if (finish === 1) {
    ctx.strokeStyle = "rgba(30,42,51,.3)";
    for (let y = 0; y < 256; y += 16)
      for (let x = 0; x < 256; x += 32)
        ctx.strokeRect(x - (y % 32 ? 16 : 0), y, 32, 16);
  } else if (finish === 3) {
    ctx.fillStyle = "rgba(64,86,96,.28)";
    for (let x = 0; x < 256; x += 12) ctx.fillRect(x, 0, 2, 256);
  } else {
    ctx.strokeStyle = "rgba(118,127,123,.22)";
    for (let y = 0; y < 256; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  }
}

export function createArchitecturePalette() {
  const night = { value: 0 };
  const masks = FAMILIES.map((family) =>
    canvasTexture((ctx, random) => drawFacade(ctx, random, family, true), 0),
  );
  const textures = FACADES.map((p, i) =>
    canvasTexture((ctx, random) => drawFacade(ctx, random, p), i + 101),
  );
  const wallMaterials = textures.map((map, i) => {
    const material = new THREE.MeshStandardMaterial({
      map,
      color: "#ffffff",
      roughness: FACADES[i].name === "office" ? 0.52 : 0.86,
      emissive: "#f4b667",
      emissiveMap: masks[Math.floor(i / 2)],
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
        ) +
          // Stable per-bay occupancy makes the city feel inhabited without a
          // separate light for every window or an animation that flickers.
          "\ntotalEmissiveRadiance *= roamNight;\n#ifdef USE_EMISSIVEMAP\nvec2 roamWindow = floor(vec2(vEmissiveMapUv.x * 2.0, vEmissiveMapUv.y));\nfloat roamOccupied = fract(sin(dot(roamWindow, vec2(17.17, 83.13))) * 43758.5453);\ntotalEmissiveRadiance *= mix(0.08, 1.0, step(0.38, roamOccupied));\n#endif",
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
    material.userData.family = FACADES[i].name;
    material.customProgramCacheKey = () => "roam-facade-family-atlas-night-v4";
    return material;
  });
  const roofTextures = [0, 1, 2, 3].map((finish) =>
    canvasTexture((ctx, random) => drawRoof(ctx, random, finish), 801 + finish),
  );
  const roofMaterials = roofTextures.map(
    (map) =>
      new THREE.MeshStandardMaterial({ map, color: "#ffffff", roughness: 0.9 }),
  );
  const detailMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.83,
  });
  let disposed = false;
  return {
    wallMaterials,
    roofMaterials,
    roofMaterial: roofMaterials[0],
    detailMaterial,
    setNight(value) {
      night.value = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      [...textures, ...masks, ...roofTextures].forEach((texture) =>
        texture.dispose(),
      );
      [...wallMaterials, ...roofMaterials, detailMaterial].forEach((material) =>
        material.dispose(),
      );
    },
  };
}

function geometry(positions, uvs, colors) {
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  if (uvs) result.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (colors)
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  result.computeVertexNormals();
  return result;
}

function prepareBuilding(building, { projectGeo, geoY }) {
  if (
    !Array.isArray(building.ring) ||
    !Number.isFinite(building.height) ||
    building.height <= 0
  )
    return null;
  // Drop only duplicate closing/consecutive points; retain every meaningful vertex.
  const ring = building.ring.filter(
    (p, i, list) => !i || p[0] !== list[i - 1][0] || p[1] !== list[i - 1][1],
  );
  if (
    ring.length > 1 &&
    ring[0][0] === ring.at(-1)[0] &&
    ring[0][1] === ring.at(-1)[1]
  )
    ring.pop();
  if (
    ring.length < 3 ||
    ring.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
  )
    return null;
  const points = ring.map(projectGeo),
    ground = ring.map(geoY);
  if (
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z)) ||
    ground.some((y) => !Number.isFinite(y))
  )
    return null;
  let signedArea = 0,
    longest = 0,
    dominant = { x: 1, z: 0 };
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    signedArea += a.x * b.z - b.x * a.z;
    const edge = Math.hypot(b.x - a.x, b.z - a.z);
    if (edge > longest) {
      longest = edge;
      dominant = { x: (b.x - a.x) / edge, z: (b.z - a.z) / edge };
    }
  }
  if (Math.abs(signedArea) < 0.001) return null;
  const side = (p) => p.z * dominant.x - p.x * dominant.z;
  const along = (p) => p.x * dominant.x + p.z * dominant.z;
  const cross = points.map(side),
    span = points.map(along);
  const short = Math.max(...cross) - Math.min(...cross),
    length = Math.max(...span) - Math.min(...span);
  const area = Math.abs(signedArea) / 2;
  const seed = hash(building.id ?? JSON.stringify(ring));
  const kind = String(building.kind || "").toLowerCase();
  const matches = (pattern) => pattern.test(kind);
  let family;
  if (matches(/industrial|warehouse|hangar|garage|shed|roof|service|farm|barn/))
    family = "industrial";
  else if (matches(/transportation|terminal|airport|station/))
    family = "office";
  else if (matches(/office|commercial|retail|supermarket/)) family = "office";
  else if (
    matches(
      /church|cathedral|chapel|civic|public|school|university|hospital|museum|government/,
    )
  )
    family = "civic";
  else if (matches(/house|detached|semidetached|bungalow|villa|terrace/))
    family = "townhouse";
  else if (matches(/apartments|residential|hotel|dormitory/))
    family =
      building.height > 18 || area > 420
        ? "modern"
        : seed % 2
          ? "azulejo"
          : "historic";
  else if (building.height > 32) family = seed % 2 ? "office" : "modern";
  else if (area > 1800) family = seed % 3 ? "industrial" : "office";
  else if (area > 700 || short > 28) family = seed % 3 ? "modern" : "civic";
  else if (building.height < 8 && area < 180) family = "townhouse";
  else {
    // Lisbon's untagged central stock receives several original old-town forms;
    // outside the centre, modern residential forms share the same generic mix.
    const center = ring.reduce(
      (p, v) => [p[0] + v[0] / ring.length, p[1] + v[1] / ring.length],
      [0, 0],
    );
    const central =
      center[0] > -9.19 &&
      center[0] < -9.09 &&
      center[1] > 38.695 &&
      center[1] < 38.738;
    family = (
      central
        ? ["historic", "azulejo", "townhouse", "historic", "azulejo", "modern"]
        : ["historic", "azulejo", "townhouse", "modern", "modern", "civic"]
    )[seed % 6];
  }
  const familyIndex = FAMILIES.findIndex((p) => p.name === family);
  const spec = FAMILIES[familyIndex];
  let roofStyle = spec.roof;
  if (building.height > 38 || area > 1400 || points.length > 40 || short < 1.5)
    roofStyle = "flat";
  if (roofStyle !== "flat" && family === "historic" && (seed >>> 12) % 3 === 0)
    roofStyle = "gable";
  if (roofStyle !== "flat" && family === "townhouse" && (seed >>> 12) % 3 === 0)
    roofStyle = "hip";
  const base = Math.min(...ground),
    top = Math.max(...ground) + building.height;
  const rise =
    roofStyle === "flat"
      ? 0
      : Math.min(
          family === "industrial" ? 1.7 : 3.8,
          short * (family === "industrial" ? 0.13 : 0.3),
          building.height * (family === "civic" ? 0.25 : 0.2),
        );
  const roofIndex =
    family === "industrial" || family === "office"
      ? 3
      : roofStyle === "flat"
        ? 2
        : roofStyle === "mansard"
          ? 1
          : 0;
  return {
    points,
    ring,
    signedArea,
    area,
    dominant,
    side,
    short,
    length,
    crossMin: Math.min(...cross),
    crossMax: Math.max(...cross),
    base,
    top,
    rise,
    eave: top - rise,
    family,
    roofStyle,
    roofIndex,
    paletteIndex: familyIndex * 2 + ((seed >>> 8) % 2),
    bay: spec.bay,
    storey: spec.storey,
    seed,
  };
}

export function buildingArchitectureProfile(building, context) {
  const data = prepareBuilding(building, context);
  if (!data) return null;
  const { family, paletteIndex, roofIndex, roofStyle, bay, storey, eave, top } =
    data;
  return { family, paletteIndex, roofIndex, roofStyle, bay, storey, eave, top };
}

function distanceToBoundary(x, z, points) {
  let squared = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    squared = Math.min(
      squared,
      (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2,
    );
  }
  return Math.sqrt(squared);
}

function roofHeight(p, d) {
  if (d.roofStyle === "flat") return d.top;
  if (d.roofStyle === "gable") {
    const half = (d.crossMax - d.crossMin) / 2,
      center = (d.crossMax + d.crossMin) / 2;
    return (
      d.eave + d.rise * Math.max(0, 1 - Math.abs(d.side(p) - center) / half)
    );
  }
  const slope = d.roofStyle === "mansard" ? 2.5 : 1;
  return (
    d.eave +
    Math.min(
      d.rise,
      ((distanceToBoundary(p.x, p.z, d.points) * d.rise * 2) / d.short) * slope,
    )
  );
}

function ridgeSplit(vertices, d, sign) {
  const center = (d.crossMin + d.crossMax) / 2,
    result = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length],
      da = (d.side(a) - center) * sign,
      db = (d.side(b) - center) * sign;
    if (da >= -1e-8) result.push(a);
    if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return result;
}

function contains(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function detailsGeometry(d) {
  // Close-range decoration has one coloured material, no lights/meshes/materials
  // per building. Rings with many vertices or huge complexes stay inexpensive.
  if (d.points.length > 16 || d.area > 1600 || d.eave - d.base < 1) return null;
  const positions = [],
    colors = [];
  const box = (x, y, z, width, height, depth, axis, tint) => {
    if (positions.length / 3 + 36 > MAX_DETAIL_VERTICES || height <= 0) return;
    const color = new THREE.Color(tint);
    const perpendicular = { x: -axis.z, z: axis.x };
    const vertices = [];
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        for (const sx of [-1, 1])
          vertices.push([
            x + (axis.x * sx * width) / 2 + (perpendicular.x * sz * depth) / 2,
            y + (sy * height) / 2,
            z + (axis.z * sx * width) / 2 + (perpendicular.z * sz * depth) / 2,
          ]);
    for (const face of [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 6, 7, 3],
      [0, 4, 6, 2],
      [1, 3, 7, 5],
    ])
      for (const i of [face[0], face[1], face[2], face[0], face[2], face[3]]) {
        positions.push(...vertices[i]);
        colors.push(color.r, color.g, color.b);
      }
  };
  const spec = FACADES[d.paletteIndex],
    edges = [];
  for (let i = 0; i < d.points.length; i++) {
    const a = d.points[i],
      b = d.points[(i + 1) % d.points.length],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1.5) continue;
    const axis = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
    const outward = {
      x: (d.signedArea > 0 ? 1 : -1) * axis.z,
      z: (d.signedArea > 0 ? -1 : 1) * axis.x,
    };
    // A real ledge distinguishes stone/painted/modern façades at street level.
    const bandHeight =
      d.family === "civic" ? 0.35 : d.family === "modern" ? 0.24 : 0.17;
    box(
      (a.x + b.x) / 2,
      d.eave - bandHeight / 2,
      (a.z + b.z) / 2,
      length,
      bandHeight,
      d.family === "civic" ? 0.4 : 0.22,
      axis,
      spec.trim,
    );
    if (d.family === "civic" || d.roofStyle === "flat")
      box(
        (a.x + b.x) / 2,
        d.top - 0.17,
        (a.z + b.z) / 2,
        length,
        0.32,
        0.18,
        axis,
        spec.trim,
      );
    edges.push({ a, length, axis, outward });
  }
  if (["historic", "azulejo", "modern"].includes(d.family)) {
    let balconies = 0;
    for (const edge of edges.sort((a, b) => b.length - a.length).slice(0, 2)) {
      const floors = Math.min(3, Math.floor((d.eave - d.base) / d.storey) - 1);
      for (let floor = 1; floor <= floors; floor++)
        for (let bay = 0; bay < Math.floor(edge.length / d.bay); bay++) {
          if (balconies >= 8) break;
          if ((bay + floor + d.seed) % 2) continue;
          const t = (bay + 0.5) * d.bay,
            width = Math.min(d.bay * 0.68, 2.8);
          const x = edge.a.x + edge.axis.x * t,
            z = edge.a.z + edge.axis.z * t;
          const y = d.base + (floor + 0.19) * d.storey;
          if (y + 0.75 >= d.eave) continue;
          box(
            x + edge.outward.x * 0.22,
            y,
            z + edge.outward.z * 0.22,
            width,
            0.13,
            0.6,
            edge.axis,
            spec.trim,
          );
          box(
            x + edge.outward.x * 0.47,
            y + 0.67,
            z + edge.outward.z * 0.47,
            width,
            0.07,
            0.07,
            edge.axis,
            "#43565b",
          );
          for (const offset of [-0.45, -0.15, 0.15, 0.45])
            box(
              x + edge.outward.x * 0.47 + edge.axis.x * width * offset,
              y + 0.36,
              z + edge.outward.z * 0.47 + edge.axis.z * width * offset,
              0.04,
              0.58,
              0.04,
              edge.axis,
              "#43565b",
            );
          balconies++;
        }
    }
  }
  if (d.roofStyle !== "flat" && d.rise > 0.65 && d.family !== "industrial") {
    const triangles = THREE.ShapeUtils.triangulateShape(
      d.points.map((p) => new THREE.Vector2(p.x, p.z)),
      [],
    );
    for (const ids of triangles) {
      const [a, b, c] = ids.map((i) => d.points[i]),
        p = {
          x: a.x * 0.55 + b.x * 0.225 + c.x * 0.225,
          z: a.z * 0.55 + b.z * 0.225 + c.z * 0.225,
        };
      if (
        ![
          [-0.3, -0.3],
          [0.3, -0.3],
          [-0.3, 0.3],
          [0.3, 0.3],
        ].every(([x, z]) => contains({ x: p.x + x, z: p.z + z }, d.points))
      )
        continue;
      const y = roofHeight(p, d),
        height = Math.min(1.1, d.top - y);
      if (height < 0.3) continue;
      box(
        p.x,
        y + height / 2 - 0.04,
        p.z,
        0.52,
        height,
        0.52,
        d.dominant,
        spec.trim,
      );
      box(p.x, y + height - 0.06, p.z, 0.66, 0.12, 0.66, d.dominant, "#af765b");
      break;
    }
  }
  return positions.length ? geometry(positions, null, colors) : null;
}

export function createBuildingDetails(building, context) {
  const data = prepareBuilding(building, context);
  return data ? detailsGeometry(data) : null;
}

export function buildingArchitecture(building, context, options = {}) {
  const d = prepareBuilding(building, context);
  if (!d) return null;
  const wallPositions = [],
    wallUVs = [],
    roofPositions = [],
    roofUVs = [];
  const pushWall = (vertices, uv) => {
    for (let i = 0; i < 3; i++) {
      wallPositions.push(...vertices[i]);
      wallUVs.push(...uv[i]);
    }
  };
  for (let i = 0; i < d.points.length; i++) {
    const a = d.points[i],
      b = d.points[(i + 1) % d.points.length],
      edge = Math.hypot(b.x - a.x, b.z - a.z);
    if (edge < 0.01) continue;
    const u = edge / d.bay,
      v = (d.eave - d.base) / d.storey;
    const vertices = [
        [a.x, d.base, a.z],
        [a.x, d.eave, a.z],
        [b.x, d.eave, b.z],
        [b.x, d.base, b.z],
      ],
      uv = [
        [0, 0],
        [0, v],
        [u, v],
        [u, 0],
      ];
    for (const ids of d.signedArea >= 0
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
    if (d.roofStyle === "gable") {
      const edgePoints = [a, b],
        center = (d.crossMin + d.crossMax) / 2,
        da = d.side(a) - center,
        db = d.side(b) - center;
      if (da * db < -1e-8) {
        const t = da / (da - db);
        edgePoints.splice(1, 0, {
          x: a.x + (b.x - a.x) * t,
          z: a.z + (b.z - a.z) * t,
        });
      }
      for (let j = 0; j < edgePoints.length - 1; j++) {
        const p = edgePoints[j],
          q = edgePoints[j + 1],
          py = roofHeight(p, d),
          qy = roofHeight(q, d);
        const pu = Math.hypot(p.x - a.x, p.z - a.z) / d.bay,
          qu = Math.hypot(q.x - a.x, q.z - a.z) / d.bay;
        const cap = [
            [p.x, d.eave, p.z],
            [p.x, py, p.z],
            [q.x, qy, q.z],
            [q.x, d.eave, q.z],
          ],
          capUV = [
            [pu, v],
            [pu, (py - d.base) / d.storey],
            [qu, (qy - d.base) / d.storey],
            [qu, v],
          ];
        for (const ids of d.signedArea >= 0
          ? [
              [0, 1, 2],
              [0, 2, 3],
            ]
          : [
              [0, 2, 1],
              [0, 3, 2],
            ])
          pushWall(
            ids.map((id) => cap[id]),
            ids.map((id) => capUV[id]),
          );
      }
    }
  }
  const triangles = THREE.ShapeUtils.triangulateShape(
    d.points.map((p) => new THREE.Vector2(p.x, p.z)),
    [],
  );
  const pushRoof = (a, b, c) => {
    if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-9)
      return;
    const ordered =
      (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) > 0
        ? [a, c, b]
        : [a, b, c];
    for (const p of ordered) {
      roofPositions.push(p.x, roofHeight(p, d), p.z);
      roofUVs.push(
        (p.x * d.dominant.x + p.z * d.dominant.z) / 4,
        d.side(p) / 4,
      );
    }
  };
  for (const ids of triangles) {
    const vertices = ids.map((id) => d.points[id]);
    if (d.roofStyle === "gable") {
      for (const sign of [-1, 1]) {
        const polygon = ridgeSplit(vertices, d, sign);
        for (let i = 1; i < polygon.length - 1; i++)
          pushRoof(polygon[0], polygon[i], polygon[i + 1]);
      }
    } else if (d.roofStyle === "flat") pushRoof(...vertices);
    else {
      const [a, b, c] = vertices,
        subdivisions =
          d.roofStyle === "mansard" ? 4 : d.points.length === 4 ? 2 : 3;
      const sample = (i, j) => ({
        x: a.x + ((b.x - a.x) * i + (c.x - a.x) * j) / subdivisions,
        z: a.z + ((b.z - a.z) * i + (c.z - a.z) * j) / subdivisions,
      });
      for (let i = 0; i < subdivisions; i++)
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
    family: d.family,
    roofStyle: d.roofStyle,
    paletteIndex: d.paletteIndex,
    roofIndex: d.roofIndex,
    details: options.detail || context.detail ? detailsGeometry(d) : null,
  };
}
