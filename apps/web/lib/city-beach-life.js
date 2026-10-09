import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  createCharacter,
  animateCharacter,
  disposeCharacter,
} from "./characters";
import {
  demographicProfile,
  applyLocalDemographicVisuals,
  npcSeed,
} from "./npc-demographics";

// Authored holiday scenery on mapped sand, never a live attendance estimate.
// Static furnishings and resting visitors are baked into two vertex-color draws.
const TONES = [
  "#f47b73",
  "#55c6cb",
  "#ffc951",
  "#8f91e8",
  "#70b694",
  "#ef9ab9",
];
const PEDESTRIAN = new Set([
  "footway",
  "pedestrian",
  "path",
  "steps",
  "cycleway",
]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (point) =>
  point && Number.isFinite(point.x) && Number.isFinite(point.z);

function inside(point, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    )
      result = !result;
  }
  return result;
}
function edgeDistance(point, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(
    ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  );
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}
function bounds(ring) {
  const box = {
    minX: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxZ: -Infinity,
  };
  for (const point of ring) {
    box.minX = Math.min(box.minX, point.x);
    box.maxX = Math.max(box.maxX, point.x);
    box.minZ = Math.min(box.minZ, point.z);
    box.maxZ = Math.max(box.maxZ, point.z);
  }
  return box;
}
function distanceToBounds(point, box) {
  return Math.hypot(
    Math.max(box.minX - point.x, 0, point.x - box.maxX),
    Math.max(box.minZ - point.z, 0, point.z - box.maxZ),
  );
}
function cleanRing(source, projectGeo) {
  if (!Array.isArray(source) || source.length < 3) return null;
  const ring = source.map(projectGeo);
  if (!ring.every(finite)) return null;
  if (
    ring.length > 3 &&
    Math.hypot(ring[0].x - ring.at(-1).x, ring[0].z - ring.at(-1).z) < 1e-7
  )
    ring.pop();
  return ring.length >= 3 ? ring : null;
}
function toGeographic(chunk, projectGeo, unprojectGeo) {
  if (unprojectGeo) return (point) => unprojectGeo(point.x, point.z);
  const b = chunk.bounds;
  if (!Array.isArray(b) || b.length !== 4) return null;
  const a = projectGeo([b[0], b[1]]),
    z = projectGeo([b[2], b[3]]);
  if (
    !finite(a) ||
    !finite(z) ||
    Math.abs(z.x - a.x) < 1e-9 ||
    Math.abs(z.z - a.z) < 1e-9
  )
    return null;
  return (point) => [
    b[0] + ((point.x - a.x) / (z.x - a.x)) * (b[2] - b[0]),
    b[1] + ((point.z - a.z) / (z.z - a.z)) * (b[3] - b[1]),
  ];
}
function colored(geometry, tone) {
  if (geometry.index) {
    const source = geometry;
    geometry = source.toNonIndexed();
    source.dispose();
  }
  geometry.deleteAttribute("uv");
  const color = new THREE.Color(tone),
    array = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < array.length; i += 3) {
    array[i] = color.r;
    array[i + 1] = color.g;
    array[i + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(array, 3));
  return geometry;
}
function combined(parts) {
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return geometry;
}
function box(w, h, d, x, y, z, color, rotation = 0) {
  return colored(
    new THREE.BoxGeometry(w, h, d).rotateX(rotation).translate(x, y, z),
    color,
  );
}
function umbrella(tone) {
  const positions = [],
    colors = [],
    white = new THREE.Color("#fff7e3"),
    bright = new THREE.Color(tone);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2,
      b = ((i + 1) / 16) * Math.PI * 2;
    positions.push(
      0,
      2.52,
      0,
      Math.cos(a) * 1.8,
      2.07,
      Math.sin(a) * 1.8,
      Math.cos(b) * 1.8,
      2.07,
      Math.sin(b) * 1.8,
    );
    const color = i % 4 < 2 ? bright : white;
    for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
  }
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  canopy.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  canopy.computeVertexNormals();
  return [
    canopy,
    colored(
      new THREE.CylinderGeometry(0.035, 0.045, 2.42, 6).translate(0, 1.21, 0),
      "#c9ab77",
    ),
    colored(
      new THREE.SphereGeometry(0.07, 6, 4).translate(0, 2.56, 0),
      "#e5d3a3",
    ),
  ];
}
function deckChair(x, tone) {
  const parts = [
    box(0.63, 0.055, 1.68, x, 0.37, 0.25, tone),
    box(0.63, 0.055, 0.82, x, 0.66, -0.59, tone, -0.72),
  ];
  for (const side of [-0.34, 0.34]) {
    parts.push(box(0.045, 0.07, 1.77, x + side, 0.34, 0.25, "#c4a473"));
    for (const z of [-0.28, 0.87])
      parts.push(box(0.045, 0.38, 0.055, x + side, 0.19, z, "#c4a473"));
  }
  for (const dx of [-0.2, 0.2])
    parts.push(box(0.07, 0.01, 1.66, x + dx, 0.401, 0.25, "#fff7e3"));
  return parts;
}
function arrangementParts(tone, cabana, index) {
  const parts = [...deckChair(-1.05, tone), ...deckChair(1.05, tone)];
  if (cabana) {
    for (const x of [-2, 2])
      for (const z of [-1.25, 1.25])
        parts.push(box(0.08, 2.45, 0.08, x, 1.225, z, "#b79968"));
    parts.push(box(4.25, 0.055, 2.75, 0, 2.45, 0, "#f8eacd"));
    for (const z of [-1.37, 1.37])
      parts.push(box(4.25, 0.22, 0.04, 0, 2.34, z, tone));
  } else parts.push(...umbrella(tone));
  parts.push(
    box(0.48, 0.05, 0.45, 0, 0.45, 0.45, "#eee5c7"),
    box(0.08, 0.43, 0.08, 0, 0.215, 0.45, "#b79767"),
  );
  parts.push(
    box(0.3, 0.32, 0.25, -1.85, 0.18, 0.58, "#dcaa7b"),
    colored(
      new THREE.TorusGeometry(0.105, 0.018, 4, 8).translate(-1.85, 0.34, 0.58),
      "#856647",
    ),
  );
  parts.push(
    box(0.36, 0.29, 0.29, 1.79, 0.16, 0.67, index % 2 ? "#8cd1df" : "#f19b72"),
    box(0.38, 0.045, 0.31, 1.79, 0.325, 0.67, "#fff8eb"),
  );
  if (index % 3 === 0)
    parts.push(
      colored(
        new THREE.SphereGeometry(0.18, 10, 6).translate(1.86, 0.19, -0.2),
        "#ffc951",
      ),
    );
  parts.push(box(0.72, 0.025, 1.6, 0, 0.04, -0.18, tone));
  for (const z of [-0.75, 0.4])
    parts.push(box(0.72, 0.012, 0.09, 0, 0.06, z, "#fff8e6"));
  return parts;
}
function staticCharacterParts(character, parts) {
  character.updateMatrixWorld(true);
  character.traverse((node) => {
    if (!node.isMesh) return;
    let geometry = node.geometry.clone();
    if (geometry.index) {
      const indexed = geometry;
      geometry = indexed.toNonIndexed();
      indexed.dispose();
    }
    geometry.deleteAttribute("uv");
    geometry.applyMatrix4(node.matrixWorld);
    if (!geometry.attributes.color)
      geometry = colored(geometry, node.material.color);
    parts.push(geometry);
  });
  disposeCharacter(character);
}
function beachClothes(character, index) {
  // The shared explorer silhouette provides shorts and bare lower legs. Drop its
  // city daypack from the rigid feature batch so resting visitors wear light tops.
  const details = character.getObjectByName("wardrobe details");
  if (details?.geometry.index && details.userData.features) {
    const excluded = [];
    let start = 0;
    for (const [name, feature] of Object.entries(details.userData.features)) {
      if (/day pack|backpack/.test(name))
        excluded.push([start, start + feature.vertices]);
      start += feature.vertices;
    }
    if (excluded.length) {
      const indices = details.geometry.index.array,
        kept = [];
      for (let i = 0; i < indices.length; i += 3) {
        if (!excluded.some(([a, b]) => indices[i] >= a && indices[i] < b))
          kept.push(indices[i], indices[i + 1], indices[i + 2]);
      }
      details.geometry.setIndex(kept);
    }
  }
  if (index % 3 === 0) {
    const hat = combined([
      colored(
        new THREE.CylinderGeometry(0.18, 0.18, 0.018, 12)
          .scale(1, 1, 0.9)
          .translate(0, 0.121, 0),
        "#e7ce98",
      ),
      colored(
        new THREE.CylinderGeometry(0.11, 0.125, 0.11, 12).translate(
          0,
          0.174,
          0,
        ),
        "#f0dbaf",
      ),
      colored(
        new THREE.CylinderGeometry(0.119, 0.122, 0.023, 12).translate(
          0,
          0.137,
          0,
        ),
        TONES[index % TONES.length],
      ),
    ]);
    const mesh = new THREE.Mesh(
      hat,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    );
    mesh.name = "Beach sunhat";
    mesh.castShadow = true;
    character.userData.rig.head.add(mesh);
  }
}
function beachPose(character, pose) {
  const rig = character.userData.rig;
  if (pose === "seated") {
    rig.hips.position.y = character.userData.restHipY - 0.48;
    rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -1.05;
    rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = 1.1;
    rig.leftElbow.rotation.x = -0.65;
    rig.rightElbow.rotation.x = -0.8;
  } else if (pose === "lounging") {
    character.rotation.x = -Math.PI / 2;
    rig.leftElbow.rotation.x = -0.9;
    rig.rightElbow.rotation.x = -0.8;
    rig.leftArm.rotation.z = -0.13;
    rig.rightArm.rotation.z = 0.13;
  } else {
    rig.leftArm.rotation.x = -0.2;
    rig.rightArm.rotation.x = -0.7;
    rig.rightElbow.rotation.x = -0.9;
  }
}

/**
 * @param {any} chunk
 * @param {{projectGeo: (point:any)=>{x:number,z:number}, geoY:(point:any)=>number, focusPoint:any, unprojectGeo?: (x:number,z:number)=>any, waterAt?:(point:{x:number,z:number})=>boolean, maxPeople?:number, maxArrangements?:number, radius?:number}} options
 */
export function createBeachLife(chunk, options) {
  const group = new THREE.Group();
  group.name = "Living mapped beaches";
  const stats = {
    simulated: true,
    arrangements: 0,
    parasols: 0,
    canopies: 0,
    loungers: 0,
    towels: 0,
    people: 0,
    walkers: 0,
    resting: 0,
    drawCalls: 0,
    reservations: [],
    plots: [],
    actors: [],
    animatedActors: [],
    elapsed: 0,
  };
  group.userData.beachLife = stats;
  const { projectGeo, geoY } = options || {};
  if (
    !chunk ||
    !Array.isArray(chunk.bounds) ||
    chunk.bounds.length !== 4 ||
    !chunk.bounds.every(Number.isFinite) ||
    !projectGeo ||
    !geoY ||
    !options.focusPoint
  )
    return group;
  const focus = Array.isArray(options.focusPoint)
    ? projectGeo(options.focusPoint)
    : options.focusPoint;
  const toGeo = toGeographic(chunk, projectGeo, options.unprojectGeo);
  if (!finite(focus) || !toGeo) return group;
  const chunkBounds = chunk.bounds;
  const owned = (point) => {
    const geo = toGeo(point);
    return (
      geo[0] >= chunkBounds[0] &&
      geo[0] < chunkBounds[2] &&
      geo[1] >= chunkBounds[1] &&
      geo[1] < chunkBounds[3]
    );
  };
  const radius = clamp(
    Number.isFinite(options.radius) ? options.radius : 95,
    30,
    160,
  );
  const maxPlots = clamp(
    Number.isFinite(options.maxArrangements)
      ? Math.floor(options.maxArrangements)
      : 40,
    0,
    48,
  );
  const maxPeople = clamp(
    Number.isFinite(options.maxPeople) ? Math.floor(options.maxPeople) : 32,
    0,
    40,
  );
  const sand = (chunk.surfaces || [])
    .filter((surface) => surface.kind === "sand")
    .map((surface) => {
      const ring = cleanRing(surface.ring, projectGeo);
      if (!ring) return null;
      const holes = (surface.holes || [])
        .map((hole) => cleanRing(hole, projectGeo))
        .filter(Boolean);
      return { id: surface.id, ring, holes, box: bounds(ring) };
    })
    .filter(
      (surface) => surface && distanceToBounds(focus, surface.box) <= radius,
    );
  if (!sand.length || !maxPlots) return group;
  const buildings = (chunk.buildings || [])
    .map((building) => cleanRing(building.ring, projectGeo))
    .filter(Boolean)
    .map((ring) => ({ ring, box: bounds(ring) }));
  const roads = [];
  for (const road of chunk.roads || []) {
    const points = (road.points || []).map(projectGeo);
    if (!points.every(finite)) continue;
    for (let i = 1; i < points.length; i++)
      roads.push({
        a: points[i - 1],
        b: points[i],
        half: Math.max(
          PEDESTRIAN.has(road.kind) ? 1.1 : 2,
          Number(road.width) / 2 || 0,
        ),
      });
  }
  const samples = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.707, 0.707],
    [-0.707, 0.707],
    [0.707, -0.707],
    [-0.707, -0.707],
  ];
  const safe = (point, clearance, surface) => {
    if (
      !inside(point, surface.ring) ||
      surface.holes.some((hole) => inside(point, hole))
    )
      return false;
    for (const ring of [surface.ring, ...surface.holes])
      for (let i = 0; i < ring.length; i++)
        if (
          edgeDistance(point, ring[i], ring[(i + 1) % ring.length]) < clearance
        )
          return false;
    for (const building of buildings) {
      if (distanceToBounds(point, building.box) > clearance) continue;
      if (inside(point, building.ring)) return false;
      for (let i = 0; i < building.ring.length; i++)
        if (
          edgeDistance(
            point,
            building.ring[i],
            building.ring[(i + 1) % building.ring.length],
          ) < clearance
        )
          return false;
    }
    if (
      roads.some(
        (road) => edgeDistance(point, road.a, road.b) < road.half + clearance,
      )
    )
      return false;
    let low = Infinity,
      high = -Infinity;
    for (const [x, z] of samples) {
      const at = { x: point.x + x * clearance, z: point.z + z * clearance };
      if (options.waterAt?.(at)) return false;
      const y = geoY(toGeo(at));
      if (!Number.isFinite(y)) return false;
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    return high - low < 0.75;
  };
  let angle = 0;
  if (options.waterAt) {
    let nearest = Infinity;
    for (let direction = 0; direction < 24; direction++) {
      const theta = (direction / 24) * Math.PI * 2;
      for (const reach of [12, 24, 48, 96, 160])
        if (
          options.waterAt({
            x: focus.x + Math.sin(theta) * reach,
            z: focus.z + Math.cos(theta) * reach,
          })
        ) {
          if (reach < nearest) {
            nearest = reach;
            angle = theta;
          }
          break;
        }
    }
  }
  const sin = Math.sin(angle),
    cos = Math.cos(angle);
  const localPoint = (x, z) => ({
    x: focus.x + cos * x + sin * z,
    z: focus.z - sin * x + cos * z,
  });
  const candidates = [],
    extent = Math.ceil(radius / 6.3);
  for (let row = -extent; row <= extent; row++)
    for (let column = -extent; column <= extent; column++) {
      if (column % 5 === 0 || row % 6 === 0) continue;
      const seed = npcSeed(`beach:${column}:${row}`),
        x = column * 6.3 + ((seed % 100) / 100 - 0.5) * 0.5,
        z = row * 6.3 + (((seed >>> 8) % 100) / 100 - 0.5) * 0.5;
      const point = localPoint(x, z);
      if (
        !owned(point) ||
        Math.hypot(point.x - focus.x, point.z - focus.z) > radius
      )
        continue;
      const surface = sand.find((surface) => safe(point, 2.8, surface));
      if (surface)
        candidates.push({
          ...point,
          xLocal: x,
          zLocal: z,
          surfaceId: surface.id,
          surface,
          seed,
          distance: Math.hypot(x, z),
        });
    }
  candidates.sort((a, b) => a.distance - b.distance || a.seed - b.seed);
  const furnishingParts = [],
    restingParts = [],
    object = new THREE.Object3D();
  for (const candidate of candidates.slice(0, maxPlots)) {
    const index = stats.plots.length,
      canopy = index % 7 === 0,
      y = geoY(toGeo(candidate)) + 0.13;
    object.position.set(candidate.x, y, candidate.z);
    object.rotation.y = angle;
    object.updateMatrix();
    for (const part of arrangementParts(
      TONES[index % TONES.length],
      canopy,
      index,
    ))
      furnishingParts.push(part.applyMatrix4(object.matrix));
    const plot = {
      x: candidate.x,
      y,
      z: candidate.z,
      angle,
      radius: 2.8,
      surfaceId: candidate.surfaceId,
      canopy,
      xLocal: candidate.xLocal,
      zLocal: candidate.zLocal,
    };
    stats.plots.push(plot);
    stats.reservations.push({ x: plot.x, z: plot.z, radius: 2.8 });
    stats.arrangements++;
    stats.loungers += 2;
    stats.towels++;
    stats.canopies += canopy ? 1 : 0;
    stats.parasols += canopy ? 0 : 1;
  }
  const addVisitor = (point, index, pose, route) => {
    const family = !route && [4, 5].includes(index % 10);
    const category = family
      ? "DEMO_003"
      : ["DEMO_001", "DEMO_002", "DEMO_007", "DEMO_005"][index % 4];
    const profile = demographicProfile(
      category,
      `beach:${Math.round(focus.x)}:${Math.round(focus.z)}:${index}`,
      {
        context: "beach",
        groupRole: family && index % 10 === 5 ? "child" : "caregiver",
        gender: family ? "woman" : undefined,
      },
    );
    profile.prop = "none";
    profile.character.style =
      profile.character.bodyType === "female" && index % 5 === 0
        ? "dress"
        : "tourist";
    profile.character.shirt = TONES[index % TONES.length];
    profile.character.trousers = TONES[(index + 2) % TONES.length];
    profile.character.shoes = "#d6ba8d";
    const character = createCharacter(profile.character);
    applyLocalDemographicVisuals(character, profile);
    beachClothes(character, index);
    character.name = `Simulated beach visitor ${index + 1}`;
    const person = {
      name: profile.name,
      label: "Simulated · beach visitor",
      simulated: true,
    };
    character.traverse((mesh) => {
      if (mesh.isMesh) mesh.userData.person = person;
    });
    character.position.set(point.x, point.y, point.z);
    character.rotation.y = point.angle;
    beachPose(character, pose);
    const actor = {
      x: point.x,
      y: point.y,
      z: point.z,
      angle: point.angle,
      pose,
      person,
      simulated: true,
      categoryId: category,
      bodyType: profile.character.bodyType,
      ageBand: profile.ageBand,
      groupId: family ? `beach-family-${Math.floor(index / 10)}` : undefined,
      skin: profile.character.skin,
      phase: profile.phase,
      speed: 0.67 + (index % 3) * 0.1,
      route,
      character: route ? character : null,
    };
    stats.actors.push(actor);
    stats.people++;
    if (route) {
      group.add(character);
      stats.animatedActors.push(actor);
      stats.walkers++;
    } else {
      staticCharacterParts(character, restingParts);
      stats.resting++;
    }
  };
  const restingTarget = Math.min(
    Math.max(0, maxPeople - 6),
    stats.plots.length * 2,
  );
  for (let i = 0; i < restingTarget; i++) {
    const plot = stats.plots[Math.floor(i / 2)],
      side = i % 2 ? 1 : -1,
      pose = i % 5 === 0 ? "lounging" : i % 3 ? "seated" : "chatting";
    const x = pose === "chatting" ? side * 0.62 : side * 1.05,
      z = pose === "chatting" ? 1.78 : pose === "lounging" ? 0.98 : -0.22;
    addVisitor(
      {
        x: plot.x + cos * x + sin * z,
        y: plot.y + (pose === "lounging" ? 0.52 : pose === "seated" ? 0.36 : 0),
        z: plot.z - sin * x + cos * z,
        angle,
      },
      i,
      pose,
      null,
    );
  }
  for (
    let i = 0;
    i < 18 && stats.people < maxPeople && stats.walkers < 6;
    i++
  ) {
    const x = ((i % 3) - 1) * 31.5,
      z = (Math.floor(i / 3) - 2) * 14 + 3.15;
    const a = localPoint(x, z - 5),
      b = localPoint(x, z + 5),
      center = localPoint(x, z);
    if (
      !owned(a) ||
      !owned(b) ||
      Math.hypot(center.x - focus.x, center.z - focus.z) > radius
    )
      continue;
    const surface = sand.find((surface) => {
      for (let step = 0; step <= 20; step++) {
        const point = {
          x: a.x + ((b.x - a.x) * step) / 20,
          z: a.z + ((b.z - a.z) * step) / 20,
        };
        if (
          !safe(point, 0.5, surface) ||
          Math.hypot(point.x - focus.x, point.z - focus.z) < 2.2 ||
          stats.reservations.some(
            (reservation) =>
              Math.hypot(point.x - reservation.x, point.z - reservation.z) <
              reservation.radius + 0.5,
          )
        )
          return false;
      }
      return true;
    });
    if (
      !surface ||
      stats.actors.some(
        (actor) =>
          actor.route && Math.hypot(actor.x - center.x, actor.z - center.z) < 7,
      )
    )
      continue;
    const heights = new Float32Array(21);
    for (let step = 0; step <= 20; step++)
      heights[step] =
        geoY(
          toGeo({
            x: a.x + ((b.x - a.x) * step) / 20,
            z: a.z + ((b.z - a.z) * step) / 20,
          }),
        ) + 0.14;
    addVisitor(
      { ...center, y: geoY(toGeo(center)) + 0.14, angle },
      stats.people,
      "walking",
      { a, b, length: 10, offset: i * 2.3, surfaceId: surface.id, heights },
    );
  }
  const addBatch = (parts, name) => {
    const geometry = combined(parts);
    if (!geometry) return;
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.87,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
  addBatch(
    furnishingParts,
    "Striped beach shades, loungers and picnic belongings",
  );
  addBatch(restingParts, "Resting and chatting scenic beachgoers");
  group.traverse((node) => {
    if (node.isMesh) stats.drawCalls++;
  });
  return group;
}

/** Freeze both the walking route and rig when paused or reduced motion is set. */
export function updateBeachLife(group, dt, time, motion = true) {
  const state = group?.userData?.beachLife;
  if (
    !state ||
    !motion ||
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !Number.isFinite(time)
  )
    return;
  state.elapsed += Math.min(dt, 0.1);
  for (const actor of state.animatedActors) {
    const route = actor.route,
      cycle = (state.elapsed * actor.speed + route.offset) % (route.length * 2);
    const returning = cycle > route.length,
      at = returning ? route.length * 2 - cycle : cycle,
      t = at / route.length;
    const x = route.a.x + (route.b.x - route.a.x) * t,
      z = route.a.z + (route.b.z - route.a.z) * t;
    actor.character.position.x = x;
    actor.character.position.z = z;
    const sample = t * 20,
      low = Math.min(19, Math.floor(sample));
    actor.character.position.y =
      route.heights[low] +
      (route.heights[low + 1] - route.heights[low]) * (sample - low);
    actor.character.rotation.y =
      Math.atan2(route.b.x - route.a.x, route.b.z - route.a.z) +
      (returning ? Math.PI : 0);
    animateCharacter(actor.character, state.elapsed + actor.phase, true);
    actor.x = x;
    actor.y = actor.character.position.y;
    actor.z = z;
    actor.angle = actor.character.rotation.y;
  }
}
