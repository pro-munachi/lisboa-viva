import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  projectGeo,
  unprojectGeo,
  surfaceElevationAt,
  containsGeo,
} from "./geography";
import { createCharacter, animateCharacter } from "./characters";

async function geographyFile(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("Geography unavailable");
  if (url.endsWith(".gz") && !r.headers.get("Content-Encoding"))
    return new Response(
      r.body.pipeThrough(new DecompressionStream("gzip")),
    ).json();
  return r.json();
}
const facadeColors = [
  "#e5d9c1",
  "#d6aa8c",
  "#e0e1d2",
  "#d6c9a9",
  "#c7c8bc",
  "#e8d8c5",
];
const roadColor = (kind) =>
  kind === "rail"
    ? "#655e53"
    : ["footway", "pedestrian", "steps", "path"].includes(kind)
      ? "#d3cfc1"
      : "#a5aaa9";
export function createCity(host, options) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor("#c7dee8");
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c7dee8");
  scene.fog = new THREE.Fog("#c7dee8", 2500, 18000);
  scene.add(new THREE.HemisphereLight("#fff6e7", "#7e9074", 2.4));
  const sun = new THREE.DirectionalLight("#fff0d6", 2.8);
  sun.position.set(-150, 400, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.far = 1200;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.3, 90000);
  camera.position.set(200, 160, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 8;
  controls.maxDistance = 70000;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.screenSpacePanning = false;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const abort = new AbortController();
  let characterGallery = null;
  let destroyed = false,
    frame = 0,
    manifest = null,
    terrain = null,
    focus = options.focus,
    player = null,
    playerTarget = null,
    agents = [],
    vehicles = [],
    lastTime = 0,
    lastChunkUpdate = 0,
    loadInProgress = false,
    generation = 0,
    overviewMesh = null,
    overviewLoading = false,
    mode = "orbit",
    motion = !reduce;
  const chunkGroups = new Map(),
    chunkCache = new Map(),
    roadPaths = [],
    markerMeshes = [],
    labels = [];
  const city = new THREE.Group();
  scene.add(city);
  const markers = new THREE.Group();
  scene.add(markers);
  const population = new THREE.Group();
  scene.add(population);
  const materials = new Map();
  function mat(c) {
    if (!materials.has(c))
      materials.set(
        c,
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }),
      );
    return materials.get(c);
  }
  const geoY = (p) => surfaceElevationAt(p, terrain);
  const point3 = (p) => {
    const q = projectGeo(p);
    return new THREE.Vector3(q.x, geoY(p), q.z);
  };
  const status = (text) => {
    if (!destroyed) options.onStatus?.(text);
  };
  function disposeGroup(group) {
    const geometries = new Set(),
      mats = new Set(),
      textures = new Set();
    group.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (![...materials.values()].includes(m)) {
            mats.add(m);
            if (m.map) textures.add(m.map);
          }
        }
    });
    geometries.forEach((g) => g.dispose());
    textures.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
    group.removeFromParent();
    group.clear();
  }
  function terrainMesh() {
    const bounds = manifest.bounds;
    const cols = terrain ? terrain.width : 64,
      rows = terrain ? terrain.height : 40;
    const positions = [],
      indices = [],
      colors = [];
    const c = new THREE.Color();
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const p = [
          bounds[0] + ((bounds[2] - bounds[0]) * x) / (cols - 1),
          bounds[3] - ((bounds[3] - bounds[1]) * y) / (rows - 1),
        ];
        const v = point3(p);
        positions.push(v.x, v.y - 0.25, v.z);
        c.set(v.y > 140 ? "#81977b" : v.y > 50 ? "#a8b395" : "#c8cbb6");
        colors.push(c.r, c.g, c.b);
      }
    for (let y = 0; y < rows - 1; y++)
      for (let x = 0; x < cols - 1; x++) {
        const a = y * cols + x,
          b = a + 1,
          d = a + cols,
          e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    mesh.receiveShadow = true;
    mesh.userData.ground = true;
    city.add(mesh);
  }
  function polygonGeometry(ring, yOffset = 0) {
    const shape = new THREE.Shape();
    const points = ring.map((p) => projectGeo(p));
    points.forEach((p, i) =>
      i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z),
    );
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = unprojectGeo(pos.getX(i), pos.getZ(i));
      pos.setY(i, geoY(p) + yOffset);
    }
    g.computeVertexNormals();
    return g;
  }
  function surfaces(list = manifest.surfaces, parent = city) {
    const buckets = { water: [], park: [], wood: [], sand: [] };
    for (const s of list) {
      if (s.ring.length < 3) continue;
      const g = polygonGeometry(s.ring, s.kind === "water" ? 0.07 : 0.1);
      if (s.kind === "water") {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, 0.05);
        g.computeVertexNormals();
      }
      buckets[s.kind]?.push(g);
    }
    for (const [kind, gs] of Object.entries(buckets)) {
      if (!gs.length) continue;
      const merged = mergeGeometries(gs);
      gs.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(
        merged,
        mat(
          {
            water: "#7fabbe",
            park: "#9aac81",
            wood: "#7d956f",
            sand: "#dcd1b0",
          }[kind],
        ),
      );
      parent.add(mesh);
    }
  }
  function path(points) {
    const ps = points.map(point3),
      lengths = [0];
    for (let i = 1; i < ps.length; i++)
      lengths.push(lengths.at(-1) + ps[i].distanceTo(ps[i - 1]));
    return { ps, lengths, length: lengths.at(-1) };
  }
  function densePoints(points) {
    const dense = [points[0]];
    const grid =
      terrain &&
      ((p) => [
        ((p[0] - terrain.bounds[0]) / (terrain.bounds[2] - terrain.bounds[0])) *
          (terrain.width - 1),
        ((terrain.bounds[3] - p[1]) / (terrain.bounds[3] - terrain.bounds[1])) *
          (terrain.height - 1),
      ]);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        pa = projectGeo(a),
        pb = projectGeo(b),
        steps = Math.max(
          1,
          Math.ceil(Math.hypot(pb.x - pa.x, pb.z - pa.z) / 30),
        );
      const cuts = new Set([1]);
      for (let j = 1; j < steps; j++) cuts.add(j / steps);
      if (grid) {
        const ga = grid(a),
          gb = grid(b);
        for (const [lo, hi] of [
          [ga[0], gb[0]],
          [ga[1], gb[1]],
          [ga[0] + ga[1], gb[0] + gb[1]],
        ]) {
          if (Math.abs(hi - lo) < 1e-9) continue;
          for (let k = Math.ceil(Math.min(lo, hi)); k < Math.max(lo, hi); k++) {
            const t = (k - lo) / (hi - lo);
            if (t > 1e-7 && t < 1 - 1e-7) cuts.add(t);
          }
        }
      }
      for (const t of [...cuts].sort((a, b) => a - b))
        dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return dense;
  }
  function roads(list = manifest.roads, parent = city, owner = "overview") {
    const buckets = new Map();
    for (const road of list) {
      if (road.points.length < 2) continue;
      const points = densePoints(road.points),
        ps = points.map(point3),
        vertices = [];
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1],
          b = ps[i];
        const dx = b.x - a.x,
          dz = b.z - a.z,
          len = Math.hypot(dx, dz);
        if (len < 0.2) continue;
        const nx = ((-dz / len) * road.width) / 2,
          nz = ((dx / len) * road.width) / 2;
        const p = [
          [a.x + nx, geoY(unprojectGeo(a.x + nx, a.z + nz)) + 0.15, a.z + nz],
          [a.x - nx, geoY(unprojectGeo(a.x - nx, a.z - nz)) + 0.15, a.z - nz],
          [b.x + nx, geoY(unprojectGeo(b.x + nx, b.z + nz)) + 0.15, b.z + nz],
          [b.x - nx, geoY(unprojectGeo(b.x - nx, b.z - nz)) + 0.15, b.z - nz],
        ];
        vertices.push(...p[0], ...p[2], ...p[1], ...p[2], ...p[3], ...p[1]);
      }
      if (!vertices.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      g.computeVertexNormals();
      const color = roadColor(road.kind);
      if (!buckets.has(color)) buckets.set(color, []);
      buckets.get(color).push(g);
      const line = path(points);
      if (line.length > 20)
        roadPaths.push({
          ...line,
          kind: road.kind,
          width: road.width,
          id: road.id,
          owner,
        });
    }
    for (const [color, gs] of buckets) {
      const merged = mergeGeometries(gs);
      gs.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat(color));
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  function boundsDistance(bounds, p) {
    const q = projectGeo([
      Math.max(bounds[0], Math.min(bounds[2], p[0])),
      Math.max(bounds[1], Math.min(bounds[3], p[1])),
    ]);
    const v = projectGeo(p);
    return Math.hypot(q.x - v.x, q.z - v.z);
  }
  async function loadChunks() {
    if (!manifest || destroyed || loadInProgress) return;
    if (camera.position.distanceTo(controls.target) > 5000) return;
    loadInProgress = true;
    const ticket = generation;
    let changed = false;
    try {
      const p = unprojectGeo(controls.target.x, controls.target.z);
      const range = camera.position.distanceTo(controls.target);
      const limit = Math.min(13000, Math.max(650, range * 1.1));
      const wanted = manifest.chunks
        .filter((c) => boundsDistance(c.bounds, p) < limit)
        .sort(
          (a, b) => boundsDistance(a.bounds, p) - boundsDistance(b.bounds, p),
        )
        .slice(0, 3);
      const ids = new Set(wanted.map((c) => c.id));
      for (const [id, g] of chunkGroups) {
        if (!ids.has(id)) {
          disposeGroup(g);
          chunkGroups.delete(id);
          changed = true;
          chunkCache.delete(id);
          for (let i = roadPaths.length - 1; i >= 0; i--)
            if (roadPaths[i].owner === id) roadPaths.splice(i, 1);
        }
      }
      for (const chunk of wanted) {
        if (destroyed || ticket !== generation) break;
        if (chunkGroups.has(chunk.id)) continue;
        let data = chunkCache.get(chunk.id);
        if (!data) {
          data = await geographyFile(chunk.url, abort.signal);
          chunkCache.set(chunk.id, data);
        }
        if (ticket !== generation) break;
        await addBuildings(data, ticket);
        changed = true;
      }
      if (changed && !destroyed && ticket === generation) populate();
      options.onStats?.({
        buildings: [...chunkGroups.values()].reduce(
          (n, g) => n + (g.userData.count || 0),
          0,
        ),
        roads: manifest.counts.roads,
        source: manifest.source.name,
        heights: "OSM heights where recorded; otherwise estimated",
        terrain: !!terrain,
      });
    } catch (e) {
      if (!destroyed)
        status(
          "Some building data could not load. Roads and landmarks remain available.",
        );
    } finally {
      loadInProgress = false;
      if (!destroyed && ticket !== generation) loadChunks();
    }
  }
  async function addBuildings(chunk, ticket) {
    const groups = facadeColors.map(() => []),
      roofs = [];
    let count = 0;
    const cleanup = () => {
      groups.flat().forEach((g) => g.dispose());
      roofs.forEach((g) => g.dispose());
    };
    for (const b of chunk.buildings) {
      if (destroyed || ticket !== generation) {
        cleanup();
        return;
      }
      if (b.ring.length < 3) continue;
      const ps = b.ring.map(projectGeo);
      const cx = ps.reduce((n, p) => n + p.x, 0) / ps.length,
        cz = ps.reduce((n, p) => n + p.z, 0) / ps.length;
      const shape = new THREE.Shape();
      ps.forEach((p, i) =>
        i
          ? shape.lineTo(p.x - cx, -(p.z - cz))
          : shape.moveTo(p.x - cx, -(p.z - cz)),
      );
      const groundLevels = b.ring.map(geoY),
        base = Math.min(...groundLevels),
        depth = b.height + Math.max(...groundLevels) - base;
      const g = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        steps: 1,
      });
      g.rotateX(-Math.PI / 2);
      g.translate(cx, base, cz);
      g.clearGroups();
      groups[Math.abs(b.id) % facadeColors.length].push(g);
      const roof = new THREE.ShapeGeometry(shape);
      roof.rotateX(-Math.PI / 2);
      roof.translate(cx, base + depth + 0.03, cz);
      roofs.push(roof);
      count++;
      if (count % 100 === 0)
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (destroyed || ticket !== generation) {
      cleanup();
      return;
    }
    const group = new THREE.Group();
    group.userData.count = count;
    if (chunk.roads) roads(chunk.roads, group, chunk.id);
    if (chunk.surfaces) surfaces(chunk.surfaces, group);
    groups.forEach((gs, i) => {
      if (!gs.length) return;
      const merged = mergeGeometries(gs, false);
      gs.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat(facadeColors[i]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    if (roofs.length) {
      const merged = mergeGeometries(roofs, false);
      roofs.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(merged, mat("#b78367")));
    }
    city.add(group);
    chunkGroups.set(chunk.id, group);
  }
  function canvasLabel(text, color = "#292942") {
    const cvs = document.createElement("canvas");
    cvs.width = 512;
    cvs.height = 112;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 98, 26);
    ctx.fill();
    ctx.fillStyle = "#fffdf9";
    ctx.font = "500 31px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 32), 256, 52);
    const texture = new THREE.CanvasTexture(cvs);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false }),
    );
    sprite.renderOrder = 5;
    return sprite;
  }
  function setMarkers(hotspots) {
    options.hotspots = hotspots;
    disposeGroup(markers);
    scene.add(markers);
    markerMeshes.length = 0;
    labels.length = 0;
    for (const h of hotspots) {
      const v = point3([h.lng, h.lat]);
      const g = new THREE.Group();
      g.position.copy(v);
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 12, 8),
        new THREE.MeshBasicMaterial({
          color: h.custom ? "#6d896e" : "#292942",
          depthTest: false,
        }),
      );
      pin.position.y = 7;
      pin.renderOrder = 6;
      pin.userData.hotspot = h;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 5, 6),
        mat("#292942"),
      );
      stem.position.y = 4;
      g.add(stem, pin);
      const label = canvasLabel(h.name, h.custom ? "#527460" : "#292942");
      label.position.y = 11;
      label.userData.hotspot = h;
      g.add(label);
      markers.add(g);
      markerMeshes.push(pin, label);
      labels.push({ group: g, pin, stem, label, hotspot: h });
    }
  }
  function sample(line, d, side = 0) {
    const doubled =
        ((d % (line.length * 2)) + line.length * 2) % (line.length * 2),
      reverse = doubled > line.length,
      distance = reverse ? line.length * 2 - doubled : doubled;
    let i = 1;
    while (i < line.lengths.length - 1 && line.lengths[i] < distance) i++;
    const a = line.ps[i - 1],
      b = line.ps[i],
      den = line.lengths[i] - line.lengths[i - 1],
      v = a
        .clone()
        .lerp(b, (distance - line.lengths[i - 1]) / Math.max(den, 0.001));
    const dir = b.clone().sub(a);
    dir.y = 0;
    dir.normalize();
    v.x += -dir.z * side;
    v.z += dir.x * side;
    v.y = geoY(unprojectGeo(v.x, v.z)) + 0.2;
    return { v, angle: Math.atan2(dir.x, dir.z) + (reverse ? Math.PI : 0) };
  }
  function nearestPath(v, pedestrian = false) {
    const candidates = roadPaths.filter((p) =>
      pedestrian
        ? [
            "footway",
            "pedestrian",
            "path",
            "steps",
            "residential",
            "living_street",
          ].includes(p.kind)
        : !["footway", "pedestrian", "path", "steps", "rail", "tram"].includes(
            p.kind,
          ),
    );
    let best = null;
    for (const line of candidates) {
      for (let i = 0; i < line.ps.length; i++) {
        const d = Math.hypot(line.ps[i].x - v.x, line.ps[i].z - v.z);
        if (!best || d < best.distance)
          best = { line, distance: d, d: line.lengths[i] };
      }
    }
    return best;
  }
  function car(color, tram = false) {
    const g = new THREE.Group();
    const box = (w, h, d, c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    box(
      tram ? 2.2 : 1.75,
      tram ? 2.3 : 0.65,
      tram ? 8 : 4.2,
      color,
      0,
      tram ? 1.45 : 0.8,
      0,
    );
    box(
      tram ? 2 : 1.48,
      tram ? 1 : 0.7,
      tram ? 6 : 2.3,
      "#68818c",
      0,
      tram ? 2.05 : 1.42,
      -0.12,
    );
    box(
      tram ? 2.3 : 1.6,
      0.12,
      tram ? 8.15 : 2.6,
      color,
      0,
      tram ? 2.68 : 1.81,
      -0.12,
    );
    for (const x of [-0.84, 0.84])
      for (const z of [-1.3, 1.3]) {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.31, 0.31, 0.18, 10),
          mat("#38424a"),
        );
        m.rotation.z = Math.PI / 2;
        m.position.set(x, 0.36, z);
        g.add(m);
      }
    box(1.4, 0.17, 0.06, "#fff3c4", 0, 0.78, 2.13);
    return g;
  }
  function populate(teleport = false) {
    const savedPlayer = player,
      savedTarget = playerTarget?.clone();
    if (savedPlayer) savedPlayer.removeFromParent();
    disposeGroup(population);
    scene.add(population);
    agents = [];
    vehicles = [];
    const target = teleport
      ? point3([focus.lng, focus.lat])
      : controls.target.clone();
    const close = roadPaths.filter((p) =>
      p.ps.some((v) => Math.hypot(v.x - target.x, v.z - target.z) < 650),
    );
    const walks = close.filter((p) =>
      [
        "footway",
        "pedestrian",
        "path",
        "residential",
        "living_street",
      ].includes(p.kind),
    );
    const drives = close.filter(
      (p) =>
        !["footway", "pedestrian", "steps", "path", "rail", "tram"].includes(
          p.kind,
        ),
    );
    const outfits = [
      "#bba46a",
      "#4c666a",
      "#b97563",
      "#d8d4c2",
      "#77748c",
      "#496a59",
    ];
    const skins = ["#a87955", "#76513b", "#d5af8b", "#b58c6b", "#5b3d30"];
    for (let i = 0; i < 26 && walks.length; i++) {
      const line = walks[i % walks.length],
        group = createCharacter({
          shirt: outfits[i % outfits.length],
          skin: skins[i % skins.length],
          style: ["casual", "jacket", "dress", "tourist"][i % 4],
          hairStyle: ["short", "curly", "bob", "bun"][i % 4],
          phase: i * 0.7,
        });
      const side = ["footway", "path", "pedestrian"].includes(line.kind)
        ? 0
        : line.width / 2 + 1.2;
      const d = ((i * 0.173) % 1) * line.length;
      const initial = sample(line, d, side);
      group.position.copy(initial.v);
      group.rotation.y = initial.angle;
      population.add(group);
      agents.push({ group, line, d, side, speed: 1.05 + (i % 4) * 0.12 });
    }
    for (let i = 0; i < 18 && drives.length; i++) {
      const line = drives[i % drives.length],
        tram = false,
        group = car(
          tram
            ? "#d4aa48"
            : ["#ecebe3", "#8b5550", "#69808a", "#5e7164"][i % 4],
          tram,
        );
      const d = ((i * 0.217) % 1) * line.length,
        side = line.width / 4,
        initial = sample(line, d, side);
      group.position.copy(initial.v);
      group.rotation.y = initial.angle;
      population.add(group);
      vehicles.push({ group, line, d, side, speed: tram ? 5 : 6 + (i % 4) });
    }
    const trams = close.filter((p) => p.kind === "tram");
    for (let i = 0; i < 3 && trams.length; i++) {
      const line = trams[i % trams.length],
        group = car("#d4aa48", true),
        d = (line.length * i) / 3,
        initial = sample(line, d);
      group.position.copy(initial.v);
      group.rotation.y = initial.angle;
      population.add(group);
      vehicles.push({ group, line, d, side: 0, speed: 5 });
    }
    if (savedPlayer && !teleport) {
      player = savedPlayer;
      population.add(player);
      playerTarget = savedTarget;
      return;
    }
    if (savedPlayer) disposeGroup(savedPlayer);
    player = null;
    player = createCharacter({
      shirt: options.shirt || "#ece7df",
      skin: "#a87955",
      style: "tourist",
      hairStyle: "short",
    });
    const nearest = nearestPath(target, true);
    player.position.copy(
      nearest
        ? sample(nearest.line, nearest.d, nearest.line.width / 2 + 1.2).v
        : target,
    );
    population.add(player);
    playerTarget = player.position.clone();
    const you = canvasLabel("YOU", "#292942");
    you.position.y = 2.6;
    you.scale.set(2.5, 0.55, 1);
    player.add(you);
  }
  function restoreCity(){city.visible=true;markers.visible=true;population.visible=true;scene.background=new THREE.Color("#c7dee8");}
  function setFocus(next, street = false) {
    restoreCity();
    if (characterGallery) {
      disposeGroup(characterGallery);
      characterGallery = null;
    }
    generation++;
    focus = next;
    const p = point3([next.lng, next.lat]);
    const distance = street ? 24 : next.range || 160;
    if (street && player) p.copy(player.position);
    controls.target.copy(p);
    camera.position.set(
      p.x + distance * 0.7,
      p.y + distance * 0.72,
      p.z + distance * 0.85,
    );
    sun.position.set(p.x - 150, p.y + 400, p.z + 180);
    sun.target.position.copy(p);
    controls.update();
    if (manifest) {
      if (!street) populate(true);
      loadChunks();
    }
  }
  async function loadOverview() {
    if (overviewMesh || overviewLoading || destroyed) return;
    overviewLoading = true;
    try {
      const data = await geographyFile(
        "/data/lisbon-overview.json.gz",
        abort.signal,
      );
      if (destroyed) return;
      const boxes = data.buildings;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        mat("#d1c4ac"),
        boxes.length,
      );
      const dummy = new THREE.Object3D();
      boxes.forEach((b, i) => {
        const y = geoY(unprojectGeo(b[0], b[1]));
        dummy.position.set(b[0], y + b[4] / 2, b[1]);
        dummy.scale.set(Math.max(1, b[2]), b[4], Math.max(1, b[3]));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      overviewMesh = mesh;
    } catch {
    } finally {
      overviewLoading = false;
    }
  }
  function overview() {
    restoreCity();
    generation++;
    if (characterGallery) {
      disposeGroup(characterGallery);
      characterGallery = null;
    }
    loadOverview();
    const bounds = manifest?.bounds || [-9.435, 38.683, -9.085, 38.832],
      a = projectGeo([bounds[0], bounds[3]]),
      b = projectGeo([bounds[2], bounds[1]]),
      mid = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    const distance =
      (Math.max((b.x - a.x) / Math.max(0.4, camera.aspect), b.z - a.z) /
        (2 * Math.tan((camera.fov * Math.PI) / 360))) *
      1.1;
    controls.target.copy(mid);
    camera.position
      .copy(mid)
      .add(new THREE.Vector3(distance * 0.08, distance * 0.9, distance * 0.42));
    controls.update();
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  let down = null;
  function pointerDown(e) {
    down = { x: e.clientX, y: e.clientY };
  }
  function pointerUp(e) {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(markerMeshes, false)[0];
    if (hit) {
      options.onHotspot?.(hit.object.userData.hotspot);
      return;
    }
    if (player && mode === "walk") {
      const ground = ray
        .intersectObjects(city.children, false)
        .find((h) => h.object.userData.ground);
      if (ground) {
        const p = unprojectGeo(ground.point.x, ground.point.z);
        if (
          containsGeo(manifest.bounds, p) &&
          player.position.distanceTo(ground.point) < 300
        ) {
          const nearest = nearestPath(ground.point, true);
          playerTarget = nearest
            ? sample(nearest.line, nearest.d, nearest.line.width / 2 + 1.2).v
            : ground.point.clone();
        }
      }
    }
  }
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  function animate(now) {
    if (destroyed) return;
    const dt = Math.min((now - lastTime) / 1000 || 0, 0.05);
    lastTime = now;
    controls.update();
    if (motion && !characterGallery && camera.position.distanceTo(controls.target) < 900) {
      for (const a of agents) {
        a.d += dt * a.speed;
        const p = sample(a.line, a.d, a.side);
        a.group.position.copy(p.v);
        a.group.rotation.y = p.angle;
        animateCharacter(a.group, now / 1000, true);
      }
      for (const v of vehicles) {
        v.d += dt * v.speed;
        const p = sample(v.line, v.d, v.side);
        v.group.position.copy(p.v);
        v.group.rotation.y = p.angle;
      }
    }
    if (player) {
      const diff = playerTarget.clone().sub(player.position),
        distance = diff.length();
      if (distance > 0.1) {
        const step = Math.min(distance, dt * 2.5);
        player.position.add(diff.normalize().multiplyScalar(step));
        player.position.y =
          geoY(unprojectGeo(player.position.x, player.position.z)) + 0.2;
        player.rotation.y = Math.atan2(diff.x, diff.z);
      }
      animateCharacter(player, now / 1000, motion && distance > 0.1);
    }
    const range = camera.position.distanceTo(controls.target);
    population.visible = !characterGallery && range < 900;
    renderer.shadowMap.enabled = range < 1200;
    scene.fog.near = Math.max(2500, range * 1.2);
    scene.fog.far = Math.max(18000, range * 4);
    if (range > 2200 && !overviewMesh) loadOverview();
    for (const group of chunkGroups.values()) group.visible = range < 6000;
    if (overviewMesh) overviewMesh.visible = range > 2200 && !characterGallery;
    const seenAreas = new Set();
    for (const m of labels) {
      const scale = Math.max(0.7, Math.min(180, range / 160));
      m.label.scale.set(24 * scale, 5.3 * scale, 1);
      m.label.position.y = 12 * scale;
      m.pin.scale.setScalar(Math.max(1, scale * 0.8));
      m.pin.position.y = 7 * scale;
      m.stem.visible = scale < 3;
      const far = m.group.position.distanceTo(controls.target);
      m.label.visible = range > 1800 || far < Math.max(450, range * 2);
      const area = m.hotspot.area || m.hotspot.id;
      if (range > 5000) {
        m.label.visible = m.label.visible && !seenAreas.has(area);
        seenAreas.add(area);
      }
      m.pin.visible = range < 5000 ? m.label.visible : true;
    }
    if (manifest && now - lastChunkUpdate > 2200) {
      lastChunkUpdate = now;
      loadChunks();
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
  status("Loading real Lisbon geography…");
  const ready = Promise.all([
    geographyFile("/data/lisbon-manifest.json.gz", abort.signal),
    geographyFile("/data/lisbon-terrain.json.gz", abort.signal).catch(
      () => null,
    ),
  ])
    .then(([data, dem]) => {
      if (destroyed) return;
      manifest = data;
      terrain = dem;
      terrainMesh();
      surfaces();
      roads();
      setMarkers(options.hotspots || []);
      setFocus(focus);
      status("");
      options.onReady?.();
    })
    .catch(() => {
      if (!destroyed)
        status(
          "City geography could not load. Try reloading; trip experiences still work.",
        );
    });
  function characters() {
    if (!player) return;
    if (characterGallery) disposeGroup(characterGallery);
    characterGallery = new THREE.Group();
    const centre = player.position.clone(),
      angle = 0;
    for (let i = 0; i < 4; i++) {
      const person = createCharacter({
        shirt: ["#bba46a", "#4c666a", "#b97563", "#77748c"][i],
        skin: ["#a87955", "#76513b", "#d5af8b", "#5b3d30"][i],
        style: ["casual", "jacket", "dress", "tourist"][i],
        hairStyle: ["short", "curly", "bob", "bun"][i],
      });
      const offset = new THREE.Vector3((i - 1.5) * 1.25, 0, 0).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        angle,
      );
      person.position.copy(centre).add(offset);
      person.position.y = centre.y;
      person.rotation.y = angle;
      characterGallery.add(person);
    }
    const floor=new THREE.Mesh(new THREE.BoxGeometry(7,.05,4),mat("#eeeadf"));floor.position.copy(centre);floor.position.y-=.03;floor.receiveShadow=true;characterGallery.add(floor);
    scene.add(characterGallery);city.visible=false;markers.visible=false;population.visible=false;scene.background=new THREE.Color("#dcded5");
    controls.target.copy(centre).add(new THREE.Vector3(0, 0.95, 0));
    const distance = Math.max(
      8,
      5.5 / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect),
    );
    const offset = new THREE.Vector3(
      distance * 0.12,
      distance * 0.4,
      distance,
    ).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    camera.position.copy(centre).add(offset);

    controls.update();
  }
  return {
    ready,
    setFocus,
    setMarkers,
    overview,
    characters,
    setMode(next) {
      mode = next;
      controls.mouseButtons.LEFT =
        next === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    },
    setMotion(value) {
      motion = value;
    },
    zoom(multiplier) {
      camera.position
        .sub(controls.target)
        .multiplyScalar(multiplier)
        .add(controls.target);
      controls.update();
    },
    rotate(angle) {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    dispose() {
      destroyed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      disposeGroup(scene);
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
