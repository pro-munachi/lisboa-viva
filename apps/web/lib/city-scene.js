import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  projectGeo,
  unprojectGeo,
  surfaceElevationAt,
  containsGeo,
} from "./geography";
import {
  createCharacter,
  animateCharacter,
  replaceCharacterAppearance,
} from "./characters";
import {
  createArchitecturePalette,
  buildingArchitecture,
  createBuildingDetails,
} from "./city-architecture";
import { createBuildingOverview } from "./city-overview";
import { createTravelRuntime } from "./city-travel";
import { createLandscape, setLandscapeNight } from "./city-landscape";
import { createStreetLife, setStreetLifeNight } from "./city-street-life";
import { lightingForMinute, nearestLampAnchors } from "./city-lighting";
import { createLandmarks, isLandmarkBuilding } from "./city-landmarks";
import { createCityAtmosphere } from "./city-atmosphere";
import { coastRegions } from "./city-water";
import { beachCameraView } from "./city-beach-camera";
import {
  createLocationFocus,
  locationCameraView,
  locationTreeObstacles,
} from "./city-location-focus";
import { drapedPolygonGeometry } from "./city-surfaces";
import { createVenueDecorations } from "./city-venues";
import { createBeachLife, updateBeachLife } from "./city-beach-life";
import {
  createTrafficSimulation,
  advanceTraffic,
  sampleTrafficVehicle,
} from "./city-traffic";
import { createCityVehicle } from "./city-vehicles";
import {
  createCityFixtures,
  updateCityFixtures,
  sceneryFromIntersection,
} from "./city-fixtures";
import {
  createCityLayerMaterial,
  updateCityLayerBounds,
  projectedCityBounds,
  safeRoadRibbonGeometry,
  updateCityCameraClip,
  uniqueCityBuildingFootprints,
} from "./city-rendering";
import {
  createNavigationWorld,
  navigationPointIsClear,
  findSafeWalkingPoint,
  planWalkingPath,
  moveWithCollisions,
  updateFollowCamera,
  cameraCollisionPosition,
} from "./city-navigation";
import { createScenicNpcLod, updateScenicNpcLod } from "./city-npc-lod";
import { createInteriorRuntime } from "./city-interior-runtime";
import { interiorLightingForMinute } from "./city-interiors";
import { createHotspotBadgeLayer } from "./city-hotspot-badges";
import {
  createLocalWalkerProfiles,
  advanceLocalWalker,
  sampleLocalWalker,
} from "./city-population";
import {
  applyLocalDemographicVisuals,
  poseLocalDemographic,
} from "./npc-demographics";
import { sceneryActions } from "./scenery-actions";

async function geographyFile(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("Geography unavailable");
  if (url.endsWith(".gz") && !r.headers.get("Content-Encoding"))
    return new Response(
      r.body.pipeThrough(new DecompressionStream("gzip")),
    ).json();
  return r.json();
}

/** A source road/surface belongs to one geographic chunk. Visibility ownership
 * is by source ID, so long roads and parks retain their complete footprint.
 * @param {any[]} chunks
 */
export function detailedCityLayerIds(chunks) {
  return {
    roads: new Set(
      chunks.flatMap((chunk) => (chunk.roads || []).map((road) => road.id)),
    ),
    surfaces: new Set(
      chunks.flatMap((chunk) =>
        (chunk.surfaces || []).map((surface) => surface.id),
      ),
    ),
  };
}

/** Footways and tracks can share a mapped roadway's footprint but cannot share
 * its depth. Sidewalks contain edge strips rather than a slab through traffic.
 */
export function cityRoadSurfaceLayers(road, detailed = true) {
  const pedestrian = [
    "footway",
    "pedestrian",
    "steps",
    "path",
    "cycleway",
  ].includes(road.kind);
  const track = ["tram", "rail"].includes(road.kind);
  const layers = [
    {
      kind: "road",
      width: road.width,
      side: 0,
      lift: pedestrian ? 0.15 : track ? 0.18 : 0.23,
    },
  ];
  if (detailed && !pedestrian && !track && road.width >= 4) {
    for (const side of [-1, 1])
      layers.push({
        kind: "paving",
        width: 1,
        side: side * (road.width / 2 + 0.5),
        lift: 0.16,
      });
  }
  return layers;
}

/** @param {any} point @param {any[]} actors */
export function cityActorSpaceIsClear(point, actors) {
  return actors.every((actor) => {
    if (
      !(actor.radius > 0) ||
      (Number.isFinite(point.y) &&
        Number.isFinite(actor.y) &&
        Math.abs(point.y - actor.y) > 2.2)
    )
      return true;
    return (
      Math.hypot(point.x - actor.x, point.z - actor.z) >=
      actor.radius + 0.42 + 0.25
    );
  });
}

/** Arrival is a placement, not a walking sweep. Find free shoulder space before
 * making the player visible; NPC yielding cannot repair an already overlapping
 * spawn. The search remains local and does not move the mapped destination.
 * @param {any} world @param {any} point @param {any[]} actors
 */
export function clearCityPlayerSpawn(world, point, actors) {
  if (!world || !Number.isFinite(point?.x) || !Number.isFinite(point?.z))
    return null;
  const safe = findSafeWalkingPoint(world, point, { searchRadius: 12 });
  const clear = (p) =>
    navigationPointIsClear(world, p) &&
    cityActorSpaceIsClear({ ...p, y: world._elevationAt?.(p) }, actors);
  if (safe && clear(safe)) return safe;
  for (let span = 0.25; span <= 12; span += 0.25)
    for (let i = 0; i < 24; i++) {
      const angle = (i * Math.PI) / 12;
      const p = {
        x: point.x + Math.cos(angle) * span,
        z: point.z + Math.sin(angle) * span,
      };
      if (clear(p)) return p;
    }
  return null;
}

/** @param {any} world @param {{x:number,z:number}} start @param {any} object */
export function planSceneryApproach(world, start, object) {
  if (
    !world ||
    ![object?.x, object?.z, start?.x, start?.z].every(Number.isFinite)
  )
    return null;
  if (Math.hypot(object.x - start.x, object.z - start.z) > 120) return null;
  const gap = Math.max(0.8, Number(object.radius) || 0) + 0.72;
  const facing = Number(object.angle) || 0;
  const preferred = [
    facing,
    facing + Math.PI / 2,
    facing - Math.PI / 2,
    facing + Math.PI,
  ];
  for (const angle of preferred) {
    const goal = {
      x: object.x + Math.sin(angle) * gap,
      z: object.z + Math.cos(angle) * gap,
    };
    if (!navigationPointIsClear(world, goal)) continue;
    const route = planWalkingPath(world, start, goal, { maxNodes: 16000 });
    if (route.length)
      return {
        goal,
        route,
        angle: Math.atan2(object.x - goal.x, object.z - goal.z),
      };
  }
  return null;
}

/** Choose an open orbit direction at street level before settling for a tighter
 * camera. This keeps the avatar visible rather than staring into a façade.
 * @param {any} world @param {any} player
 */
export function exteriorPlayerCamera(world, player) {
  const target = {
    x: player.position.x,
    y: player.position.y + 1.15,
    z: player.position.z,
  };
  let best = null,
    score = -Infinity;
  for (let i = 0; i < 16; i++) {
    const angle =
      player.rotation.y +
      Math.PI +
      ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 8;
    const desired = {
      x: target.x + Math.sin(angle) * 11,
      y: player.position.y + 7.2,
      z: target.z + Math.cos(angle) * 11,
    };
    const safe = cameraCollisionPosition(world, target, desired);
    const reach = Math.hypot(
      safe.x - target.x,
      safe.y - target.y,
      safe.z - target.z,
    );
    if (reach - i * 0.005 > score) {
      best = safe;
      score = reach - i * 0.005;
    }
    if (!safe.blocked) return { target, camera: safe };
  }
  return {
    target,
    camera:
      score > 4
        ? best
        : { x: target.x + 0.1, y: target.y + 12, z: target.z + 0.1 },
  };
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
    peerActors = [],
    agents = [],
    vehicles = [],
    traffic = null,
    tramTraffic = null,
    navigation = null,
    walkRoute = [],
    sceneryTask = null,
    coarseDetailsActive = null,
    lastTime = 0,
    lastChunkUpdate = 0,
    loadInProgress = false,
    generation = 0,
    overviewMesh = null,
    overviewLoading = false,
    mode = "orbit",
    motion = !reduce,
    followPlayer = Boolean(options.thirdPerson),
    lastPlayerPosition = null;
  let pendingTeleport = true;
  const chunkGroups = new Map(),
    chunkCache = new Map(),
    roadPaths = [],
    overviewPaths = [],
    venueMeshes = [],
    personMeshes = [],
    peerMeshes = [],
    sceneryMeshes = [],
    coarseLayers = [],
    overviewMaterials = [],
    collisionActors = [],
    dynamicObstacles = [];
  const sceneryObjects = new Map();
  const followState = { initialized: false };
  const playerStep = {},
    cameraStep = {};
  const walkKeys = new Set();
  let selectedHotspotId = null;
  let pendingLocation = null;
  const badgeItems = [];
  let markerSelection = "",
    populationCentre = null,
    venueCentre = null;
  const city = new THREE.Group();
  scene.add(city);
  const population = new THREE.Group();
  scene.add(population);
  let peerPopulation = new THREE.Group();
  scene.add(peerPopulation);
  const peerRecords = new Map();
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
    shirt: options.appearance?.topColor || options.shirt,
    appearance: options.appearance,
    onZone: options.onInteriorZone,
    onActivity: options.onInteriorActivity,
    onPeer: options.onPeer,
    reducedMotion: reduce,
    night: exteriorLighting.night,
  });
  const locationFocus = createLocationFocus({
    scene,
    camera,
    controls,
    reducedMotion: reduce,
  });
  function clearLocationFocus() {
    if (pendingLocation) pendingLocation.resolve(false);
    pendingLocation = null;
    locationFocus.clear();
  }
  function interruptLocationFocus() {
    if (pendingLocation) {
      pendingLocation.resolve(false);
      pendingLocation = null;
      generation++;
    }
    locationFocus.interrupt();
  }
  controls.addEventListener("start", interruptLocationFocus);
  const chunkFocusTarget = () =>
    pendingLocation?.ticket === generation
      ? pendingLocation.point
      : controls.target;
  let travelPhase = null;
  const travel = createTravelRuntime({
    scene,
    camera,
    controls,
    projectGeo,
    geoY,
    reducedMotion: reduce,
    night: () => exteriorLighting.night,
    onPhase(event) {
      travelPhase = event.phase;
      // The last shot returns to the actual mapped destination from the
      // original transport tableau. Its local chunks started loading before
      // boarding, so the reveal keeps the real city geography.
      if (event.phase === "arriving") {
        city.visible = true;
        population.visible = true;
        peerPopulation.visible = true;
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
    cancelScenery();
    walkRoute = [];
    cancelTravel();
    setFocus(sequence.to);
    clearLocationFocus();
    city.visible = population.visible = peerPopulation.visible = false;
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
        setStreetLifeNight(child, exterior ? state.night : 0);
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
  function installCoarseOwnership(mesh, entries, kind) {
    const records = [];
    let start = 0;
    for (const { geometry, id } of entries) {
      const count = geometry.attributes.position.count;
      records.push({ id, start, count });
      start += count;
    }
    const indices = new Uint32Array(start);
    for (let i = 0; i < start; i++) indices[i] = i;
    mesh.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    mesh.userData.coarseOwnership = { records, kind };
    coarseLayers.push(mesh);
  }
  function refreshRoadPaths() {
    const canonical = new Map(overviewPaths.map((line) => [line.id, line]));
    for (const group of chunkGroups.values())
      for (const line of group.userData.roadPaths || [])
        canonical.set(line.id, line);
    roadPaths.length = 0;
    roadPaths.push(...canonical.values());
  }
  function refreshCoarseOwnership() {
    coarseDetailsActive = camera.position.distanceTo(controls.target) < 6000;
    const chunks = coarseDetailsActive
      ? [...chunkGroups.keys()].map((id) => chunkCache.get(id)).filter(Boolean)
      : [];
    const owners = detailedCityLayerIds(chunks);
    for (const mesh of coarseLayers) {
      const { records, kind } = mesh.userData.coarseOwnership;
      const attribute = mesh.geometry.index;
      let used = 0;
      for (const record of records) {
        if (owners[kind].has(record.id)) continue;
        for (let i = record.start; i < record.start + record.count; i++)
          attribute.array[used++] = i;
      }
      attribute.needsUpdate = true;
      mesh.geometry.setDrawRange(0, used);
    }
    const bounds = chunks.map((chunk) =>
      projectedCityBounds(chunk.bounds, projectGeo),
    );
    overviewMaterials.forEach((material) =>
      updateCityLayerBounds(material, bounds),
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
      buckets[s.kind]?.push({ geometry: g, id: s.id });
    }
    for (const [kind, gs] of Object.entries(buckets)) {
      if (!gs.length) continue;
      const merged = mergeGeometries(gs.map((entry) => entry.geometry));
      const mesh = new THREE.Mesh(
        merged,
        kind === "water"
          ? atmosphere.water
          : mat({ park: "#91b974", wood: "#6d9965", sand: "#e0d1ab" }[kind]),
      );
      mesh.receiveShadow = kind !== "water";
      if (parent === city) installCoarseOwnership(mesh, gs, "surfaces");
      gs.forEach((entry) => entry.geometry.dispose());
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
    const add = (material, vertices, id) => {
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
      buckets.get(material).push({ geometry, id });
    };
    const addGeometry = (material, geometry, id) => {
      if (!geometry.attributes.position?.count) {
        geometry.dispose();
        return;
      }
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push({ geometry, id });
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
      const rails = [],
        lanes = [];
      const detailed = owner !== "overview";
      const context = { projectGeo, unprojectGeo, geoY, terrain };
      for (const layer of cityRoadSurfaceLayers(road, detailed))
        addGeometry(
          layer.kind === "paving"
            ? atmosphere.paving
            : atmosphere.roadMaterial(road.kind),
          safeRoadRibbonGeometry(points, layer.width, context, {
            side: layer.side,
            lift: layer.lift,
          }),
          road.id,
        );
      let travelled = 0;
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1],
          b = ps[i],
          length = a.distanceTo(b);
        if (["tram", "rail"].includes(road.kind)) {
          ribbon(a, b, 0.12, -0.7, 0.265, rails);
          ribbon(a, b, 0.12, 0.7, 0.265, rails);
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
              0.26,
              lanes,
            );
          }
        }
        travelled += length;
      }
      add(atmosphere.steel, rails, road.id);
      add(atmosphere.lane, lanes, road.id);
      const line = path(points);
      if (line.length > 1) {
        const record = {
          ...line,
          ...road,
          ps: line.ps,
          lengths: line.lengths,
          length: line.length,
          kind: road.kind,
          width: road.width,
          id: road.id,
          owner,
          foot: road.foot,
          sidewalk: road.sidewalk,
          bridge: road.bridge,
        };
        if (owner === "overview") overviewPaths.push(record);
        else {
          parent.userData.roadPaths ??= [];
          parent.userData.roadPaths.push(record);
        }
      }
    }
    for (const [material, entries] of buckets) {
      const merged = mergeGeometries(entries.map((entry) => entry.geometry));
      const mesh = new THREE.Mesh(merged, material);
      if (owner === "overview") installCoarseOwnership(mesh, entries, "roads");
      entries.forEach((entry) => entry.geometry.dispose());
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    if (owner === "overview") refreshRoadPaths();
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
    if (!pendingLocation && camera.position.distanceTo(controls.target) > 5000)
      return;
    loadInProgress = true;
    const ticket = generation;
    let changed = false;
    try {
      const centre = chunkFocusTarget();
      const p = unprojectGeo(centre.x, centre.z);
      const range = pendingLocation
        ? 90
        : camera.position.distanceTo(controls.target);
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
        if (changed || !venueCentre || venueCentre.distanceTo(centre) > 120) {
          for (const [id, group] of chunkGroups) {
            const data = chunkCache.get(id);
            if (!data) continue;
            for (const child of [...group.children])
              if (
                child.userData.venueDetail ||
                child.userData.landscapeDetail ||
                child.userData.architectureDetail
              )
                disposeGroup(child);
            addNearBuildingDetails(data, group);
            addStreetDetails(data, group);
          }
          venueCentre = centre.clone();
        }
        refreshRoadPaths();
        refreshCoarseOwnership();
        refreshSceneryAndNavigation();
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
          populationCentre.distanceTo(centre) > 70
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
        people:
          agents.length +
          [...chunkGroups.values()].reduce(
            (total, group) =>
              total +
              group.children.reduce(
                (count, child) =>
                  count + (child.userData.beachLife?.people || 0),
                0,
              ),
            0,
          ),
      });
    } catch (e) {
      if (!destroyed)
        status(
          "Some building data could not load. Roads and landmarks remain available.",
        );
    } finally {
      loadInProgress = false;
      if (!destroyed && ticket !== generation) loadChunks();
      else if (!destroyed && pendingLocation?.ticket === ticket)
        finishLocationFocus(ticket);
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
    for (const building of uniqueCityBuildingFootprints(chunk.buildings)) {
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
    addStreetDetails(chunk, group);
    group.add(createLandmarks(chunk, { projectGeo, geoY }));
    city.add(group);
    chunkGroups.set(chunk.id, group);
  }
  function addStreetDetails(chunk, group) {
    const centre = chunkFocusTarget();
    const focusPoint = unprojectGeo(centre.x, centre.z);
    const storefronts = createVenueDecorations(
      chunk,
      (options.hotspots || []).filter((h) => h.mapVenue),
      { projectGeo, geoY, focusPoint, enableBeachFurniture: false },
    );
    storefronts.userData.streetDetail = storefronts.userData.venueDetail = true;
    const life = createStreetLife(chunk, storefronts, { projectGeo, geoY });
    life.userData.streetDetail = life.userData.venueDetail = true;
    setStreetLifeNight(life, exteriorLighting.night);
    const beach = createBeachLife(chunk, {
      projectGeo,
      geoY,
      focusPoint,
      waterAt: (point) =>
        Boolean(coastline?.waterAt(unprojectGeo(point.x, point.z))),
      maxPeople: host.clientWidth < 640 ? 24 : 32,
      maxArrangements: 40,
      radius: 160,
    });
    beach.userData.streetDetail = beach.userData.venueDetail = true;
    const reservations = [
      ...life.userData.streetLife.reservations,
      ...(beach.userData.beachLife?.reservations || []),
    ];
    const dressing = createLandscape(chunk, {
      projectGeo,
      geoY,
      focusPoint,
      venueReservations: reservations,
    });
    setLandscapeNight(dressing, exteriorLighting.night);
    dressing.userData.streetDetail = dressing.userData.landscapeDetail = true;
    const fixtures = createCityFixtures(chunk, {
      projectGeo,
      unprojectGeo,
      geoY,
      terrain,
      focusPoint,
      waterAt: (point) =>
        Boolean(coastline?.waterAt(unprojectGeo(point.x, point.z))),
      reservations: [
        ...reservations,
        ...(dressing.userData.sceneryItems || []),
      ],
      maxObjects: host.clientWidth < 640 ? 16 : 24,
      maxJunctions: host.clientWidth < 640 ? 4 : 6,
    });
    fixtures.userData.streetDetail = fixtures.userData.landscapeDetail = true;
    group.add(storefronts, life, beach, dressing, fixtures);
  }
  function addNearBuildingDetails(chunk, group) {
    // Ornament follows the camera, including within an already loaded chunk.
    // Keep it bounded independently of the full geographic building mesh.
    const centreOfView = chunkFocusTarget();
    const nearest = uniqueCityBuildingFootprints(chunk.buildings)
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
          distance: (p.x - centreOfView.x) ** 2 + (p.z - centreOfView.z) ** 2,
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
  function refreshSceneryAndNavigation() {
    sceneryObjects.clear();
    sceneryMeshes.length = 0;
    const reservations = [],
      trees = [];
    for (const group of chunkGroups.values()) {
      for (const child of group.children) {
        reservations.push(
          ...(child.userData.streetLife?.reservations || []),
          ...(child.userData.beachLife?.reservations || []),
        );
        for (const object of child.userData.sceneryItems || []) {
          sceneryObjects.set(object.id, object);
          if (object.radius > 0)
            (object.kind === "tree" ? trees : reservations).push(object);
        }
      }
      group.traverse((mesh) => {
        if (
          mesh.isMesh &&
          (mesh.userData.scenery ||
            mesh.userData.sceneryInstances ||
            mesh.userData.sceneryFaceRanges)
        )
          sceneryMeshes.push(mesh);
      });
    }
    navigation = createNavigationWorld({
      target: player?.position || chunkFocusTarget(),
      radius: 420,
      buildings: uniqueCityBuildingFootprints(
        [...chunkCache.values()].flatMap((chunk) => chunk.buildings || []),
      ),
      projectGeo,
      paths: roadPaths,
      reservations,
      trees,
      waterAt: (point, line) =>
        !line?.bridge &&
        Boolean(coastline?.waterAt(unprojectGeo(point.x, point.z))),
      elevationAt: (point) => geoY(unprojectGeo(point.x, point.z)),
    });
    if (sceneryTask) {
      const object = sceneryObjects.get(sceneryTask.object.id);
      if (!object) cancelScenery();
      else sceneryTask.object = object;
    }
  }
  function rebuildTrafficFixtures() {
    for (const [id, group] of chunkGroups) {
      const chunk = chunkCache.get(id);
      if (!chunk) continue;
      for (const child of [...group.children])
        if (child.userData.fixtures) disposeGroup(child);
      const reserved = group.children.flatMap((child) => [
        ...(child.userData.streetLife?.reservations || []),
        ...(child.userData.beachLife?.reservations || []),
        ...(child.userData.sceneryItems || []),
      ]);
      const fixtures = createCityFixtures(chunk, {
        projectGeo,
        unprojectGeo,
        geoY,
        terrain,
        focusPoint: unprojectGeo(populationCentre.x, populationCentre.z),
        waterAt: (point) =>
          Boolean(coastline?.waterAt(unprojectGeo(point.x, point.z))),
        reservations: reserved,
        junctions: traffic?.junctions || [],
        maxObjects: host.clientWidth < 640 ? 16 : 24,
        maxJunctions: host.clientWidth < 640 ? 4 : 6,
      });
      fixtures.userData.streetDetail = fixtures.userData.landscapeDetail = true;
      group.add(fixtures);
    }
    refreshSceneryAndNavigation();
  }
  function refreshCollisionActors() {
    collisionActors.length = dynamicObstacles.length = 0;
    const add = (actor, id, radius, offset = 0) => {
      const obstacle = { id, x: 0, y: 0, z: 0, radius };
      collisionActors.push({ actor, obstacle, offset, radius });
      dynamicObstacles.push(obstacle);
    };
    for (const actor of agents) add(actor.group, actor.id, 0.36);
    peerActors.forEach((actor, index) =>
      add(actor, `peer:${actor.userData.peerId || index}`, 0.42),
    );
    for (const actor of vehicles) {
      const radius = actor.vehicleWidth / 2 + 0.12;
      const span = Math.max(0, actor.vehicleLength / 2 - radius);
      add(actor.group, actor.id, radius, 0);
      add(actor.group, actor.id, radius, span);
      add(actor.group, actor.id, radius, -span);
    }
    for (const group of chunkGroups.values())
      for (const child of group.children)
        for (const actor of child.userData.beachLife?.actors || [])
          add(
            actor.character || {
              position: actor,
              rotation: { y: 0 },
              visible: true,
            },
            `beach:${actor.id || actor.x + ":" + actor.z}`,
            0.38,
          );
    updateCollisionActors();
  }
  function updateCollisionActors() {
    dynamicObstacles.length = 0;
    for (const { actor, obstacle, offset, radius } of collisionActors) {
      const position = actor.position;
      obstacle.x = position.x + Math.sin(actor.rotation.y) * offset;
      obstacle.y = position.y;
      obstacle.z = position.z + Math.cos(actor.rotation.y) * offset;
      obstacle.radius = actor.visible === false ? 0 : radius;
      if (obstacle.radius > 0) dynamicObstacles.push(obstacle);
    }
  }
  function resetPlayerPose() {
    const rig = player?.userData.rig;
    if (!rig) return;
    rig.hips.position.y = player.userData.restHipY;
    rig.hips.rotation.z = 0;
    for (const name of [
      "leftLeg",
      "rightLeg",
      "leftKnee",
      "rightKnee",
      "leftArm",
      "rightArm",
      "leftElbow",
      "rightElbow",
      "torso",
      "head",
    ])
      rig[name].rotation.set(0, 0, 0);
  }
  function cancelScenery() {
    if (!sceneryTask) return;
    const task = sceneryTask;
    sceneryTask = null;
    walkRoute = [];
    if (player) {
      if (task.mounted)
        player.position.set(
          task.goal.x,
          geoY(unprojectGeo(task.goal.x, task.goal.z)) + 0.2,
          task.goal.z,
        );
      playerTarget = player.position.clone();
      resetPlayerPose();
    }
    task.resolve(false);
  }
  function startWalking(goal) {
    if (!player || !navigation) return false;
    const safe = findSafeWalkingPoint(navigation, goal, { searchRadius: 5 });
    if (!safe) return false;
    const route = planWalkingPath(navigation, player.position, safe, {
      maxNodes: 18000,
    });
    if (!route.length) return false;
    walkRoute = route;
    playerTarget = new THREE.Vector3(
      safe.x,
      geoY(unprojectGeo(safe.x, safe.z)) + 0.2,
      safe.z,
    );
    followPlayer = true;
    followState.initialized = false;
    controls.minDistance = 1.6;
    if (camera.position.distanceTo(controls.target) > 90) framePlayer();
    return true;
  }
  /** @returns {any[]} */
  function nearbyScenery() {
    if (!player || indoor.active || travel.active || characterGallery)
      return [];
    return [...sceneryObjects.values()]
      .filter(
        (object) =>
          Math.hypot(
            object.x - player.position.x,
            object.z - player.position.z,
          ) < 80,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - player.position.x, a.z - player.position.z) -
          Math.hypot(b.x - player.position.x, b.z - player.position.z),
      )
      .slice(0, 24);
  }
  /** @returns {Promise<boolean>} */
  function performScenery(object, action) {
    cancelScenery();
    const canonical = sceneryObjects.get(object?.id);
    if (
      destroyed ||
      !player ||
      indoor.active ||
      travel.active ||
      characterGallery ||
      !canonical ||
      !sceneryActions(canonical).some((item) => item.id === action)
    )
      return Promise.resolve(false);
    const approach = planSceneryApproach(
      navigation,
      player.position,
      canonical,
    );
    if (!approach) return Promise.resolve(false);
    clearLocationFocus();
    followPlayer = true;
    followState.initialized = false;
    controls.minDistance = 1.6;
    if (camera.position.distanceTo(controls.target) > 90) framePlayer();
    walkRoute = approach.route;
    playerTarget = new THREE.Vector3(
      approach.goal.x,
      geoY(unprojectGeo(approach.goal.x, approach.goal.z)) + 0.2,
      approach.goal.z,
    );
    return new Promise((resolve) => {
      sceneryTask = {
        object: canonical,
        action,
        goal: approach.goal,
        angle: approach.angle,
        phase: "walking",
        elapsed: 0,
        activeTime: 0,
        resolve,
        mounted: false,
      };
    });
  }
  function updateSceneryTask(dt, time) {
    const task = sceneryTask;
    if (!task || !player) return;
    task.elapsed += dt;
    if (task.elapsed > 60) {
      cancelScenery();
      return;
    }
    if (task.phase === "walking") {
      if (
        walkRoute.length ||
        Math.hypot(
          player.position.x - task.goal.x,
          player.position.z - task.goal.z,
        ) > 0.25
      )
        return;
      task.phase = "active";
      player.rotation.y = task.angle;
    }
    task.activeTime += dt;
    if (task.action === "sit" && task.object.kind === "bench") {
      const alpha = reduce ? 1 : Math.min(1, task.activeTime / 0.35);
      player.position.x = task.goal.x + (task.object.x - task.goal.x) * alpha;
      player.position.z = task.goal.z + (task.object.z - task.goal.z) * alpha;
      player.rotation.y = task.object.angle || 0;
      task.mounted = true;
    }
    const rig = player.userData.rig;
    if (motion && !reduce && rig) {
      if (task.action === "sit") {
        rig.hips.position.y = player.userData.restHipY - 0.35;
        rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -1.42;
        rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = 1.42;
        rig.leftArm.rotation.x = rig.rightArm.rotation.x = -0.3;
        rig.leftElbow.rotation.x = rig.rightElbow.rotation.x = -0.8;
      } else if (["climb", "pick-fruit"].includes(task.action)) {
        rig.leftArm.rotation.x = -2.3;
        rig.rightArm.rotation.x = -1.85;
        rig.leftElbow.rotation.x = -0.25;
      } else if (task.action === "drink") {
        rig.rightArm.rotation.x = -0.75;
        rig.rightElbow.rotation.x = -1.8;
        rig.head.rotation.x = 0.12;
      } else if (["recycle", "pick-flower"].includes(task.action)) {
        rig.torso.rotation.x = 0.38;
        rig.rightArm.rotation.x = -0.6;
        rig.rightElbow.rotation.x = -0.55;
      } else if (task.action === "cross-safely")
        rig.head.rotation.y = Math.sin(task.activeTime * 3) * 0.55;
      else {
        rig.rightArm.rotation.x = -0.4;
        rig.rightElbow.rotation.x = -0.9;
        rig.head.rotation.y = Math.sin(time) * 0.13;
      }
    }
    if (task.activeTime < (reduce ? 0.5 : 1.8)) return;
    if (task.mounted)
      player.position.set(
        task.goal.x,
        geoY(unprojectGeo(task.goal.x, task.goal.z)) + 0.2,
        task.goal.z,
      );
    resetPlayerPose();
    playerTarget = player.position.clone();
    sceneryTask = null;
    task.resolve(true);
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
  function setPeers(peers, frameSelected = false) {
    options.peers = Array.isArray(peers) ? peers : [];
    // Presence polling records the latest roster during a journey, leaving its
    // camera and existing peer resources untouched until the city is restored.
    if (destroyed || travel.active) return;
    indoor.setPeers(options.peers);
    peerPopulation.visible =
      !characterGallery &&
      !indoor.active &&
      camera.position.distanceTo(controls.target) < 900;
    if (!manifest || indoor.active || characterGallery) {
      if (peerRecords.size) {
        disposeGroup(peerPopulation);
        peerPopulation = new THREE.Group();
        scene.add(peerPopulation);
        peerRecords.clear();
        peerMeshes.length = 0;
        peerActors = [];
      }
      peerPopulation.visible = false;
      refreshCollisionActors();
      return;
    }
    const shirts = ["#bd7557", "#4f7370", "#77748c", "#c19a4b", "#52735b"];
    const skins = ["#a87955", "#76513b", "#d5af8b", "#5b3d30"];
    // Bound draw calls on small devices. Select nearby people, keeping the
    // focused player visible even in a crowded neighbourhood.
    const budget = Number.isInteger(options.peerDetailLimit)
      ? Math.max(1, Math.min(40, options.peerDetailLimit))
      : typeof matchMedia === "function" &&
          matchMedia("(max-width: 720px)").matches
        ? 12
        : 24;
    const visiblePeers = options.peers
      .filter(
        (peer) =>
          peer &&
          !peer.placeId &&
          typeof peer.id === "string" &&
          Number.isFinite(peer.longitude) &&
          Number.isFinite(peer.latitude) &&
          containsGeo(manifest.bounds, [peer.longitude, peer.latitude]) &&
          typeof peer.handle === "string" &&
          peer.handle,
      )
      .sort((a, b) => {
        if (a.id === focus?.peerId) return -1;
        if (b.id === focus?.peerId) return 1;
        const da = point3([a.longitude, a.latitude]).distanceToSquared(
          controls.target,
        );
        const db = point3([b.longitude, b.latitude]).distanceToSquared(
          controls.target,
        );
        return da - db || a.id.localeCompare(b.id);
      })
      .slice(0, budget);
    const keep = new Set(visiblePeers.map((peer) => peer.id));
    for (const [id, record] of peerRecords) {
      if (keep.has(id)) continue;
      disposeGroup(record.character);
      peerRecords.delete(id);
    }
    peerMeshes.length = 0;
    peerActors = [];
    visiblePeers.forEach((peer, index) => {
      const seed = [...peer.handle].reduce(
        (total, character) => total + character.charCodeAt(0),
        0,
      );
      const appearance = {
        bodyType: peer.appearance?.bodyType,
        shirt: peer.appearance?.topColor || shirts[seed % shirts.length],
        trousers: peer.appearance?.bottomColor,
        hair: peer.appearance?.hairColor,
        skin: peer.appearance?.skinTone || skins[seed % skins.length],
        shoes: peer.appearance?.shoeColor,
        style:
          peer.appearance?.outfitStyle ||
          (peer.userType === "local" ? "casual" : "tourist"),
        hairStyle:
          peer.appearance?.hairStyle ||
          ["short", "curly", "bob", "bun"][seed % 4],
      };
      const signature = JSON.stringify([peer.handle, appearance]);
      let record = peerRecords.get(peer.id);
      if (record && record.signature !== signature) {
        disposeGroup(record.character);
        peerRecords.delete(peer.id);
        record = null;
      }
      if (!record) {
        const character = createCharacter(appearance);
        const label = canvasLabel(`@${peer.handle}`, "#446b5a");
        label.position.y = 2.75;
        label.scale.set(1.45, 0.32, 1);
        character.add(label);
        peerPopulation.add(character);
        record = { character, signature };
        peerRecords.set(peer.id, record);
      }
      const character = record.character;
      character.userData.peerId = peer.id;
      const target = point3([peer.longitude, peer.latitude]);
      const nearest = nearestPath(target, true);
      const proposed = nearest
        ? sample(
            nearest.line,
            nearest.d + 2.5 + index * 1.7,
            ["footway", "pedestrian", "path", "steps"].includes(
              nearest.line.kind,
            )
              ? 0
              : nearest.line.width / 2 + 0.75,
          ).v
        : target;
      const safe = navigation
        ? clearCityPlayerSpawn(
            navigation,
            proposed,
            dynamicObstacles.filter(
              (obstacle) => obstacle.id !== `peer:${peer.id}`,
            ),
          )
        : proposed;
      character.visible = Boolean(safe);
      if (safe) character.position.set(safe.x, target.y, safe.z);
      character.position.y =
        geoY(unprojectGeo(character.position.x, character.position.z)) + 0.2;
      character.rotation.y = ((seed % 8) * Math.PI) / 4;
      character.traverse((mesh) => {
        if (!mesh.isMesh && !mesh.isSprite) return;
        mesh.userData.peer = peer;
        peerMeshes.push(mesh);
      });
      peerActors.push(character);
      if (frameSelected && focus?.peerId === peer.id) {
        controls.target
          .copy(character.position)
          .add(new THREE.Vector3(0, 1, 0));
        const distance = focus.range || 18;
        camera.position
          .copy(character.position)
          .add(new THREE.Vector3(distance * 0.35, distance * 0.42, distance));
        controls.update();
      }
    });
    refreshCollisionActors();
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
  function populate(teleport = false) {
    const savedPlayer = player,
      savedTarget = playerTarget?.clone();
    if (teleport) {
      cancelScenery();
      walkRoute = [];
      player = null;
    }
    if (savedPlayer) savedPlayer.removeFromParent();
    disposeGroup(population);
    scene.add(population);
    agents = [];
    vehicles = [];
    const target = teleport
      ? point3([focus.lng, focus.lat])
      : chunkFocusTarget().clone();
    populationCentre = target.clone();
    const elapsed = traffic?.elapsed || 0;
    traffic = createTrafficSimulation(roadPaths, target, {
      max: host.clientWidth < 640 ? 18 : 26,
      radius: 220,
    });
    tramTraffic = createTrafficSimulation(roadPaths, target, {
      max: 3,
      radius: 270,
      tracksOnly: true,
    });
    traffic.elapsed = tramTraffic.elapsed = elapsed;
    rebuildTrafficFixtures();
    personMeshes.length = 0;
    const profiles = createLocalWalkerProfiles({
      paths: roadPaths,
      target,
      buildings: [...chunkCache.values()].flatMap(
        (chunk) => chunk.buildings || [],
      ),
      projectGeo,
      surfaces: [
        ...(manifest?.surfaces || []),
        ...[...chunkCache.values()].flatMap((chunk) => chunk.surfaces || []),
      ],
      reservations: [
        ...(!teleport && savedPlayer
          ? [
              {
                x: savedPlayer.position.x,
                z: savedPlayer.position.z,
                radius: 1.2,
              },
            ]
          : []),
        ...[...chunkGroups.values()].flatMap((chunk) =>
          chunk.children.flatMap((child) => [
            ...(child.userData.streetLife?.reservations || []),
            ...(child.userData.beachLife?.reservations || []),
            ...(child.userData.landscape?.parkDetails?.benches || []).map(
              (point) => ({ ...point, radius: 1.25 }),
            ),
            ...(child.userData.landscape?.parkDetails?.flowerBeds || []).map(
              (point) => ({ ...point, radius: 1.05 }),
            ),
            ...(child.userData.sceneryItems || []).filter(
              (object) => object.radius > 0,
            ),
          ]),
        ),
      ],
      waterAt: (point, line) =>
        !line.bridge &&
        Boolean(coastline?.waterAt(unprojectGeo(point.x, point.z))),
      max: host.clientWidth < 640 ? 48 : 64,
      maxDistance: 125,
      context: focus?.category,
    });
    for (const profile of profiles) {
      const group = createCharacter(profile.character);
      applyLocalDemographicVisuals(group, profile);
      poseLocalDemographic(group, profile, 0);
      createScenicNpcLod(group);
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
      agents.push({ ...profile, group, samplePoint: {} });
    }
    for (const [index, actor] of [
      ...traffic.vehicles,
      ...tramTraffic.vehicles,
    ].entries()) {
      actor.group = createCityVehicle({
        kind: actor.kind,
        color: [
          "#e9e7d9",
          "#e4bd5b",
          "#729f9c",
          "#b85f50",
          "#486379",
          "#e4ebec",
        ][index % 6],
        operator: "carris",
      });
      const initial = sampleTrafficVehicle(actor, actor.sample);
      actor.group.position.set(initial.x, initial.y + 0.2, initial.z);
      actor.group.rotation.y = initial.angle;
      population.add(actor.group);
      vehicles.push(actor);
    }
    for (const chunk of chunkGroups.values())
      for (const child of chunk.children)
        if (child.userData.beachLife)
          child.traverse((mesh) => {
            if (mesh.isMesh && mesh.userData.person) personMeshes.push(mesh);
          });
    if (savedPlayer && !teleport) {
      player = savedPlayer;
      population.add(player);
      playerTarget = savedTarget || player.position.clone();
      refreshCollisionActors();
      return;
    }
    if (savedPlayer) disposeGroup(savedPlayer);
    player = null;
    player = createCharacter({
      bodyType: options.appearance?.bodyType,
      shirt: options.appearance?.topColor || options.shirt || "#ece7df",
      trousers: options.appearance?.bottomColor,
      hair: options.appearance?.hairColor,
      skin: options.appearance?.skinTone || "#a87955",
      shoes: options.appearance?.shoeColor,
      style: options.appearance?.outfitStyle || "tourist",
      hairStyle: options.appearance?.hairStyle || "short",
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
    const startingRoad = nearest
      ? sample(nearest.line, nearest.d, nearest.line.width / 2 + 0.5)
      : null;
    refreshCollisionActors();
    const spawn = clearCityPlayerSpawn(
      navigation,
      safe || startingRoad?.v || target,
      dynamicObstacles,
    );
    if (!spawn) {
      disposeGroup(player);
      player = null;
      playerTarget = null;
      refreshCollisionActors();
      return;
    }
    player.position.set(
      spawn.x,
      geoY(unprojectGeo(spawn.x, spawn.z)) + 0.2,
      spawn.z,
    );
    player.rotation.y = safe?.angle ?? startingRoad?.angle ?? 0;
    population.add(player);
    playerTarget = player.position.clone();
    const you = canvasLabel("YOU", "#292942");
    you.position.y = 2.6;
    you.scale.set(1.2, 0.27, 1);
    player.add(you);
    setPeers(options.peers || [], teleport);
    refreshCollisionActors();
    if (followPlayer) framePlayer();
  }
  function framePlayer() {
    if (!player || travel.active || indoor.active) return false;
    const framed = exteriorPlayerCamera(navigation, player);
    controls.minDistance = 1.6;
    controls.target.set(framed.target.x, framed.target.y, framed.target.z);
    camera.position.set(framed.camera.x, framed.camera.y, framed.camera.z);
    controls.update();
    followState.initialized = false;
    lastPlayerPosition = player.position.clone();
    return true;
  }
  function playerView() {
    clearLocationFocus();
    followPlayer = true;
    restoreCity();
    if (characterGallery) {
      disposeGroup(characterGallery);
      characterGallery = null;
    }
    return framePlayer();
  }
  function setAppearance(next) {
    if (destroyed || !next) return;
    cancelScenery();
    options.appearance = { ...next };
    options.shirt = next.topColor;
    if (player) player = replaceCharacterAppearance(player, next);
    indoor.setAppearance(next);
  }
  function restoreCity() {
    indoor.clear();
    city.visible = true;
    population.visible = true;
    peerPopulation.visible = true;
    scene.background = new THREE.Color(exteriorLighting.horizon);
    atmosphere.sky.visible = true;
    setPeers(options.peers || []);
  }
  function setFocus(next, street = false) {
    if (destroyed || !next || ![next.lng, next.lat].every(Number.isFinite))
      return Promise.resolve(false);
    cancelScenery();
    walkRoute = [];
    walkKeys.clear();
    followState.initialized = false;
    clearLocationFocus();
    cancelTravel();
    restoreCity();
    if (characterGallery) {
      disposeGroup(characterGallery);
      characterGallery = null;
    }
    generation++;
    focus = next;
    selectedHotspotId = next.id || null;
    const locationSelection =
      !street && !next.peerId && Boolean(next.id && next.selectionId);
    pendingVenue =
      !locationSelection && !street && next.mapVenue ? next.id : null;
    const p = point3([next.lng, next.lat]);
    const distance = street ? 24 : next.range || 160;
    controls.minDistance = street ? 1.6 : 8;
    // Geography can finish loading after Walk was selected. Keep that explicit
    // mode so populate() frames its new avatar when the initial chunks arrive.
    // Location and peer selections still own their deliberate camera shots.
    if (!street) followPlayer = mode === "walk" && !next.peerId;
    if (!street) pendingTeleport = true;
    if (street && player && !pendingTeleport) p.copy(player.position);
    if (locationSelection) {
      followPlayer = false;
      lastPlayerPosition = null;
      const promise = new Promise((resolve) => {
        pendingLocation = {
          ticket: generation,
          point: p,
          next,
          resolve,
          started: false,
        };
      });
      refreshMarkers();
      if (manifest) loadChunks();
      return promise;
    }
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
    setPeers(options.peers || [], !street);
    return Promise.resolve(manifest ? loadChunks() : undefined).then(
      () => !destroyed,
    );
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
      mesh.traverse((part) => {
        if (!part.isMesh) return;
        const original = part.material;
        const owned = createCityLayerMaterial(original, {
          wholeInstance: true,
        });
        overviewMaterials.push(owned);
        sharedMaterials.add(owned);
        part.material = owned;
        original.dispose();
      });
      scene.add(mesh);
      overviewMesh = mesh;
      refreshCoarseOwnership();
    } catch {
    } finally {
      overviewLoading = false;
    }
  }
  function overview() {
    cancelScenery();
    walkRoute = [];
    walkKeys.clear();
    controls.minDistance = 8;
    clearLocationFocus();
    followPlayer = false;
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
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive Lisbon city. In walk mode use arrow keys or WASD to move.",
  );
  function pointerDown(e) {
    renderer.domElement.focus({ preventScroll: true });
    down = { x: e.clientX, y: e.clientY };
  }
  function keyDown(e) {
    if (mode !== "walk" || indoor.active || travel.active || characterGallery)
      return;
    const key = e.key.toLowerCase();
    if (
      ![
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    )
      return;
    e.preventDefault();
    if (!walkKeys.size) {
      cancelScenery();
      walkRoute = [];
      clearLocationFocus();
      followPlayer = true;
    }
    walkKeys.add(key);
  }
  function keyUp(e) {
    walkKeys.delete(e.key.toLowerCase());
  }
  function clearWalkKeys() {
    walkKeys.clear();
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
    const hits = ray.intersectObjects(
      [...venueMeshes, ...peerMeshes, ...personMeshes, ...sceneryMeshes].filter(
        visible,
      ),
      false,
    );
    const interactive = hits.find(
      (hit) =>
        hit.object.userData.hotspot ||
        hit.object.userData.peer ||
        hit.object.userData.person ||
        sceneryFromIntersection(hit),
    );
    if (interactive) {
      const obstruction = ray.intersectObjects(
        city.children.filter(visible),
        true,
      )[0];
      // Picking through a building does not reveal furniture on the other side.
      if (!obstruction || obstruction.distance >= interactive.distance - 0.12) {
        if (interactive.object.userData.hotspot)
          selectHotspot(interactive.object.userData.hotspot);
        else if (interactive.object.userData.peer)
          options.onPeer?.(interactive.object.userData.peer);
        else if (interactive.object.userData.person)
          options.onPerson?.(interactive.object.userData.person);
        else {
          const object = sceneryFromIntersection(interactive);
          if (object)
            options.onScenery?.(sceneryObjects.get(object.id) || object);
        }
        return;
      }
    }
    if (player && mode === "walk") {
      const ground = ray
        .intersectObjects(city.children, false)
        .find((hit) => hit.object.userData.ground);
      if (
        ground &&
        containsGeo(
          manifest.bounds,
          unprojectGeo(ground.point.x, ground.point.z),
        ) &&
        player.position.distanceTo(ground.point) < 300
      ) {
        cancelScenery();
        if (startWalking(ground.point)) clearLocationFocus();
      }
    }
  }
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("keydown", keyDown);
  renderer.domElement.addEventListener("blur", clearWalkKeys);
  window.addEventListener("keyup", keyUp);
  function animate(now) {
    if (destroyed) return;
    const dt = Math.min((now - lastTime) / 1000 || 0, 0.05);
    lastTime = now;
    if (!travel.active) controls.update();
    travel.update(dt);
    indoor.update(dt, motion);
    locationFocus.update(
      dt,
      player,
      motion,
      !characterGallery && !indoor.active && !travel.active,
    );
    // Detailed gait is useful close up. Farther visitors keep their mapped
    // route movement through one baked mesh, without submitting every joint.
    if (!characterGallery && !indoor.active && !travel.active)
      for (const actor of agents)
        actor.articulated = updateScenicNpcLod(actor.group, camera);
    if (
      motion &&
      !characterGallery &&
      !indoor.active &&
      !travel.active &&
      camera.position.distanceTo(controls.target) < 900
    ) {
      // A companion group waits together if any member approaches the player.
      // Its existing destination-led route resumes afterwards; no reversal or
      // per-frame pathfinder is needed to yield on a pavement.
      const yieldGroups = new Set();
      for (const actor of agents) {
        const position = actor.group.position;
        const dx = Math.sin(actor.group.rotation.y),
          dz = Math.cos(actor.group.rotation.y);
        const ahead = (point) => {
          const x = point.x - position.x,
            z = point.z - position.z;
          return x * dx + z * dz > -0.15 && Math.hypot(x, z) < 0.92 + dt * 1.4;
        };
        actor.yielding =
          Boolean(player && ahead(player.position)) ||
          peerActors.some((peer) => peer.visible && ahead(peer.position));
        if (actor.yielding && actor.groupId) yieldGroups.add(actor.groupId);
      }
      for (const a of agents) {
        const yielding = a.yielding || yieldGroups.has(a.groupId);
        if (!yielding) advanceLocalWalker(a, dt);
        const p = sampleLocalWalker(a, a.samplePoint);
        a.group.position.set(p.x, geoY(unprojectGeo(p.x, p.z)) + 0.2, p.z);
        a.group.rotation.y = p.angle;
        if (a.articulated) {
          animateCharacter(
            a.group,
            (now / 1000) * (a.pace || 1),
            !yielding && a.moving !== false,
          );
          poseLocalDemographic(a.group, a, now / 1000);
        }
      }
      const pedestrians = dynamicObstacles.filter(
        (obstacle) =>
          !String(obstacle.id).startsWith("street-vehicle") &&
          !String(obstacle.id).startsWith("tram"),
      );
      if (player)
        pedestrians.push({
          x: player.position.x,
          y: player.position.y,
          z: player.position.z,
          radius: 0.42,
        });
      advanceTraffic(traffic, dt, {
        pedestrians,
        externalVehicles: tramTraffic?.vehicles || [],
      });
      advanceTraffic(tramTraffic, dt, {
        pedestrians,
        externalVehicles: traffic?.vehicles || [],
      });
      for (const actor of vehicles) {
        const p = sampleTrafficVehicle(actor, actor.sample);
        actor.group.visible = p.visible;
        actor.group.position.set(p.x, p.y + 0.2, p.z);
        actor.group.rotation.y = p.angle;
      }
    }
    updateCollisionActors();
    if (player && !characterGallery && !indoor.active && !travel.active) {
      let dx = 0,
        dz = 0;
      if (walkKeys.size) {
        const forward =
          Number(walkKeys.has("w") || walkKeys.has("arrowup")) -
          Number(walkKeys.has("s") || walkKeys.has("arrowdown"));
        const side =
          Number(walkKeys.has("d") || walkKeys.has("arrowright")) -
          Number(walkKeys.has("a") || walkKeys.has("arrowleft"));
        const angle = Math.atan2(
          controls.target.x - camera.position.x,
          controls.target.z - camera.position.z,
        );
        dx = Math.sin(angle) * forward - Math.cos(angle) * side;
        dz = Math.cos(angle) * forward + Math.sin(angle) * side;
      } else if (walkRoute.length && sceneryTask?.phase !== "active") {
        let next = walkRoute[0];
        while (
          next &&
          Math.hypot(next.x - player.position.x, next.z - player.position.z) <
            0.12
        ) {
          walkRoute.shift();
          next = walkRoute[0];
        }
        if (next) {
          dx = next.x - player.position.x;
          dz = next.z - player.position.z;
        }
      }
      const distance = Math.hypot(dx, dz);
      if (distance > 0.001 && navigation) {
        const step = Math.min(distance, dt * 2.5);
        const next = moveWithCollisions(
          navigation,
          player.position,
          { x: (dx / distance) * step, z: (dz / distance) * step },
          { dynamic: dynamicObstacles, output: playerStep },
        );
        player.position.set(
          next.x,
          geoY(unprojectGeo(next.x, next.z)) + 0.2,
          next.z,
        );
        if (next.moved) player.rotation.y = Math.atan2(dx, dz);
      } else playerStep.moved = false;
      if (walkKeys.size) playerTarget.copy(player.position);
      animateCharacter(player, now / 1000, motion && playerStep.moved);
      updateSceneryTask(dt, now / 1000);
      if (followPlayer)
        updateFollowCamera(
          followState,
          camera.position,
          controls.target,
          player.position,
          dt,
        );
      if (
        navigation &&
        camera.position.distanceTo(controls.target) < 100 &&
        !locationFocus.active
      ) {
        const safe = cameraCollisionPosition(
          navigation,
          controls.target,
          camera.position,
          { output: cameraStep },
        );
        if (
          followPlayer &&
          safe.blocked &&
          Math.hypot(
            safe.x - controls.target.x,
            safe.y - controls.target.y,
            safe.z - controls.target.z,
          ) < 3.5
        ) {
          // Recover a clear third-person angle when a facade clips the shot,
          // instead of feeding a collapsed orbit back into damping each frame.
          framePlayer();
        } else {
          safe.y = Math.max(safe.y, geoY(unprojectGeo(safe.x, safe.z)) + 0.7);
          camera.position.set(safe.x, safe.y, safe.z);
        }
      }
    }
    if (
      !indoor.active &&
      peerPopulation.visible &&
      (!travel.active || travelPhase === "arriving")
    )
      peerActors.forEach((peer, index) =>
        animateCharacter(peer, now / 1000 + index * 0.37, false),
      );
    const range = camera.position.distanceTo(controls.target);
    updateCityCameraClip(
      camera,
      range,
      indoor.active || Boolean(characterGallery),
    );
    if (coarseDetailsActive !== range < 6000) refreshCoarseOwnership();
    population.visible = peerPopulation.visible =
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
        if (child.userData.beachLife) {
          child.visible = range < 1300;
          if (!characterGallery && !indoor.active && !travel.active)
            updateBeachLife(child, dt, now / 1000, motion && child.visible);
        } else if (child.userData.streetDetail) {
          child.visible = range < 2300;
          if (child.userData.fixtures)
            updateCityFixtures(child, traffic?.elapsed || 0);
        } else if (child.userData.architectureDetail)
          child.visible = range < 900;
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
      setPeers(options.peers || []);
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
    cancelScenery();
    walkRoute = [];
    walkKeys.clear();
    clearLocationFocus();
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
        bodyType: i % 2 ? "female" : "male",
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
    peerPopulation.visible = false;
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
    clearLocationFocus();
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
  function finishLocationFocus(ticket) {
    const request = pendingLocation;
    if (!request || request.ticket !== ticket || request.started) return;
    request.started = true;
    if (!player) {
      populate(true);
      pendingTeleport = false;
    }
    if (!player) {
      pendingLocation = null;
      request.resolve(false);
      return;
    }
    const { next, point } = request;
    const storefront = venueMeshes.find(
      (mesh) =>
        mesh.userData.hotspot?.id === next.id && mesh.userData.venueView,
    )?.userData.venueView;
    const source = storefront?.point || point;
    const footprints = [...chunkCache.values()]
      .flatMap((chunk) => chunk.buildings || [])
      .map((building) => building.ring.map(projectGeo))
      .filter((ring) => {
        const west = Math.min(...ring.map((p) => p.x)),
          east = Math.max(...ring.map((p) => p.x)),
          north = Math.min(...ring.map((p) => p.z)),
          south = Math.max(...ring.map((p) => p.z));
        return (
          Math.hypot(
            Math.max(west - source.x, 0, source.x - east),
            Math.max(north - source.z, 0, source.z - south),
          ) < 130
        );
      });
    const waterAt = (p) => Boolean(coastline?.waterAt(unprojectGeo(p.x, p.z)));
    const elevationAt = (p) => geoY(unprojectGeo(p.x, p.z));
    const beachView =
      next.category === "beach"
        ? beachCameraView({
            point,
            groundY: point.y,
            waterAt,
            elevationAt,
            footprints,
            aspect: camera.aspect,
          })
        : null;
    const driving = roadPaths.filter(
      (line) =>
        ![
          "footway",
          "pedestrian",
          "path",
          "steps",
          "rail",
          "tram",
          "cycleway",
        ].includes(line.kind) &&
        line.ps.some((p) => Math.hypot(p.x - source.x, p.z - source.z) < 400),
    );
    const safeAt = (p) =>
      cityActorSpaceIsClear(
        { ...p, y: elevationAt(p) + 0.2 },
        dynamicObstacles,
      ) &&
      driving.every((line) =>
        line.ps.slice(1).every((b, i) => {
          const a = line.ps[i],
            dx = b.x - a.x,
            dz = b.z - a.z;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
            ),
          );
          return (
            Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) >=
            line.width / 2 + 0.5
          );
        }),
      );
    const view = locationCameraView({
      point: source,
      normal: storefront?.normal,
      groundY: storefront?.groundY ?? point.y,
      footprints,
      reservations: [
        ...[...chunkGroups.values()].flatMap((chunk) =>
          chunk.children.flatMap((child) => [
            ...(child.userData.streetLife?.reservations || []),
            ...(child.userData.beachLife?.reservations || []),
          ]),
        ),
        ...venueMeshes.flatMap((mesh) =>
          (mesh.userData.terraceTables || []).map((table) => ({
            ...table,
            radius: 1.1,
          })),
        ),
      ],
      obstacles: locationTreeObstacles([...chunkGroups.values()], source),
      waterAt,
      elevationAt,
      safeAt,
      fallbackPlayer: player?.position,
      beachView,
      aspect: camera.aspect,
    });
    if (!view || !player) {
      pendingLocation = null;
      request.resolve(false);
      return;
    }
    player.position.set(view.player.x, view.player.y, view.player.z);
    playerTarget = player.position.clone();
    player.rotation.y = view.angle;
    if (beachView) {
      const sign = venueMeshes.find(
        (mesh) => mesh.userData.hotspot?.id === next.id,
      );
      if (sign)
        sign.rotation.y = Math.atan2(
          view.camera.x - source.x,
          view.camera.z - source.z,
        );
    }
    sun.position.set(point.x - 150, point.y + 400, point.z + 180);
    sun.target.position.copy(point);
    locationFocus.start(view, player).then((completed) => {
      if (pendingLocation !== request || destroyed) {
        request.resolve(false);
        return;
      }
      pendingLocation = null;
      setPeers(options.peers || []);
      request.resolve(completed);
    });
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
        return (
          Math.hypot(
            Math.max(west - point.x, 0, point.x - east),
            Math.max(north - point.z, 0, point.z - south),
          ) < 90
        );
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
    cancelScenery();
    walkRoute = [];
    walkKeys.clear();
    followState.initialized = false;
    if (next) clearLocationFocus();
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
    indoor.setPeers(options.peers || []);
    city.visible = population.visible = peerPopulation.visible = false;
    atmosphere.sky.visible = false;
    scene.background = new THREE.Color(
      next.kind === "bar" ? "#eee9f7" : "#edf3ff",
    );
    status("");
  }
  return {
    ready,
    setFocus,
    startTravel,
    skipTravel: () => travel.skip(),
    setTravelView: (view) => travel.setView(view),
    cancelTravel,
    setTime,
    setMarkers,
    setPeers,
    setAppearance,
    overview,
    playerView,
    nearbyScenery,
    performScenery,
    characters,
    people,
    setInterior,
    selectInteriorZone: (id) => indoor.selectZone(id),
    performInteriorAction: (id, duration) => indoor.perform(id, duration),
    playSocialEvent: (event) => indoor.social(event),
    setMode(next) {
      mode = next;
      if (next === "walk") {
        followPlayer = true;
        framePlayer();
      } else {
        walkKeys.clear();
      }
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
      interruptLocationFocus();
      camera.position
        .sub(controls.target)
        .multiplyScalar(multiplier)
        .add(controls.target);
      controls.update();
    },
    rotate(angle) {
      if (travel.active) return;
      interruptLocationFocus();
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    dispose() {
      cancelScenery();
      walkRoute = [];
      walkKeys.clear();
      destroyed = true;
      clearLocationFocus();
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("start", interruptLocationFocus);
      controls.dispose();
      locationFocus.dispose();
      badges.dispose();
      indoor.dispose();
      travel.dispose();
      lampLights.forEach((light) => light.dispose());
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("keydown", keyDown);
      renderer.domElement.removeEventListener("blur", clearWalkKeys);
      window.removeEventListener("keyup", keyUp);
      disposeGroup(scene);
      materials.forEach((m) => m.dispose());
      overviewMaterials.forEach((m) => m.dispose());
      architecture.dispose();
      atmosphere.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
