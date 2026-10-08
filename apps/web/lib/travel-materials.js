import * as THREE from "three";

export const TRAVEL_TEXTURE_SIZE = 128;
const TAU = Math.PI * 2;
const byte = (value) => Math.max(0, Math.min(255, Math.round(value)));

// Stable integer grain, independent of a browser, random seed or system clock.
function grain(x, y, salt = 0) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ salt;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function sample(kind, x, y) {
  const fine = grain(x, y, 731) - 0.5;
  if (kind === "fabric") {
    const warp = Math.cos((x * TAU) / 4),
      weft = Math.cos((y * TAU) / 4);
    const over = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
    const thread = over ? warp * 0.65 + weft * 0.35 : warp * 0.35 + weft * 0.65;
    const tone = 216 + thread * 6 + fine * 3;
    return [
      tone,
      tone,
      tone - 1,
      128 + thread * 20 + fine * 4,
      238 - thread * 4,
    ];
  }
  if (kind === "carpet") {
    const tuft = Math.sin((x * TAU) / 4) * Math.cos((y * TAU) / 4);
    const row = Math.cos((y * TAU) / 16);
    const tone = 207 + tuft * 4 + row * 2 + fine * 5;
    return [
      tone,
      tone,
      tone - 1,
      128 + tuft * 14 + row * 3 + fine * 8,
      245 - tuft * 3,
    ];
  }
  if (kind === "asphalt") {
    // Fine stone aggregate varies reflectance and height without painted noise.
    const aggregate = grain(Math.floor(x / 2), Math.floor(y / 2), 307) - 0.5;
    const tone = 192 + aggregate * 18 + fine * 5;
    return [
      tone - 1,
      tone,
      tone + 1,
      128 + aggregate * 32 + fine * 10,
      239 + aggregate * 10,
    ];
  }
  // Satin aircraft paint: very fine texture, restrained panel joins and flush
  // rivets. Light-coloured maps preserve the geometry's original livery tint.
  const join = x % 64 === 0 || y % 32 === 0;
  const rivet = x % 16 === 3 && y % 32 === 3;
  const tone = 252 + fine * 2 - (join ? 7 : 0) - (rivet ? 4 : 0);
  return [
    tone,
    tone,
    tone,
    128 + fine * 3 - (join ? 7 : 0) - (rivet ? 4 : 0),
    140 + fine * 5 + (join ? 3 : 0),
  ];
}

/** Original, shared travel surface maps. Each family owns two 128px textures:
 * a neutral colour map plus a packed scalar map (height R, roughness G).
 * Three's bumpMap reads R and roughnessMap reads G, so both can share that
 * scalar texture. Material colour, bumpScale and roughness remain caller-owned.
 * Call dispose once the travel scene is removed; repeat calls are harmless.
 */
export function createTravelMaterials() {
  const textures = [];
  let disposed = false;
  function texture(data, name, colorSpace, repeat) {
    const map = new THREE.DataTexture(
      data,
      TRAVEL_TEXTURE_SIZE,
      TRAVEL_TEXTURE_SIZE,
    );
    map.name = name;
    map.colorSpace = colorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(...repeat);
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 4;
    map.needsUpdate = true;
    textures.push(map);
    return map;
  }
  function family(kind, repeat) {
    const color = new Uint8Array(TRAVEL_TEXTURE_SIZE * TRAVEL_TEXTURE_SIZE * 4);
    const detail = new Uint8Array(color.length);
    for (let y = 0; y < TRAVEL_TEXTURE_SIZE; y++)
      for (let x = 0; x < TRAVEL_TEXTURE_SIZE; x++) {
        const [r, g, b, height, roughness] = sample(kind, x, y);
        const at = (y * TRAVEL_TEXTURE_SIZE + x) * 4;
        color.set([byte(r), byte(g), byte(b), 255], at);
        detail.set([byte(height), byte(roughness), 0, 255], at);
      }
    const map = texture(
      color,
      `ROAM ${kind} colour`,
      THREE.SRGBColorSpace,
      repeat,
    );
    const packed = texture(
      detail,
      `ROAM ${kind} height and roughness`,
      THREE.NoColorSpace,
      repeat,
    );
    return { map, bumpMap: packed, roughnessMap: packed };
  }
  return {
    fabric: family("fabric", [3, 3]),
    asphalt: family("asphalt", [10, 10]),
    carpet: family("carpet", [6, 6]),
    aircraft: family("aircraft", [2, 2]),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const map of textures) map.dispose();
    },
  };
}
