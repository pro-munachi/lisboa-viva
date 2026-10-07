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
import {
  createArchitecturePalette,
  buildingArchitecture,
  createBuildingDetails,
} from "./city-architecture";
import { createBuildingOverview } from "./city-overview";
import { createTravelRuntime } from "./city-travel";
import { createLandscape, setLandscapeNight } from "./city-landscape";
import { lightingForMinute, nearestLampAnchors } from "./city-lighting";
import { createLandmarks, isLandmarkBuilding } from "./city-landmarks";
import { createCityAtmosphere } from "./city-atmosphere";
import { coastRegions } from "./city-water";
import { beachCameraView } from "./city-beach-camera";
import { drapedPolygonGeometry } from "./city-surfaces";
import { createVenueDecorations } from "./city-venues";
import { createInteriorRuntime } from "./city-interior-runtime";
import { interiorLightingForMinute } from "./city-interiors";
import { createHotspotBadgeLayer } from "./city-hotspot-badges";
import {
  createLocalWalkerProfiles,
  advanceLocalWalker,
  sampleLocalWalker,
} from "./city-population";

async function geographyFile(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("Geography unavailable");
  if (url.endsWith(".gz") && !r.headers.get("Content-Encoding"))
    return new Response(
      r.body.pipeThrough(new DecompressionStream("gzip")),
    ).json();
  return r.json();
}
export function createCity(host, options) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  renderer.setClearColor("#dae5e0");
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const atmosphere = createCityAtmosphere(renderer, scene);
  const architecture = createArchitecturePalette();
  const hemisphere = new THREE.HemisphereLight("#e4f1ff", "#ae9c78", 1.65);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight("#fff0d8", 3.1);
  sun.position.set(-150, 400, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.far = 1800;
  sun.shadow.normalBias = 0.16;
  sun.shadow.bias = -0.00015;
  scene.add(sun);
  scene.add(sun.target);
  // A fixed six-light pool illuminates only nearby lanterns; all other pools
  // of light are batched with their owned, terrain-draped landscape geometry.
  const lampLights = Array.from({ length: 6 }, () => {
    const light = new THREE.PointLight("#ffd293", 0, 18, 2);
    light.visible = false;
    scene.add(light);
    return light;
  });
  let exteriorLighting = lightingForMinute(options.minute ?? 660),
    lightingKey = "";
  const galleryLighting = lightingForMinute(660);
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
    coastline = null,
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
  let pendingTeleport = true;
  const chunkGroups = new Map(),
    chunkCache = new Map(),
    roadPaths = [],
    venueMeshes = [],
    personMeshes = [];
  let selectedHotspotId = null;
  const badgeItems = [];
  let markerSelection = "",
    populationCentre = null,
    venueCentre = null;
  const city = new THREE.Group();
  scene.add(city);
  const population = new THREE.Group();
  scene.add(population);
  const materials = new Map();
  const sharedMaterials = new Set([
    ...architecture.wallMaterials,
    ...architecture.roofMaterials,
    architecture.detailMaterial,
    ...atmosphere.materials,
  ]);
  function mat(c) {
    if (!materials.has(c)) {
      const material = new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.88,
      });
      materials.set(c, material);
      sharedMaterials.add(material);
    }
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
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry) geometries.add(o.geometry);
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!sharedMaterials.has(m)) {
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
  function selectHotspot(hotspot) {
    if (travel.active) return;
    selectedHotspotId = hotspot.id;
    options.onHotspot?.(hotspot);
  }
  const badges = createHotspotBadgeLayer(host, { onSelect: selectHotspot });
  const indoor = createInteriorRuntime({
    scene,
    camera,
    controls,
    disposeGroup,
    badgeHost: host,
    shirt: options.shirt,
    onZone: options.onInteriorZone,
    onActivity: options.onInteriorActivity,
    reducedMotion: reduce,
    night: exteriorLighting.night,
  });
  let travelPhase = null;
  const travel = createTravelRuntime({
    scene,
    camera,
    controls,
    projectGeo,
    geoY,
    reducedMotion: reduce,
    onPhase(event) {
      travelPhase = event.phase;
      // The last shot returns to the actual mapped destination from the
      // original transport tableau. Its local chunks started loading before
      // boarding, so the reveal keeps the real city geography.
      if (event.phase === "arriving") {
        city.visible = true;
        population.visible = true;
      }
      options.onTravelPhase?.(event);
    },
    onFinish(event) {
      travelPhase = null;
      restoreCity();
      setFocus(event.to);
      options.onTravelComplete?.(event);
    },
  });
  function cancelTravel() {
    if (!travel.active) return;
    travel.cancel();
    travelPhase = null;
    restoreCity();
  }
  function startTravel(sequence) {
    if (
      destroyed ||
      !sequence?.from ||
      !sequence?.to ||
      ![
        sequence.from.lat,
        sequence.from.lng,
        sequence.to.lat,
        sequence.to.lng,
      ].every(Number.isFinite)
    )
      return false;
    cancelTravel();
    setFocus(sequence.to);
    city.visible = population.visible = false;
    if (overviewMesh) overviewMesh.visible = false;
    badges.update(camera, {
      width: host.clientWidth,
      height: host.clientHeight,
      visible: false,
    });
    if (!travel.start(sequence)) {
      restoreCity();
      return false;
    }
    status("");
    return true;
  }
  function syncLighting() {
    const exterior = !indoor.active && !characterGallery;
    const state = exterior
      ? exteriorLighting
      : indoor.active
        ? interiorLightingForMinute(exteriorLighting.minute, indoor.kind)
        : galleryLighting;
    const key = `${exterior}:${indoor.kind || "gallery"}:${state.minute}`;
    if (key !== lightingKey) {
      lightingKey = key;
      atmosphere.setLighting(state, exterior);
      hemisphere.color.set(state.hemisphereSky);
      hemisphere.groundColor.set(state.hemisphereGround);
      hemisphere.intensity = state.hemisphereIntensity;
      sun.color.set(state.sunColor);
      sun.intensity = state.sunIntensity;
      architecture.setNight(exterior ? state.night : 0);
      indoor.setLighting(state.night);
    }
    const target = controls.target;
    sun.position.set(
      target.x + state.sunOffset.x,
      target.y + state.sunOffset.y,
      target.z + state.sunOffset.z,
    );
    sun.target.position.copy(target);
    const anchors = [];
    for (const group of chunkGroups.values()) {
      for (const child of group.children) {
        if (!child.userData.lighting) continue;
        setLandscapeNight(child, exterior ? state.night : 0);
        if (exterior && group.visible && child.visible)
          anchors.push(...child.userData.lighting.lampAnchors);
      }
    }
    const closeLamps =
      exterior && state.night > 0.01 && camera.position.distanceTo(target) < 600
        ? nearestLampAnchors(anchors, target)
        : [];
    lampLights.forEach((light, index) => {
      const point = closeLamps[index];
      light.visible = !!point;
      light.intensity = point ? state.night * 110 : 0;
      if (point) light.position.copy(point);
    });
  }
  function setTime(minute) {
    if (destroyed) return;
    exteriorLighting = lightingForMinute(minute);
    syncLighting();
  }
  let pendingVenue = null;
  function flatPolygonGeometry(ring, holes = [], height = 0.06) {
    const toPath = (points, path) => {
      points
        .map(projectGeo)
        .forEach((p, i) =>
          i ? path.lineTo(p.x, -p.z) : path.moveTo(p.x, -p.z),
        );
      return path;
    };
    const shape = toPath(ring, new THREE.Shape());
    shape.holes = holes.map((hole) => toPath(hole, new THREE.Path()));
    const indexed = new THREE.ShapeGeometry(shape);
    indexed.rotateX(-Math.PI / 2);
    indexed.translate(0, height, 0);
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    return geometry;
  }
  function terrainMesh() {
    const bounds = manifest.bounds;
    const land = coastline.land.length
      ? coastline.land
      : [
          {
            ring: [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[1]],
              [bounds[2], bounds[3]],
              [bounds[0], bounds[3]],
            ],
            holes: [],
          },
        ];
    const geometries = land.map((polygon) =>
      drapedPolygonGeometry(
        polygon.ring,
        {
          projectGeo,
          unprojectGeo,
          geoY,
          terrain,
          holes: polygon.holes,
        },
        -0.25,
      ),
    );
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    const colors = [],
      color = new THREE.Color(),
      positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i),
        x = positions.getX(i),
        z = positions.getZ(i);
      color.set(y > 140 ? "#789077" : y > 50 ? "#a2ae89" : "#c5c7ac");
      color.multiplyScalar(
        0.95 + Math.sin(x * 0.004) * Math.cos(z * 0.006) * 0.035,
      );
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    mesh.receiveShadow = true;
    mesh.userData.ground = true;
    city.add(mesh);
    const waterGeometries = coastline.water.map((polygon) =>
      flatPolygonGeometry(polygon.ring, polygon.holes),
    );
    if (waterGeometries.length) {
      const merged = mergeGeometries(waterGeometries, false);
      waterGeometries.forEach((g) => g.dispose());
      const water = new THREE.Mesh(merged, atmosphere.water);
      water.name = "Tagus estuary and Atlantic coast";
      city.add(water);
    }
  }
  function polygonGeometry(ring, yOffset = 0) {
    return drapedPolygonGeometry(
      ring,
      { projectGeo, unprojectGeo, geoY, terrain },
      yOffset,
    );
  }
  function surfaces(list = manifest.surfaces, parent = city) {
    const buckets = { water: [], park: [], wood: [], sand: [] };
    for (const s of list) {
      if (s.ring.length < 3) continue;
      if (s.kind === "water" && coastline.waterAt(s.ring[0])) continue;
      const g =
        s.kind === "water"
          ? flatPolygonGeometry(
              s.ring,
              [],
              Math.max(0, Math.min(...s.ring.map(geoY))) + 0.08,
            )
          : polygonGeometry(s.ring, 0.1);
      buckets[s.kind]?.push(g);
    }
    for (const [kind, gs] of Object.entries(buckets)) {
      if (!gs.length) continue;
      const merged = mergeGeometries(gs);
      gs.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(
        merged,
        kind === "water"
          ? atmosphere.water
          : mat({ park: "#91b974", wood: "#6d9965", sand: "#e0d1ab" }[kind]),
      );
      mesh.receiveShadow = kind !== "water";
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
    const add = (material, vertices) => {
      if (!vertices.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      const uv = [];
      for (let i = 0; i < vertices.length; i += 3)
        uv.push(vertices[i] / 4, vertices[i + 2] / 4);
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geometry.computeVertexNormals();
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(geometry);
    };
    const ribbon = (a, b, width, side, lift, vertices) => {
      const dx = b.x - a.x,
        dz = b.z - a.z,
        len = Math.hypot(dx, dz);
      if (len < 0.2) return;
      const nx = -dz / len,
        nz = dx / len;
      const p = [
        [a.x + nx * (side + width / 2), a.z + nz * (side + width / 2)],
        [a.x + nx * (side - width / 2), a.z + nz * (side - width / 2)],
        [b.x + nx * (side + width / 2), b.z + nz * (side + width / 2)],
        [b.x + nx * (side - width / 2), b.z + nz * (side - width / 2)],
      ].map(([x, z]) => [x, geoY(unprojectGeo(x, z)) + lift, z]);
      vertices.push(...p[0], ...p[2], ...p[1], ...p[2], ...p[3], ...p[1]);
    };
    for (const road of list) {
      if (road.points.length < 2) continue;
      const points = densePoints(road.points),
        ps = points.map(point3);
      const vertices = [],
        paving = [],
        rails = [],
        lanes = [];
      const driving = ![
        "rail",
        "tram",
        "footway",
        "pedestrian",
        "steps",
        "path",
        "cycleway",
      ].includes(road.kind);
      const detailed = owner !== "overview";
      let travelled = 0;
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1],
          b = ps[i],
          length = a.distanceTo(b);
        ribbon(a, b, road.width, 0, 0.19, vertices);
        if (detailed && driving && road.width >= 4)
          ribbon(a, b, road.width + 2, 0, 0.14, paving);
        if (["tram", "rail"].includes(road.kind)) {
          ribbon(a, b, 0.12, -0.7, 0.225, rails);
          ribbon(a, b, 0.12, 0.7, 0.225, rails);
        }
        if (
          detailed &&
          road.width >= 7 &&
          ["primary", "secondary", "tertiary"].includes(road.kind)
        ) {
          for (let d = (8 - (travelled % 8)) % 8; d + 2 < length; d += 8) {
            ribbon(
              a.clone().lerp(b, d / length),
              a.clone().lerp(b, Math.min(1, (d + 2.8) / length)),
              0.13,
              0,
              0.225,
              lanes,
            );
          }
        }
        travelled += length;
      }
      add(atmosphere.roadMaterial(road.kind), vertices);
      add(atmosphere.paving, paving);
      add(atmosphere.steel, rails);
      add(atmosphere.lane, lanes);
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
    for (const [material, geometries] of buckets) {
      const merged = mergeGeometries(geometries);
      geometries.forEach((geometry) => geometry.dispose());
      const mesh = new THREE.Mesh(merged, material);
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
    if (
      !manifest ||
      destroyed ||
      loadInProgress ||
      characterGallery ||
      indoor.active ||
      (travel.active && travelPhase !== "arriving")
    )
      return;
    refreshMarkers();
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
      // Canceled construction can leave cached data without a rendered group.
      // Keep only the same bounded set requested by the current camera region.
      for (const id of chunkCache.keys())
        if (!ids.has(id)) chunkCache.delete(id);
      for (const chunk of wanted) {
        if (destroyed || ticket !== generation) break;
        if (chunkGroups.has(chunk.id)) continue;
        let data = chunkCache.get(chunk.id);
        if (!data) {
          data = await geographyFile(chunk.url, abort.signal);
          if (destroyed || ticket !== generation) break;
          chunkCache.set(chunk.id, data);
        }
        if (destroyed || ticket !== generation) break;
        await addBuildings(data, ticket);
        if (destroyed || ticket !== generation) {
          if (!chunkGroups.has(chunk.id)) chunkCache.delete(chunk.id);
          break;
        }
        changed = true;
      }
      if (!destroyed && ticket === generation) {
        if (
          changed ||
          !venueCentre ||
          venueCentre.distanceTo(controls.target) > 120
        ) {
          for (const [id, group] of chunkGroups) {
            const data = chunkCache.get(id);
            if (!data) continue;
            for (const child of [...group.children])
              if (
                child.userData.venueDetail ||
                child.userData.architectureDetail
              )
                disposeGroup(child);
            addNearBuildingDetails(data, group);
            const storefronts = createVenueDecorations(
              data,
              (options.hotspots || []).filter((h) => h.mapVenue),
              {
                projectGeo,
                geoY,
                focusPoint: unprojectGeo(controls.target.x, controls.target.z),
              },
            );
            storefronts.userData.streetDetail =
              storefronts.userData.venueDetail = true;
            group.add(storefronts);
          }
          venueCentre = controls.target.clone();
        }
        venueMeshes.length = 0;
        for (const group of chunkGroups.values())
          group.traverse((mesh) => {
            if (mesh.userData.hotspot) venueMeshes.push(mesh);
          });
        refreshMarkers();
        if (
          pendingTeleport ||
          changed ||
          !populationCentre ||
          populationCentre.distanceTo(controls.target) > 70
        ) {
          populate(pendingTeleport);
          pendingTeleport = false;
        }
        if (pendingVenue) {
          const storefront = venueMeshes.find(
            (mesh) =>
              mesh.userData.hotspot.id === pendingVenue &&
              mesh.userData.venueView,
          );
          if (storefront) frameVenue(storefront.userData.venueView);
          pendingVenue = null;
        }
      }
      options.onStats?.({
        buildings: [...chunkGroups.values()].reduce(
          (n, g) => n + (g.userData.count || 0),
          0,
        ),
        roads: manifest.counts.roads,
        source: manifest.source.name,
        heights: "OSM heights where recorded; otherwise estimated",
        terrain: !!terrain,
        people: agents.length,
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
    const groups = architecture.wallMaterials.map(() => []),
      roofs = architecture.roofMaterials.map(() => []);
    let count = 0;
    const cleanup = () => {
      groups.flat().forEach((g) => g.dispose());
      roofs.flat().forEach((g) => g.dispose());
    };
    for (const building of chunk.buildings) {
      if (destroyed || ticket !== generation) {
        cleanup();
        return;
      }
      if (building.ring.length < 3) continue;
      count++;
      if (!isLandmarkBuilding(building)) {
        const geometry = buildingArchitecture(building, { projectGeo, geoY });
        if (geometry) {
          groups[geometry.paletteIndex].push(geometry.wall);
          roofs[geometry.roofIndex].push(geometry.roof);
        }
      }
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
    groups.forEach((geometries, i) => {
      if (!geometries.length) return;
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      const mesh = new THREE.Mesh(merged, architecture.wallMaterials[i]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    });
    roofs.forEach((geometries, i) => {
      if (!geometries.length) return;
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      const mesh = new THREE.Mesh(merged, architecture.roofMaterials[i]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    });
    const dressing = createLandscape(chunk, {
      projectGeo,
      geoY,
      focusPoint: unprojectGeo(controls.target.x, controls.target.z),
    });
    setLandscapeNight(dressing, exteriorLighting.night);
    dressing.userData.streetDetail = true;
    group.add(dressing);
    const storefronts = createVenueDecorations(
      chunk,
      (options.hotspots || []).filter((h) => h.mapVenue),
      {
        projectGeo,
        geoY,
        focusPoint: unprojectGeo(controls.target.x, controls.target.z),
      },
    );
    storefronts.userData.streetDetail = storefronts.userData.venueDetail = true;
    group.add(storefronts);
    group.add(createLandmarks(chunk, { projectGeo, geoY }));
    city.add(group);
    chunkGroups.set(chunk.id, group);
  }
  function addNearBuildingDetails(chunk, group) {
    // Ornament follows the camera, including within an already loaded chunk.
    // Keep it bounded independently of the full geographic building mesh.
    const nearest = chunk.buildings
      .filter(
        (building) =>
          building.ring?.length >= 3 && !isLandmarkBuilding(building),
      )
      .map((building) => {
        const centre = building.ring
          .reduce((p, q) => [p[0] + q[0], p[1] + q[1]], [0, 0])
          .map((value) => value / building.ring.length);
        const p = projectGeo(centre);
        return {
          building,
          distance:
            (p.x - controls.target.x) ** 2 + (p.z - controls.target.z) ** 2,
        };
      })
      .filter(({ distance }) => distance < 350 ** 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 64);
    const geometries = nearest
      .map(({ building }) =>
        createBuildingDetails(building, { projectGeo, geoY }),
      )
      .filter(Boolean);
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) return;
    const details = new THREE.Mesh(merged, architecture.detailMaterial);
    details.name = "Nearby balconies, cornices and chimneys";
    details.userData.architectureDetail = true;
    details.castShadow = details.receiveShadow = true;
    group.add(details);
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
    markerSelection = "";
    refreshMarkers();
  }
  function refreshMarkers() {
    const hotspots = options.hotspots || [];
    const range = camera.position.distanceTo(controls.target);
    const nearby = hotspots
      .filter((h) => h.mapVenue)
      .map((h) => {
        const p = projectGeo([h.lng, h.lat]);
        return {
          h,
          distance: Math.hypot(
            p.x - controls.target.x,
            p.z - controls.target.z,
          ),
        };
      })
      .filter((v) => v.distance < Math.max(500, Math.min(1800, range * 3)))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 16)
      .map((v) => v.h);
    const selected = [
      ...new Map(
        [
          ...hotspots.filter((h) => !h.mapVenue),
          ...nearby,
          ...hotspots.filter((h) => h.id === selectedHotspotId),
        ].map((h) => [h.id, h]),
      ).values(),
    ];
    const items = selected.map((h) => {
      const v = point3([h.lng, h.lat]);
      const storefront = h.mapVenue
        ? venueMeshes.find(
            (mesh) =>
              mesh.userData.hotspot?.id === h.id && mesh.userData.venueView,
          )?.userData.venueView
        : null;
      if (storefront) {
        // Anchor to the same illustrative storefront used by the close camera.
        v.set(storefront.point.x, storefront.point.y + 0.8, storefront.point.z);
      } else {
        v.y += h.custom || h.mapLocation ? 5 : h.mapVenue ? 10 : 16;
      }
      return {
        id: h.id,
        name: h.name,
        category:
          h.custom || h.mapLocation ? "custom" : h.category || "landmark",
        position: v,
        value: h,
      };
    });
    const key = items
      .map(
        ({ id, name, category, position: p }) =>
          `${id}:${name}:${category}:${p.x}:${p.y}:${p.z}`,
      )
      .join("|");
    if (key === markerSelection) return;
    markerSelection = key;
    badgeItems.length = 0;
    badgeItems.push(...items);
    badges.setItems(badgeItems);
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
    return best && best.distance <= 120 ? best : null;
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
    populationCentre = target.clone();
    personMeshes.length = 0;
    const drives = close.filter(
      (p) =>
        !["footway", "pedestrian", "steps", "path", "rail", "tram"].includes(
          p.kind,
        ),
    );
    const profiles = createLocalWalkerProfiles({
      paths: roadPaths,
      target,
      buildings: [...chunkCache.values()].flatMap(
        (chunk) => chunk.buildings || [],
      ),
      projectGeo,
      max: 28,
    });
    for (const profile of profiles) {
      const group = createCharacter(profile.character);
      const initial = sampleLocalWalker(profile);
      group.position.set(
        initial.x,
        geoY(unprojectGeo(initial.x, initial.z)) + 0.2,
        initial.z,
      );
      group.rotation.y = initial.angle;
      group.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.userData.person = { name: profile.name, label: profile.label };
        personMeshes.push(mesh);
      });
      population.add(group);
      agents.push({ ...profile, group });
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
    const safe =
      profiles[0] &&
      sampleLocalWalker({
        ...profiles[0],
        d: Math.max(
          profiles[0].minD,
          Math.min(
            profiles[0].maxD,
            profiles[0].d + (profiles[0].d - profiles[0].minD > 4 ? -3.8 : 3.8),
          ),
        ),
      });
    player.position.copy(
      safe
        ? new THREE.Vector3(
            safe.x,
            geoY(unprojectGeo(safe.x, safe.z)) + 0.2,
            safe.z,
          )
        : nearest
          ? sample(nearest.line, nearest.d, nearest.line.width / 2 + 0.5).v
          : target,
    );
    population.add(player);
    playerTarget = player.position.clone();
    const you = canvasLabel("YOU", "#292942");
    you.position.y = 2.6;
    you.scale.set(1.2, 0.27, 1);
    player.add(you);
  }
  function restoreCity() {
    indoor.clear();
    city.visible = true;
    population.visible = true;
    scene.background = new THREE.Color(exteriorLighting.horizon);
    atmosphere.sky.visible = true;
  }
  function setFocus(next, street = false) {
    cancelTravel();
    restoreCity();
    if (characterGallery) {
      disposeGroup(characterGallery);
      characterGallery = null;
    }
    generation++;
    focus = next;
    selectedHotspotId = next.id || null;
    pendingVenue = !street && next.mapVenue ? next.id : null;
    const p = point3([next.lng, next.lat]);
    const distance = street ? 24 : next.range || 160;
    if (!street) pendingTeleport = true;
    if (street && player && !pendingTeleport) p.copy(player.position);
    controls.target.copy(p);
    camera.position.set(
      p.x + distance * 0.7,
      p.y + distance * 0.72,
      p.z + distance * 0.85,
    );
    sun.position.set(p.x - 150, p.y + 400, p.z + 180);
    sun.target.position.copy(p);
    controls.update();
    refreshMarkers();
    if (manifest) {
      return loadChunks();
    }
  }
  async function loadOverview() {
    if (overviewMesh || overviewLoading || destroyed) return;
    overviewLoading = true;
    try {
      const data = await geographyFile(
        options.city?.data.overview || "/data/lisbon-overview.json.gz",
        abort.signal,
      );
      if (destroyed) return;
      const mesh = createBuildingOverview(data.buildings, {
        geoY,
        unprojectGeo,
      });
      scene.add(mesh);
      overviewMesh = mesh;
    } catch {
    } finally {
      overviewLoading = false;
    }
  }
  function overview() {
    cancelTravel();
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
    if (indoor.active) indoor.frameRoom();
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
    if (travel.active) return;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    if (indoor.pick(ray, mode)) return;
    const visible = (mesh) => {
      for (let parent = mesh; parent; parent = parent.parent) {
        if (!parent.visible) return false;
        if (parent === scene) return true;
      }
      return false;
    };
    const hit = ray.intersectObjects(venueMeshes.filter(visible), false)[0];
    if (hit) {
      selectHotspot(hit.object.userData.hotspot);
      return;
    }
    const personHit =
      population.visible &&
      ray.intersectObjects(personMeshes.filter(visible), false)[0];
    if (personHit) {
      options.onPerson?.(personHit.object.userData.person);
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
    if (!travel.active) controls.update();
    travel.update(dt);
    indoor.update(dt, motion);
    if (
      motion &&
      !characterGallery &&
      !indoor.active &&
      !travel.active &&
      camera.position.distanceTo(controls.target) < 900
    ) {
      for (const a of agents) {
        advanceLocalWalker(a, dt);
        const p = sampleLocalWalker(a);
        a.group.position.set(p.x, geoY(unprojectGeo(p.x, p.z)) + 0.2, p.z);
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
    if (player && !indoor.active && !travel.active) {
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
    population.visible =
      !characterGallery &&
      !indoor.active &&
      (!travel.active || travelPhase === "arriving") &&
      range < 900;
    renderer.shadowMap.enabled = range < 1200;
    atmosphere.update(
      camera,
      dt,
      motion && !characterGallery && !indoor.active,
    );
    const shadowRange = Math.max(80, Math.min(420, range * 0.75));
    sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowRange;
    sun.shadow.camera.right = sun.shadow.camera.top = shadowRange;
    sun.shadow.camera.updateProjectionMatrix();
    scene.fog.near = Math.max(1800, range * 1.2);
    scene.fog.far = Math.max(13000, range * 4);
    if (range > 2200 && !overviewMesh && !travel.active) loadOverview();
    for (const group of chunkGroups.values()) {
      group.visible = range < 6000;
      for (const child of group.children)
        if (child.userData.streetDetail) child.visible = range < 2300;
        else if (child.userData.architectureDetail) child.visible = range < 900;
    }
    if (overviewMesh)
      overviewMesh.visible =
        range > 2200 &&
        !characterGallery &&
        (!travel.active || travelPhase === "arriving");
    syncLighting();
    badges.update(camera, {
      width: host.clientWidth,
      height: host.clientHeight,
      visible: !characterGallery && !indoor.active && !travel.active,
      selectedId: selectedHotspotId,
    });
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
    geographyFile(
      options.city?.data.manifest || "/data/lisbon-manifest.json.gz",
      abort.signal,
    ),
    geographyFile(
      options.city?.data.terrain || "/data/lisbon-terrain.json.gz",
      abort.signal,
    ).catch(() => null),
  ])
    .then(async ([data, dem]) => {
      if (destroyed) return false;
      manifest = data;
      terrain = dem;
      coastline = coastRegions(manifest);
      terrainMesh();
      surfaces();
      roads();
      setMarkers(options.hotspots || []);
      status("Loading the streets around you…");
      await setFocus(focus);
      if (destroyed) return false;
      status("");
      options.onReady?.();
      if (options.interior) setInterior(options.interior);
      return true;
    })
    .catch(() => {
      if (!destroyed)
        status(
          "City geography could not load. Try reloading; trip experiences still work.",
        );
      return false;
    });
  function characters() {
    cancelTravel();
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
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.05, 4),
      mat("#eeeadf"),
    );
    floor.position.copy(centre);
    floor.position.y -= 0.03;
    floor.receiveShadow = true;
    characterGallery.add(floor);
    scene.add(characterGallery);
    city.visible = false;
    population.visible = false;
    scene.background = new THREE.Color("#dcded5");
    atmosphere.sky.visible = false;
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
  function people() {
    cancelTravel();
    if (pendingTeleport) return;
    restoreCity();
    if (characterGallery) {
      disposeGroup(characterGallery);
      characterGallery = null;
    }
    const person = agents
      .slice()
      .sort(
        (a, b) =>
          a.group.position.distanceTo(controls.target) -
          b.group.position.distanceTo(controls.target),
      )[0];
    if (!person) return;
    const at = person.group.position.clone();
    // View along a safe mapped walking section, keeping the camera out of facades.
    const before = sampleLocalWalker({
      ...person,
      d: Math.max(
        person.minD,
        Math.min(
          person.maxD,
          person.d + (person.d - person.minD > 12 ? -12 : 12),
        ),
      ),
    });
    camera.position.set(
      before.x,
      Math.max(at.y, geoY(unprojectGeo(before.x, before.z))) + 7,
      before.z,
    );
    controls.target.copy(at).add(new THREE.Vector3(0, 0.9, 0));
    controls.update();
  }
  function frameVenue(view) {
    if (indoor.active || characterGallery || travel.active) return;
    const { point, normal, groundY } = view;
    const footprints = [...chunkCache.values()]
      .flatMap((c) => c.buildings || [])
      .map((b) => b.ring.map(projectGeo))
      .filter((ring) => {
        const west = Math.min(...ring.map((p) => p.x)),
          east = Math.max(...ring.map((p) => p.x)),
          north = Math.min(...ring.map((p) => p.z)),
          south = Math.max(...ring.map((p) => p.z));
        return Math.hypot(
          Math.max(west - point.x, 0, point.x - east),
          Math.max(north - point.z, 0, point.z - south),
        ) < 90;
      });
    if (focus?.category === "beach" && coastline) {
      const framed = beachCameraView({
        point: projectGeo([focus.lng, focus.lat]),
        groundY,
        waterAt: (p) => coastline.waterAt(unprojectGeo(p.x, p.z)),
        elevationAt: (p) => geoY(unprojectGeo(p.x, p.z)),
        footprints,
        aspect: camera.aspect,
      });
      if (framed) {
        controls.target.set(framed.target.x, framed.target.y, framed.target.z);
        camera.position.set(framed.camera.x, framed.camera.y, framed.camera.z);
        // The freestanding poster faces the approaching visitor; rotating its
        // plane keeps the atlas readable from land without moving its source.
        const sign = venueMeshes.find(
          (mesh) => mesh.userData.hotspot.id === focus.id,
        );
        if (sign)
          sign.rotation.y = Math.atan2(
            framed.camera.x - point.x,
            framed.camera.z - point.z,
          );
        controls.update();
        return;
      }
    }
    const blocked = (p) =>
      footprints.some((ring) => {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i],
            b = ring[j];
          if (
            a.z > p.z !== b.z > p.z &&
            p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
          )
            inside = !inside;
        }
        return inside;
      });
    const candidates = [
      [9, 10],
      [9, -10],
      [6, 9],
      [6, -9],
      [12, 0],
      [5, 0],
    ].map(([out, along]) => ({
      x: point.x + normal.x * out - normal.z * along,
      z: point.z + normal.z * out + normal.x * along,
    }));
    const at = candidates.find((p) => !blocked(p)) || candidates.at(-1);
    controls.target.set(
      point.x + normal.x * 1.2,
      groundY + 1.6,
      point.z + normal.z * 1.2,
    );
    camera.position.set(
      at.x,
      Math.max(groundY, geoY(unprojectGeo(at.x, at.z))) + 8,
      at.z,
    );
    controls.update();
  }
  function setInterior(next) {
    cancelTravel();
    options.interior = next;
    if (!next) {
      restoreCity();
      setFocus(focus);
      return;
    }
    if (!manifest) return;
    if (characterGallery) {
      disposeGroup(characterGallery);
      characterGallery = null;
    }
    generation++;
    indoor.enter(next, point3([focus.lng, focus.lat]));
    city.visible = population.visible = false;
    atmosphere.sky.visible = false;
    scene.background = new THREE.Color("#d9dfd3");
    status("");
  }
  return {
    ready,
    setFocus,
    startTravel,
    skipTravel: () => travel.skip(),
    cancelTravel,
    setTime,
    setMarkers,
    overview,
    characters,
    people,
    setInterior,
    selectInteriorZone: (id) => indoor.selectZone(id),
    performInteriorAction: (id, duration) => indoor.perform(id, duration),
    setMode(next) {
      mode = next;
      controls.mouseButtons.LEFT =
        next === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.touches.ONE =
        next === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    },
    setMotion(value) {
      motion = value;
    },
    zoom(multiplier) {
      if (travel.active) return;
      camera.position
        .sub(controls.target)
        .multiplyScalar(multiplier)
        .add(controls.target);
      controls.update();
    },
    rotate(angle) {
      if (travel.active) return;
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
      badges.dispose();
      indoor.dispose();
      travel.dispose();
      lampLights.forEach((light) => light.dispose());
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      disposeGroup(scene);
      materials.forEach((m) => m.dispose());
      architecture.dispose();
      atmosphere.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
