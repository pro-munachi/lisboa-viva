import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createTrafficNetwork, trafficSignalState } from "./city-traffic.js";
import { drapedPolygonGeometry } from "./city-surfaces.js";
import { projectedCityBounds } from "./city-rendering.js";

// Street positions/names are mapped. The individual street furniture and
// junction rules below are authored simulation scenery, not surveyed assets.
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

function segmentDistance(point, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}

function coloured(geometry, tint) {
  const color = new THREE.Color(tint),
    colors = [];
  const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
  if (prepared !== geometry) geometry.dispose();
  prepared.deleteAttribute("uv");
  for (let i = 0; i < prepared.attributes.position.count; i++)
    colors.push(color.r, color.g, color.b);
  prepared.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return prepared;
}

function buildShape(build) {
  const pieces = [];
  const add = (geometry, x, y, z, color, angle = 0) => {
    geometry.rotateY(angle);
    geometry.translate(x, y, z);
    pieces.push(coloured(geometry, color));
  };
  const builder = {
    box: (w, h, d, x, y, z, color, angle) =>
      add(new THREE.BoxGeometry(w, h, d), x, y, z, color, angle),
    cylinder: (r, h, x, y, z, color) =>
      add(new THREE.CylinderGeometry(r, r, h, 10), x, y, z, color),
    sphere: (r, x, y, z, color) =>
      add(new THREE.SphereGeometry(r, 8, 5), x, y, z, color),
    triangle: (w, h, x, y, z, color) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [-w / 2, h / 2, 0, w / 2, h / 2, 0, 0, -h / 2, 0],
          3,
        ),
      );
      geometry.computeVertexNormals();
      add(geometry, x, y, z, color);
    },
  };
  build(builder);
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  return geometry;
}

function streetPaths(chunk, projectGeo, geoY) {
  return (chunk.roads || []).map((road) => {
    const ps = road.points.map((p) => ({ ...projectGeo(p), y: geoY(p) })),
      lengths = [0];
    for (let i = 1; i < ps.length; i++)
      lengths.push(
        lengths.at(-1) +
          Math.hypot(ps[i].x - ps[i - 1].x, ps[i].z - ps[i - 1].z),
      );
    return { ...road, ps, lengths, length: lengths.at(-1), owner: chunk.id };
  });
}

export function sceneryFromIntersection(hit) {
  if (!hit?.object) return null;
  for (let object = hit.object; object; object = object.parent) {
    if (Number.isInteger(hit.instanceId) && object.userData.sceneryInstances)
      return object.userData.sceneryInstances[hit.instanceId] || null;
    if (object.userData.scenery) return object.userData.scenery;
    if (Number.isInteger(hit.faceIndex) && object.userData.sceneryFaceRanges) {
      return (
        object.userData.sceneryFaceRanges.find(
          (range) => hit.faceIndex >= range.start && hit.faceIndex < range.end,
        )?.scenery || null
      );
    }
  }
  return null;
}

function labelTexture(text, background = "#f5f4e9", foreground = "#253b4a") {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = background;
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = foreground;
  context.lineWidth = 7;
  context.strokeRect(5, 5, 502, 118);
  context.fillStyle = foreground;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${Math.max(20, Math.min(43, 700 / Math.max(10, text.length)))}px sans-serif`;
  context.fillText(text, 256, 66, 475);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** @param {any} chunk
 * @param {{projectGeo:any,unprojectGeo?:any,geoY:any,terrain?:any,focusPoint?:number[],waterAt?:(point:any)=>boolean,reservations?:Array<{x:number,z:number,radius?:number,type?:string}>,junctions?:any[],radius?:number,maxObjects?:number,maxJunctions?:number}} options
 */
export function createCityFixtures(
  chunk,
  {
    projectGeo,
    unprojectGeo,
    geoY,
    terrain,
    focusPoint,
    waterAt = () => false,
    reservations = [],
    junctions,
    radius = 180,
    maxObjects = 24,
    maxJunctions = 6,
  },
) {
  const group = new THREE.Group();
  group.name = "Lisbon street infrastructure";
  const bounds = projectedCityBounds(chunk.bounds, projectGeo),
    focus = projectGeo(
      focusPoint || [
        (chunk.bounds[0] + chunk.bounds[2]) / 2,
        (chunk.bounds[1] + chunk.bounds[3]) / 2,
      ],
    );
  const owned = (p) =>
    p.x >= bounds[0] && p.z >= bounds[1] && p.x < bounds[2] && p.z < bounds[3];
  const context = { projectGeo, unprojectGeo, geoY, terrain };
  const toGeo = (p) =>
    unprojectGeo
      ? unprojectGeo(p.x, p.z)
      : [
          chunk.bounds[0] +
            ((p.x - bounds[0]) / (bounds[2] - bounds[0])) *
              (chunk.bounds[2] - chunk.bounds[0]),
          chunk.bounds[3] -
            ((p.z - bounds[1]) / (bounds[3] - bounds[1])) *
              (chunk.bounds[3] - chunk.bounds[1]),
        ];
  context.unprojectGeo = (x, z) => toGeo({ x, z });
  const buildings = (chunk.buildings || [])
    .filter((b) => b.ring?.length >= 3)
    .map((b) => b.ring.map(projectGeo));
  const waters = (chunk.surfaces || [])
    .filter((s) => s.kind === "water")
    .map((s) => s.ring.map(projectGeo));
  const items = [],
    reserved = [];
  const allReserved = [...reservations];
  const safe = (p, clearance = 0.65) =>
    owned(p) &&
    Math.hypot(p.x - focus.x, p.z - focus.z) <=
      Math.min(350, Math.max(30, radius)) &&
    !waterAt(p) &&
    !waters.some((ring) => inside(p, ring)) &&
    !buildings.some(
      (ring) =>
        inside(p, ring) ||
        ring.some(
          (a, i) =>
            segmentDistance(p, a, ring[(i + 1) % ring.length]) < clearance,
        ),
    ) &&
    !allReserved.some(
      (r) => Math.hypot(p.x - r.x, p.z - r.z) < clearance + (r.radius || 0),
    );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
  });
  const object = (kind, name, p, angle, radius, build, extra = {}) => {
    const scenery = {
      id: `${chunk.id}:${kind}:${p.x.toFixed(2)}:${p.z.toFixed(2)}`,
      kind,
      name,
      x: p.x,
      y: geoY(toGeo(p)) + 0.2,
      z: p.z,
      angle,
      radius,
      source: "authored",
      ...extra,
    };
    const geometry = buildShape(build),
      mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(p.x, scenery.y, p.z);
    mesh.rotation.y = angle;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.scenery = scenery;
    group.add(mesh);
    items.push(scenery);
    if (radius > 0) {
      const r = { ...p, radius, type: kind };
      reserved.push(r);
      allReserved.push(r);
    }
    return mesh;
  };
  const paths = streetPaths(chunk, projectGeo, geoY);
  const nearbyJunctions = (
    junctions ||
    createTrafficNetwork(paths, focus, { radius: Math.min(350, radius + 80) })
      .junctions
  )
    .filter(
      (j) => owned(j) && Math.hypot(j.x - focus.x, j.z - focus.z) < radius,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - focus.x, a.z - focus.z) -
        Math.hypot(b.x - focus.x, b.z - focus.z),
    )
    .slice(0, Math.min(8, Math.max(0, maxJunctions)));
  const signals = [],
    crossingEntries = [],
    painted = [];
  let crosswalks = 0;
  let giveWaySigns = 0;
  for (const junction of nearbyJunctions) {
    for (const approach of junction.approaches.slice(0, 4)) {
      const angle = approach.angle,
        width = Math.min(18, Math.max(4, approach.width));
      const centre = {
        x: junction.x - Math.sin(angle) * 8,
        z: junction.z - Math.cos(angle) * 8,
      };
      if (
        !owned(centre) ||
        waterAt(centre) ||
        buildings.some((ring) => inside(centre, ring))
      )
        continue;
      const point = (x, z) => ({
        x: centre.x + Math.cos(angle) * x + Math.sin(angle) * z,
        z: centre.z - Math.sin(angle) * x + Math.cos(angle) * z,
      });
      const crossingScenery = {
        id: `${chunk.id}:crosswalk:${junction.id}:${approach.id}`,
        kind: "crosswalk",
        name: "Pedestrian crossing",
        x: centre.x,
        y: geoY(toGeo(centre)) + 0.255,
        z: centre.z,
        angle,
        radius: 0,
        source: "authored",
        junctionId: junction.id,
      };
      crossingEntries.push({ scenery: crossingScenery, junction, angle });
      const stripe = (x, z, w, d) => {
        const ring = [
          point(x - w / 2, z - d / 2),
          point(x + w / 2, z - d / 2),
          point(x + w / 2, z + d / 2),
          point(x - w / 2, z + d / 2),
        ];
        if (!ring.every(owned)) return;
        const geometry = drapedPolygonGeometry(ring.map(toGeo), context, 0.255);
        if (geometry.attributes.position.count)
          painted.push({
            geometry: coloured(geometry, "#fff6df"),
            scenery: crossingScenery,
          });
        else geometry.dispose();
      };
      for (let x = -width / 2 + 0.65; x < width / 2 - 0.4; x += 1.1)
        stripe(x, 0, 0.46, 2.8);
      // Portuguese traffic keeps right. The stop line covers the entering lane.
      stripe(-width / 4, -2.2, width / 2 - 0.3, 0.22);
      crosswalks++;
      const p = point(-width / 2 - 0.55, -2.2);
      if (!safe(p, 0.35)) continue;
      if (!junction.signal) {
        object(
          "street_sign",
          "Give way to crossing traffic",
          p,
          angle,
          0.15,
          (b) => {
            b.cylinder(0.045, 2.4, 0, 1.2, 0, "#6d7e7e");
            b.triangle(0.82, 0.72, 0, 2.15, -0.02, "#df554a");
            b.triangle(0.63, 0.55, 0, 2.17, -0.035, "#f6f2dc");
          },
          { rule: "give-way", junctionId: junction.id },
        );
        giveWaySigns++;
        continue;
      }
      const post = object(
        "crosswalk",
        "Pedestrian crossing signal",
        p,
        angle,
        0.2,
        (b) => {
          b.cylinder(0.07, 3.2, 0, 1.6, 0, "#3e494b");
          b.box(0.34, 0.93, 0.26, 0, 2.7, 0, "#242d33");
          b.box(0.42, 0.08, 0.36, 0, 3.2, 0, "#242d33");
        },
        { junctionId: junction.id },
      );
      crossingEntries.push({ scenery: post.userData.scenery, junction, angle });
      signals.push({
        junction,
        angle,
        x: p.x,
        y: geoY(toGeo(p)) + 0.2,
        z: p.z,
      });
    }
  }
  if (painted.length) {
    const ranges = [];
    let face = 0;
    for (const part of painted) {
      const next = face + part.geometry.attributes.position.count / 3;
      ranges.push({ start: face, end: next, scenery: part.scenery });
      face = next;
    }
    const geometry = mergeGeometries(
      painted.map((p) => p.geometry),
      false,
    );
    painted.forEach((p) => p.geometry.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Zebra crossings and entering-lane stop lines";
    mesh.receiveShadow = true;
    mesh.userData.sceneryFaceRanges = ranges;
    group.add(mesh);
    for (const range of ranges)
      if (!items.some((item) => item.id === range.scenery.id))
        items.push(range.scenery);
  }
  const signalMeshes = [];
  if (signals.length)
    for (const [index, state, tint] of [
      [0, "red", "#fb5848"],
      [1, "amber", "#ffc249"],
      [2, "green", "#49ec99"],
    ]) {
      const lightMaterial = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 0.8,
        roughness: 0.3,
      });
      lightMaterial.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)\ntotalEmissiveRadiance *= vColor;\n#endif",
        );
      };
      lightMaterial.customProgramCacheKey = () =>
        "roam-signal-instance-emission-v1";
      const geometry = new THREE.SphereGeometry(0.107, 8, 5).scale(1, 1, 0.33);
      const mesh = new THREE.InstancedMesh(
          geometry,
          lightMaterial,
          signals.length,
        ),
        dummy = new THREE.Object3D();
      mesh.name = `Traffic ${state} lenses`;
      signals.forEach((signal, i) => {
        dummy.position.set(
          signal.x - Math.sin(signal.angle) * 0.145,
          signal.y + 2.98 - index * 0.28,
          signal.z - Math.cos(signal.angle) * 0.145,
        );
        dummy.rotation.y = signal.angle;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, new THREE.Color(tint));
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
      signalMeshes.push({ mesh, state, color: new THREE.Color(tint) });
    }

  const candidates = [];
  for (const road of paths) {
    if (
      ![
        "primary",
        "secondary",
        "tertiary",
        "residential",
        "living_street",
        "pedestrian",
        "footway",
      ].includes(road.kind) ||
      road.width < 2
    )
      continue;
    for (let i = 1; i < road.ps.length; i++) {
      const a = road.ps[i - 1],
        b = road.ps[i],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 12) continue;
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      for (let d = 7; d < length - 4; d += 42) {
        const p = {
          x:
            a.x +
            ((b.x - a.x) * d) / length +
            Math.cos(angle) * (road.width / 2 + 1),
          z:
            a.z +
            ((b.z - a.z) * d) / length -
            Math.sin(angle) * (road.width / 2 + 1),
        };
        candidates.push({
          p,
          angle,
          road,
          distance: Math.hypot(p.x - focus.x, p.z - focus.z),
        });
      }
    }
  }
  candidates.sort(
    (a, b) =>
      a.distance - b.distance ||
      String(a.road.id).localeCompare(String(b.road.id)),
  );
  const counts = {
    bin: 0,
    "bike-rack": 0,
    fountain: 0,
    "bus-stop": 0,
    "street-sign": 0,
  };
  let ordinary = 0;
  for (const entry of candidates) {
    if (ordinary >= Math.min(32, Math.max(0, maxObjects))) break;
    const { p, angle, road } = entry;
    if (!safe(p, 0.7)) continue;
    const ordinal = ordinary++;
    const kind =
      ordinal % 7 === 2 && road.width >= 7 && counts["bus-stop"] < 3
        ? "bus-stop"
        : ordinal % 7 === 4 && counts["bike-rack"] < 4
          ? "bike-rack"
          : ordinal % 7 === 5 && counts.fountain < 3
            ? "fountain"
            : ordinal % 7 === 6 && road.name && counts["street-sign"] < 4
              ? "street-sign"
              : "bin";
    counts[kind]++;
    if (kind === "bus-stop") {
      // A transparent waiting shelter, yellow pole and timetable identify bus use.
      // The stop itself is authored; no unrecorded Carris route numbers are claimed.
      const shelterAngle = angle + Math.PI / 2;
      const footprint = [
        [-1.4, -0.55],
        [1.4, -0.55],
        [-1.4, 0.55],
        [1.4, 0.55],
      ].map(([x, z]) => ({
        x: p.x + Math.cos(shelterAngle) * x + Math.sin(shelterAngle) * z,
        z: p.z - Math.sin(shelterAngle) * x + Math.cos(shelterAngle) * z,
      }));
      if (!footprint.every((q) => safe(q, 0.2))) {
        ordinary--;
        counts[kind]--;
        continue;
      }
      object(
        "bus_stop",
        "City bus stop",
        p,
        shelterAngle,
        1.8,
        (b) => {
          for (const x of [-1.25, 1.25])
            b.cylinder(0.07, 2.45, x, 1.22, -0.4, "#4c666a");
          b.box(2.9, 0.16, 1.25, 0, 2.5, 0, "#d4d9d1");
          b.box(2.65, 1.45, 0.035, 0, 1.55, -0.44, "#a2c8ce");
          b.box(1.5, 0.1, 0.45, 0, 0.6, -0.12, "#b59064");
          for (const x of [-0.6, 0.6])
            b.box(0.09, 0.6, 0.3, x, 0.3, -0.12, "#4c666a");
          b.cylinder(0.05, 2.8, 1.6, 1.4, 0.2, "#f0bd36");
          b.box(0.45, 0.45, 0.075, 1.6, 2.55, 0.2, "#f3c743");
          b.box(0.24, 0.68, 0.07, 1.6, 1.85, 0.2, "#f0f1e4");
        },
        { roadName: road.name, roadId: road.id },
      );
    } else if (kind === "bike-rack")
      object("bike_rack", "Bicycle parking", p, angle, 0.9, (b) => {
        for (const x of [-0.7, 0, 0.7]) {
          b.cylinder(0.035, 0.8, x, 0.4, -0.25, "#70898a");
          b.cylinder(0.035, 0.8, x, 0.4, 0.25, "#70898a");
          b.box(0.075, 0.075, 0.5, x, 0.8, 0, "#70898a");
        }
      });
    else if (kind === "fountain")
      object(kind, "Drinking fountain", p, angle, 0.42, (b) => {
        b.cylinder(0.23, 0.9, 0, 0.45, 0, "#d9d0b6");
        b.cylinder(0.36, 0.12, 0, 0.95, 0, "#d9d0b6");
        b.cylinder(0.22, 0.035, 0, 1.02, 0, "#91bac2");
        b.box(0.06, 0.1, 0.12, 0, 1.1, -0.12, "#6b868a");
      });
    else if (kind === "street-sign") {
      const mesh = object(
        "street_sign",
        road.name,
        p,
        angle,
        0.15,
        (b) => {
          b.cylinder(0.045, 2.6, 0, 1.3, 0, "#556868");
          b.box(1.25, 0.33, 0.08, 0, 2.45, 0, "#f4f0db");
        },
        { nameSource: "mapped", roadId: road.id },
      );
      const map = labelTexture(road.name);
      if (map) {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(1.22, 0.3),
          new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
        );
        sign.position.set(0, 2.45, 0.043);
        mesh.add(sign);
      }
    } else
      object("bin", "Street recycling bin", p, angle, 0.38, (b) => {
        b.cylinder(
          0.26,
          0.83,
          0,
          0.415,
          0,
          ordinal % 3 === 0
            ? "#548071"
            : ordinal % 3 === 1
              ? "#ddb54c"
              : "#5891be",
        );
        b.cylinder(0.3, 0.11, 0, 0.89, 0, "#334d50");
        b.box(0.24, 0.14, 0.04, 0, 0.7, 0.27, "#1e393c");
      });
  }
  if (!group.children.length) material.dispose();
  group.userData.sceneryItems = items;
  group.userData.fixtures = {
    ...counts,
    crosswalks,
    giveWaySigns,
    signals: signals.length,
    junctions: nearbyJunctions.length,
    reservations: reserved,
    drawCalls: group.children.length,
    signalEntries: signals,
    signalMeshes,
    crossingEntries,
  };
  updateCityFixtures(group, 0);
  return group;
}

export function updateCityFixtures(group, time) {
  const state = group?.userData?.fixtures;
  if (!state) return;
  for (const entry of state.crossingEntries || [])
    entry.scenery.signalState = trafficSignalState(
      entry.junction,
      time,
      entry.angle,
    );
  for (const { mesh, state: lamp, color } of state.signalMeshes) {
    for (let i = 0; i < state.signalEntries.length; i++) {
      const signal = state.signalEntries[i];
      const current = trafficSignalState(signal.junction, time, signal.angle);
      state.scratchColor ??= new THREE.Color();
      mesh.setColorAt(
        i,
        state.scratchColor
          .copy(color)
          .multiplyScalar(current === lamp ? 1 : 0.025),
      );
    }
    mesh.instanceColor.needsUpdate = true;
  }
}
