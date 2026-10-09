// Simulated street traffic stays on mapped carriageways. This is deliberately
// independent of Three.js so connected routing and traffic rules are testable.
const EXCLUDED = new Set([
  "footway",
  "pedestrian",
  "path",
  "steps",
  "cycleway",
  "rail",
  "tram",
]);

export function chooseLocalTraffic(
  paths,
  target,
  { max = 26, radius = 220 } = {},
) {
  if (!Number.isFinite(target?.x) || !Number.isFinite(target?.z)) return [];
  const cap = Math.max(0, Math.min(32, Math.floor(Number(max) || 0)));
  const reach = Math.max(60, Math.min(300, Number(radius) || 220));
  const unique = new Map();
  for (const line of paths || []) {
    if (
      EXCLUDED.has(line.kind) ||
      !Number.isFinite(line.width) ||
      !Number.isFinite(line.length) ||
      line.width < 3.6 ||
      line.length < 20 ||
      !Array.isArray(line.ps) ||
      line.ps.length < 2 ||
      !Array.isArray(line.lengths) ||
      line.lengths.length !== line.ps.length ||
      line.ps.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z)) ||
      line.lengths.some(
        (d, i) => !Number.isFinite(d) || (i > 0 && d <= line.lengths[i - 1]),
      )
    )
      continue;
    const key =
      line.id ??
      `${line.ps[0].x}:${line.ps[0].z}:${line.ps.at(-1).x}:${line.ps.at(-1).z}`;
    const previous = unique.get(key);
    if (
      !previous ||
      (previous.owner === "overview" && line.owner !== "overview")
    )
      unique.set(key, line);
  }
  const nearby = [];
  for (const line of unique.values()) {
    let nearest = null;
    for (let i = 1; i < line.ps.length; i++) {
      const a = line.ps[i - 1],
        b = line.ps[i];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        squared = dx * dx + dz * dz;
      if (squared < 0.01) continue;
      const t = Math.max(
        0,
        Math.min(1, ((target.x - a.x) * dx + (target.z - a.z) * dz) / squared),
      );
      const distance = Math.hypot(
        target.x - a.x - dx * t,
        target.z - a.z - dz * t,
      );
      if (!nearest || distance < nearest.distance)
        nearest = {
          distance,
          d: line.lengths[i - 1] + t * (line.lengths[i] - line.lengths[i - 1]),
        };
    }
    if (nearest && nearest.distance <= reach) nearby.push({ line, ...nearest });
  }
  nearby.sort(
    (a, b) =>
      a.distance - b.distance ||
      String(a.line.id).localeCompare(String(b.line.id)),
  );
  const result = [],
    positions = [];
  for (const offset of [0, 18, -24, 42, -48, 72, -78]) {
    for (const entry of nearby.slice(0, 16)) {
      if (result.length >= cap) return result;
      const { line } = entry;
      const at = Math.max(3, Math.min(line.length - 3, entry.d + offset));
      const oneWay = line.oneway ?? line.oneWay;
      const opposite =
        oneWay === "-1" || oneWay === -1
          ? true
          : oneWay === true || ["yes", "1", 1].includes(oneWay)
            ? false
            : result.length % 2 === 1;
      const side = ((opposite ? -1 : 1) * line.width) / 4;
      if (
        positions.some(
          (p) => p.line === line && p.side === side && Math.abs(p.at - at) < 14,
        )
      )
        continue;
      positions.push({ line, side, at });
      result.push({
        line,
        d: opposite ? line.length * 2 - at : at,
        side,
        speed: 4.5 + (result.length % 4),
      });
    }
  }
  return result;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const major = new Set(["primary", "secondary", "tertiary", "trunk"]);
const seed = (text) => {
  let value = 2166136261;
  for (const char of String(text))
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};
function distanceToLine(line, target) {
  let nearest = Infinity;
  for (let i = 1; i < line.ps.length; i++) {
    const a = line.ps[i - 1],
      b = line.ps[i];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = clamp(
      ((target.x - a.x) * dx + (target.z - a.z) * dz) /
        Math.max(0.001, dx * dx + dz * dz),
      0,
      1,
    );
    nearest = Math.min(
      nearest,
      Math.hypot(target.x - a.x - dx * t, target.z - a.z - dz * t),
    );
  }
  return nearest;
}

/** Shared geometry for traffic and city street fixtures. Junctions are authored
 * simulation controls at mapped road joins, not a survey of actual signal poles.
 * @param {any[]} paths
 * @param {{x:number,z:number}} target
 * @param {{radius?:number,maxPaths?:number,tracksOnly?:boolean}} [options]
 * @returns {{nodes:any[],edges:any[],junctions:any[],lines:any[]}}
 */
export function createTrafficNetwork(
  paths,
  target,
  { radius = 370, maxPaths = 110, tracksOnly = false } = {},
) {
  const network = { nodes: [], edges: [], junctions: [], lines: [] };
  if (!Number.isFinite(target?.x) || !Number.isFinite(target?.z))
    return network;
  const unique = new Map();
  for (const line of paths || []) {
    if (
      (tracksOnly ? line.kind !== "tram" : EXCLUDED.has(line.kind)) ||
      line.width < (tracksOnly ? 1.8 : 3.6) ||
      !(line.length >= 2) ||
      !Array.isArray(line.ps) ||
      line.ps.length < 2 ||
      !Array.isArray(line.lengths) ||
      line.lengths.length !== line.ps.length ||
      line.ps.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))
    )
      continue;
    const key =
      line.id ??
      `${line.ps[0].x}:${line.ps[0].z}:${line.ps.at(-1).x}:${line.ps.at(-1).z}`;
    const previous = unique.get(key);
    if (
      !previous ||
      (previous.owner === "overview" && line.owner !== "overview")
    )
      unique.set(key, line);
  }
  network.lines = [...unique.values()]
    .map((line) => ({ line, distance: distanceToLine(line, target) }))
    .filter((entry) => entry.distance <= radius)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        String(a.line.id).localeCompare(String(b.line.id)),
    )
    .slice(0, clamp(Math.floor(maxPaths), 1, 180))
    .map((entry) => entry.line);
  const grid = new Map();
  const nodeFor = (point, line) => {
    const gx = Math.floor(point.x / 1.2),
      gz = Math.floor(point.z / 1.2);
    for (let x = gx - 1; x <= gx + 1; x++)
      for (let z = gz - 1; z <= gz + 1; z++)
        for (const node of grid.get(`${x}:${z}`) || [])
          if (
            Math.hypot(point.x - node.x, point.z - node.z) < 0.8 &&
            Math.abs((point.y || 0) - node.y) < 1.5 &&
            String(line.layer || 0) === String(node.layer || 0) &&
            !!line.bridge === node.bridge
          )
            return node;
    const node = {
      id: `road-join-${Math.round(point.x * 10)}:${Math.round(point.z * 10)}:${line.layer || 0}:${line.bridge ? 1 : 0}`,
      x: point.x,
      y: point.y || 0,
      z: point.z,
      layer: line.layer || 0,
      bridge: !!line.bridge,
      edges: [],
      incoming: [],
      junction: null,
    };
    network.nodes.push(node);
    const key = `${gx}:${gz}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(node);
    return node;
  };
  // Simplified OSM polylines can omit a shared junction vertex. Split local
  // segments at genuine same-level crossings, while keeping flyovers separate.
  const cuts = new Map(
    network.lines.map((line) => [
      line,
      line.ps.map((point, i) => ({ point, d: line.lengths[i] })),
    ]),
  );
  const segments = [],
    segmentGrid = new Map(),
    pairs = new Set();
  for (const line of network.lines)
    for (let i = 1; i < line.ps.length; i++) {
      const a = line.ps[i - 1],
        b = line.ps[i];
      if (distanceToLine({ ps: [a, b] }, target) > radius + 60) continue;
      const segment = { line, i, a, b, index: segments.length };
      segments.push(segment);
      const minX = Math.floor(Math.min(a.x, b.x) / 35),
        maxX = Math.floor(Math.max(a.x, b.x) / 35),
        minZ = Math.floor(Math.min(a.z, b.z) / 35),
        maxZ = Math.floor(Math.max(a.z, b.z) / 35);
      // A cached overview may have a very long segment. Clipping its grid range
      // around the active network prevents an unbounded hash for that road.
      for (
        let x = Math.max(minX, Math.floor((target.x - radius - 30) / 35));
        x <= Math.min(maxX, Math.floor((target.x + radius + 30) / 35));
        x++
      )
        for (
          let z = Math.max(minZ, Math.floor((target.z - radius - 30) / 35));
          z <= Math.min(maxZ, Math.floor((target.z + radius + 30) / 35));
          z++
        ) {
          const key = `${x}:${z}`;
          if (!segmentGrid.has(key)) segmentGrid.set(key, []);
          segmentGrid.get(key).push(segment);
        }
    }
  for (const bucket of segmentGrid.values())
    for (let i = 0; i < bucket.length; i++)
      for (let j = 0; j < i; j++) {
        const a = bucket[i],
          b = bucket[j];
        if (
          a.line === b.line ||
          !!a.line.bridge !== !!b.line.bridge ||
          String(a.line.layer || 0) !== String(b.line.layer || 0)
        )
          continue;
        const key = `${Math.min(a.index, b.index)}:${Math.max(a.index, b.index)}`;
        if (pairs.has(key)) continue;
        pairs.add(key);
        const ax = a.b.x - a.a.x,
          az = a.b.z - a.a.z,
          bx = b.b.x - b.a.x,
          bz = b.b.z - b.a.z,
          den = ax * bz - az * bx;
        if (Math.abs(den) < 0.05) continue;
        const dx = b.a.x - a.a.x,
          dz = b.a.z - a.a.z,
          ta = (dx * bz - dz * bx) / den,
          tb = (dx * az - dz * ax) / den;
        if (ta < -0.0001 || ta > 1.0001 || tb < -0.0001 || tb > 1.0001)
          continue;
        const yA = (a.a.y || 0) + ((a.b.y || 0) - (a.a.y || 0)) * ta,
          yB = (b.a.y || 0) + ((b.b.y || 0) - (b.a.y || 0)) * tb;
        if (Math.abs(yA - yB) > 1.5) continue;
        const point = {
          x: a.a.x + ax * ta,
          y: (yA + yB) / 2,
          z: a.a.z + az * ta,
        };
        cuts.get(a.line).push({
          point,
          d:
            a.line.lengths[a.i - 1] +
            (a.line.lengths[a.i] - a.line.lengths[a.i - 1]) * ta,
        });
        cuts.get(b.line).push({
          point,
          d:
            b.line.lengths[b.i - 1] +
            (b.line.lengths[b.i] - b.line.lengths[b.i - 1]) * tb,
        });
      }
  for (const line of network.lines) {
    const ordered = cuts
      .get(line)
      .sort((a, b) => a.d - b.d)
      .filter((entry, i, array) => !i || entry.d - array[i - 1].d > 0.05);
    const oneWay = line.oneway ?? line.oneWay;
    const forwardOnly = oneWay === true || ["yes", "1", 1].includes(oneWay);
    const reverseOnly = oneWay === "-1" || oneWay === -1;
    for (let i = 1; i < ordered.length; i++) {
      const length = ordered[i].d - ordered[i - 1].d;
      if (
        !(length > 0.05) ||
        distanceToLine(
          { ps: [ordered[i - 1].point, ordered[i].point] },
          target,
        ) >
          radius + 60
      )
        continue;
      const first = nodeFor(ordered[i - 1].point, line),
        second = nodeFor(ordered[i].point, line);
      if (first === second) continue;
      for (const direction of [-1, 1]) {
        if ((direction < 0 && forwardOnly) || (direction > 0 && reverseOnly))
          continue;
        const from = direction > 0 ? first : second,
          to = direction > 0 ? second : first;
        const edge = {
          id: `${String(line.id)}:${i}:${direction}`,
          line,
          segment: i,
          dStart: ordered[i - 1].d,
          dEnd: ordered[i].d,
          direction,
          from,
          to,
          length,
          width: line.width,
          angle: Math.atan2(to.x - from.x, to.z - from.z),
        };
        network.edges.push(edge);
        from.edges.push(edge);
        to.incoming.push(edge);
      }
    }
  }
  for (const node of network.nodes) {
    const approaches = [];
    for (const edge of node.incoming) {
      if (
        approaches.some((a) => Math.abs(angleDelta(a.angle, edge.angle)) < 0.35)
      )
        continue;
      approaches.push({
        id: edge.line.id,
        angle: edge.angle,
        width: edge.width,
        kind: edge.line.kind,
      });
    }
    if (approaches.length < 3) continue;
    const widest = [...approaches].sort((a, b) => b.width - a.width)[0];
    const junction = {
      id: node.id,
      x: node.x,
      y: node.y,
      z: node.z,
      approaches,
      signal: approaches.some((a) => major.has(a.kind) && a.width >= 7.5),
      offset: seed(node.id) % 48,
      axis: widest.angle,
      node,
      reservation: null,
    };
    node.junction = junction;
    network.junctions.push(junction);
  }
  return network;
}

/** Two perpendicular approaches, amber and an all-red clearance. The clock is
 * simulation time; it is not connected to Lisbon's real traffic controllers. */
export function trafficSignalState(junction, time, approachAngle) {
  if (!junction?.signal) return "green";
  const phase =
    ((((Number(time) || 0) + (junction.offset || 0)) % 52) + 52) % 52;
  const aligned =
    Math.abs(Math.cos(angleDelta(approachAngle, junction.axis))) >=
    Math.SQRT1_2;
  const local = (phase + (aligned ? 0 : 26)) % 52;
  if (local < 22) return "green";
  if (local < 24) return "amber";
  return "red";
}

function onEdge(edge, progress, output = {}) {
  const t = clamp(progress / Math.max(edge.length, 0.001), 0, 1);
  const dx = edge.to.x - edge.from.x,
    dz = edge.to.z - edge.from.z;
  const norm = Math.max(0.001, Math.hypot(dx, dz));
  const side = edge.line.kind === "tram" ? 0 : edge.width * 0.25;
  output.x = edge.from.x + dx * t - (dz / norm) * side;
  output.z = edge.from.z + dz * t + (dx / norm) * side;
  output.y = edge.from.y + (edge.to.y - edge.from.y) * t;
  output.angle = edge.angle;
  return output;
}
function nextEdge(actor) {
  const edge = actor.edge;
  const candidates = edge.to.edges.filter(
    (candidate) =>
      candidate.to !== edge.from &&
      candidate.width >=
        (actor.kind === "bus" ? 7 : actor.kind === "tram" ? 1.8 : 3.6) &&
      Math.abs(angleDelta(candidate.angle, edge.angle)) <=
        (actor.kind === "bus" ? 1.85 : 2.6),
  );
  if (!candidates.length) return null;
  candidates.sort(
    (a, b) =>
      Math.abs(angleDelta(a.angle, edge.angle)) -
        Math.abs(angleDelta(b.angle, edge.angle)) || a.id.localeCompare(b.id),
  );
  // Most journeys continue along the street; some take a side road. A visit
  // counter prevents a permanent two-point oscillation on connected roads.
  const choice = seed(`${actor.id}:${actor.visits}:${edge.to.id}`) % 5;
  return candidates[
    choice === 0 && candidates.length > 1
      ? 1 + (seed(actor.id + actor.visits) % Math.min(2, candidates.length - 1))
      : 0
  ];
}
function transitionFor(actor, next) {
  const radius = Math.min(
    actor.kind === "bus" ? 8 : 5.5,
    actor.edge.length * 0.43,
    next.length * 0.43,
  );
  const startAt = actor.edge.length - radius;
  const from = onEdge(actor.edge, startAt),
    to = onEdge(next, radius);
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const control = Math.max(radius * 0.75, d * 0.34);
  return {
    from,
    to,
    next,
    startAt,
    endAt: radius,
    progress: 0,
    length: Math.max(d, radius * 1.25),
    c1: {
      x: from.x + Math.sin(from.angle) * control,
      z: from.z + Math.cos(from.angle) * control,
    },
    c2: {
      x: to.x - Math.sin(to.angle) * control,
      z: to.z - Math.cos(to.angle) * control,
    },
  };
}

/**
 * @param {any[]} paths
 * @param {{x:number,z:number}} target
 * @param {{max?:number,radius?:number,tracksOnly?:boolean}} [options]
 * @returns {{network:any,vehicles:any[],junctions:any[],elapsed:number,target:{x:number,z:number}}}
 */
export function createTrafficSimulation(
  paths,
  target,
  { max = 26, radius = 220, tracksOnly = false } = {},
) {
  const network = createTrafficNetwork(paths, target, {
    radius: Math.min(470, radius + 140),
    tracksOnly,
  });
  const trackCopies = tracksOnly
    ? network.lines.map((line) => ({
        ...line,
        kind: "residential",
        width: 4.4,
        original: line,
      }))
    : null;
  const routes = chooseLocalTraffic(trackCopies || network.lines, target, {
    max,
    radius,
  }).map((route) =>
    trackCopies ? { ...route, line: route.line.original, side: 0 } : route,
  );
  const simulation = {
    network,
    vehicles: [],
    junctions: network.junctions,
    elapsed: 0,
    target: { ...target },
  };
  for (const [i, route] of routes.entries()) {
    const reverse =
      route.d > route.line.length &&
      !(
        route.line.oneWay === true ||
        ["yes", 1, "1"].includes(route.line.oneway)
      );
    const at =
      route.d > route.line.length ? route.line.length * 2 - route.d : route.d;
    const allowed = network.edges.filter(
      (edge) =>
        edge.line === route.line && edge.direction === (reverse ? -1 : 1),
    );
    const edge =
      allowed.find((edge) => at >= edge.dStart && at <= edge.dEnd) ||
      allowed[0];
    if (!edge) continue;
    const bus = i % 9 === 3 && route.line.width >= 7 && route.line.length >= 75;
    const kind = tracksOnly
      ? "tram"
      : bus
        ? "bus"
        : i % 7 === 2
          ? "taxi"
          : i % 3 === 0
            ? "hatchback"
            : "sedan";
    const actor = {
      ...route,
      id: `${tracksOnly ? "tram" : "street-vehicle"}-${i}`,
      kind,
      edge,
      progress: clamp(
        reverse ? edge.dEnd - at : at - edge.dStart,
        0,
        edge.length,
      ),
      currentSpeed: 0,
      cruiseSpeed: tracksOnly ? 4.6 : bus ? 5.3 : route.speed,
      vehicleLength: tracksOnly
        ? 8.2
        : bus
          ? 10.5
          : kind === "hatchback"
            ? 3.92
            : 4.45,
      vehicleWidth: tracksOnly ? 2.2 : bus ? 2.5 : 1.78,
      visits: 0,
      visible: true,
      wait: 0,
      transition: null,
      next: null,
      dwell: 0,
      lastDwell: null,
      braking: false,
      sample: {},
    };
    // A source way's closest point is often a junction. Begin behind its stop
    // line so traffic cannot spawn inside a crossing then jump onto a curve.
    if (edge.to.junction)
      actor.progress = Math.min(
        actor.progress,
        Math.max(0, edge.length - actor.vehicleLength / 2 - 4),
      );
    actor.next = nextEdge(actor);
    sampleTrafficVehicle(actor, actor.sample);
    if (
      simulation.vehicles.some((other) => {
        if (
          Number.isFinite(actor.sample.y) &&
          Number.isFinite(other.sample.y) &&
          Math.abs(actor.sample.y - other.sample.y) > 2.2
        )
          return false;
        const dx = actor.sample.x - other.sample.x,
          dz = actor.sample.z - other.sample.z;
        const along = Math.abs(
          dx * Math.sin(actor.sample.angle) + dz * Math.cos(actor.sample.angle),
        );
        const across = Math.abs(
          dx * Math.cos(actor.sample.angle) - dz * Math.sin(actor.sample.angle),
        );
        return (
          Math.abs(angleDelta(actor.sample.angle, other.sample.angle)) < 0.6 &&
          across < (actor.vehicleWidth + other.vehicleWidth) * 0.42 &&
          along < (actor.vehicleLength + other.vehicleLength) / 2 + 2.2
        );
      })
    )
      continue;
    simulation.vehicles.push(actor);
  }
  return simulation;
}

/**
 * @param {any} actor
 * @param {any} [output]
 * @returns {{x:number,y:number,z:number,angle:number,speed:number,visible:boolean,braking:boolean}}
 */
export function sampleTrafficVehicle(actor, output = {}) {
  if (actor.transition) {
    const tr = actor.transition,
      t = clamp(tr.progress / tr.length, 0, 1),
      q = 1 - t;
    output.x =
      q * q * q * tr.from.x +
      3 * q * q * t * tr.c1.x +
      3 * q * t * t * tr.c2.x +
      t * t * t * tr.to.x;
    output.z =
      q * q * q * tr.from.z +
      3 * q * q * t * tr.c1.z +
      3 * q * t * t * tr.c2.z +
      t * t * t * tr.to.z;
    output.y = tr.from.y + (tr.to.y - tr.from.y) * t;
    const dx =
      3 * q * q * (tr.c1.x - tr.from.x) +
      6 * q * t * (tr.c2.x - tr.c1.x) +
      3 * t * t * (tr.to.x - tr.c2.x);
    const dz =
      3 * q * q * (tr.c1.z - tr.from.z) +
      6 * q * t * (tr.c2.z - tr.c1.z) +
      3 * t * t * (tr.to.z - tr.c2.z);
    output.angle = Math.atan2(dx, dz);
  } else onEdge(actor.edge, actor.progress, output);
  output.speed = actor.currentSpeed;
  output.visible = actor.visible;
  output.braking = actor.braking;
  return output;
}

function recycleActor(simulation, actor) {
  // A car leaving a disconnected extract edge continues out of the simulation.
  // Re-entry is on another distant mapped road, never an instantaneous U-turn.
  const suitable = simulation.network.edges.filter(
    (edge) =>
      edge.length > 15 &&
      edge.width >=
        (actor.kind === "bus" ? 7 : actor.kind === "tram" ? 1.8 : 3.6) &&
      Math.hypot(
        edge.from.x - simulation.target.x,
        edge.from.z - simulation.target.z,
      ) > 75,
  );
  if (!suitable.length) return;
  const edge =
    suitable[seed(`${actor.id}:${actor.visits++}`) % suitable.length];
  actor.edge = edge;
  actor.progress = 0;
  actor.currentSpeed = 0;
  actor.visible = true;
  actor.wait = 0;
  actor.next = nextEdge(actor);
  actor.transition = null;
}

// Road vehicles and trams can have independent route graphs but share the same
// street. Reserve a bounded crossing approach for the tram; a vehicle already
// occupying the crossing clears it first. This is local yielding, not a global
// traffic planner or a claim about actual Lisbon signal priorities.
function externalVehicleSpeed(actor, other, desired) {
  if (!other?.visible || other === actor || !other.sample) return desired;
  const a = actor.sample,
    b = other.sample;
  if (
    ![b.x, b.z, b.angle].every(Number.isFinite) ||
    (Number.isFinite(a.y) && Number.isFinite(b.y) && Math.abs(a.y - b.y) > 2.2)
  )
    return desired;
  const dx = b.x - a.x,
    dz = b.z - a.z;
  if (Math.hypot(dx, dz) > 40) return desired;
  const forwardX = Math.sin(a.angle),
    forwardZ = Math.cos(a.angle),
    otherX = Math.sin(b.angle),
    otherZ = Math.cos(b.angle);
  const along = dx * forwardX + dz * forwardZ,
    across = dx * forwardZ - dz * forwardX;
  const otherLength = Number(other.vehicleLength) || 4.45,
    otherWidth = Number(other.vehicleWidth) || 1.78;
  if (Math.abs(angleDelta(a.angle, b.angle)) < 0.7) {
    if (
      along > 0 &&
      Math.abs(across) < (actor.vehicleWidth + otherWidth) / 2 + 0.15
    ) {
      const gap = along - (actor.vehicleLength + otherLength) / 2 - 2.2;
      return Math.min(desired, Math.max(0, gap) * 0.7);
    }
    return desired;
  }
  const determinant = forwardX * otherZ - forwardZ * otherX;
  if (Math.abs(determinant) < 0.3) return desired;
  const crossingAhead = (dx * otherZ - dz * otherX) / determinant,
    otherCrossingAhead = (dx * forwardZ - dz * forwardX) / determinant;
  const occupiedByActor = actor.vehicleLength / 2 + otherWidth / 2 + 0.8;
  if (
    crossingAhead <= occupiedByActor ||
    crossingAhead > 28 ||
    otherCrossingAhead > 28 ||
    otherCrossingAhead < -otherLength / 2 - actor.vehicleWidth / 2 - 0.8
  )
    return desired;
  const otherOccupiesCrossing =
    Math.abs(otherCrossingAhead) <
    otherLength / 2 + actor.vehicleWidth / 2 + 0.8;
  const otherHasPriority =
    (other.kind === "tram" && actor.kind !== "tram") ||
    (other.kind === actor.kind && String(other.id) < String(actor.id));
  if (!otherOccupiesCrossing && !otherHasPriority) return desired;
  const clearance = actor.vehicleLength / 2 + otherWidth / 2 + 1.4;
  return Math.min(
    desired,
    Math.sqrt(Math.max(0, crossingAhead - clearance) * 2 * 3),
  );
}

/** Bounded 50ms physics substeps prevent skipped red lights/headway after a
 * suspended tab. Optional pedestrian elevations distinguish separate decks.
 * External vehicles share clearance while retaining their own route graph.
 * @param {any} simulation
 * @param {number} dt
 * @param {{pedestrians?:{x:number,y?:number,z:number,radius?:number}[],externalVehicles?:any[]}} [options]
 */
export function advanceTraffic(
  simulation,
  dt,
  { pedestrians = [], externalVehicles = [] } = {},
) {
  if (!simulation || !Number.isFinite(dt) || dt <= 0) return simulation;
  let remaining = Math.min(dt, 3);
  while (remaining > 0.00001) {
    const step = Math.min(0.05, remaining);
    remaining -= step;
    simulation.elapsed += step;
    for (const actor of simulation.vehicles)
      sampleTrafficVehicle(actor, actor.sample);
    for (let i = 0; i < Math.min(64, externalVehicles.length); i++) {
      const other = externalVehicles[i];
      if (other?.edge) sampleTrafficVehicle(other, (other.sample ||= {}));
    }
    for (const actor of simulation.vehicles) {
      if (!actor.visible) {
        actor.wait += step;
        if (actor.wait > 4) recycleActor(simulation, actor);
        continue;
      }
      const edge = actor.edge,
        left = edge.length - actor.progress,
        junction = edge.to.junction;
      let desired = actor.cruiseSpeed;
      const candidate = actor.next;
      const bend = candidate
        ? Math.abs(angleDelta(candidate.angle, edge.angle))
        : 0;
      if (!actor.transition && bend > 0.28 && left < 16)
        desired = Math.min(desired, actor.kind === "bus" ? 2.8 : 3.8);
      if (!actor.transition && junction && left < 35) {
        const clearance = actor.vehicleLength / 2 + 4;
        const state = trafficSignalState(
          junction,
          simulation.elapsed,
          edge.angle,
        );
        const reservation = junction.reservation;
        const blocked =
          reservation &&
          reservation.until > simulation.elapsed &&
          reservation.actor !== actor.id;
        if (state !== "green" || blocked)
          desired = Math.min(
            desired,
            Math.sqrt(Math.max(0, left - clearance) * 2 * 3),
          );
        if (!junction.signal && left < clearance + 5)
          desired = Math.min(desired, 2.4);
      }
      for (const other of simulation.vehicles) {
        if (other === actor || !other.visible) continue;
        if (
          Number.isFinite(actor.sample.y) &&
          Number.isFinite(other.sample.y) &&
          Math.abs(actor.sample.y - other.sample.y) > 2.2
        )
          continue;
        const dx = other.sample.x - actor.sample.x,
          dz = other.sample.z - actor.sample.z;
        const along =
          dx * Math.sin(actor.sample.angle) + dz * Math.cos(actor.sample.angle);
        const across =
          dx * Math.cos(actor.sample.angle) - dz * Math.sin(actor.sample.angle);
        if (
          along > 0 &&
          Math.abs(across) < (actor.vehicleWidth + other.vehicleWidth) * 0.42 &&
          Math.abs(angleDelta(actor.sample.angle, other.sample.angle)) < 0.7
        ) {
          const gap =
            along - (actor.vehicleLength + other.vehicleLength) / 2 - 2.2;
          if (gap < desired * 1.5 + 4)
            desired = Math.min(desired, Math.max(0, gap) * 0.7);
        }
      }
      for (const person of pedestrians) {
        if (
          Number.isFinite(actor.sample.y) &&
          Number.isFinite(person.y) &&
          Math.abs(actor.sample.y - person.y) > 2.2
        )
          continue;
        const dx = person.x - actor.sample.x,
          dz = person.z - actor.sample.z;
        const along =
          dx * Math.sin(actor.sample.angle) + dz * Math.cos(actor.sample.angle);
        const across =
          dx * Math.cos(actor.sample.angle) - dz * Math.sin(actor.sample.angle);
        if (
          along > 0 &&
          Math.abs(across) <
            actor.vehicleWidth / 2 + (person.radius || 0.35) + 0.2 &&
          along < 14
        )
          desired = Math.min(
            desired,
            Math.sqrt(Math.max(0, along - actor.vehicleLength / 2 - 1.2) * 4),
          );
      }
      for (let i = 0; i < Math.min(64, externalVehicles.length); i++)
        desired = externalVehicleSpeed(actor, externalVehicles[i], desired);
      if (
        ["bus", "tram"].includes(actor.kind) &&
        !actor.transition &&
        edge.length > 12 &&
        seed(edge.id) % 7 === 0
      ) {
        const stopAt = edge.length * 0.57,
          stopKey = `${edge.id}:${actor.visits}`;
        if (actor.lastDwell !== stopKey && actor.progress < stopAt + 0.3) {
          desired = Math.min(
            desired,
            Math.sqrt(Math.max(0, stopAt - actor.progress) * 4),
          );
          if (stopAt - actor.progress < 0.2 && actor.currentSpeed < 0.3) {
            actor.dwell += step;
            desired = 0;
            if (actor.dwell > 5) {
              actor.lastDwell = stopKey;
              actor.dwell = 0;
            }
          }
        }
      }
      actor.braking = desired < actor.currentSpeed - 0.1;
      actor.currentSpeed = Math.max(
        0,
        actor.currentSpeed +
          clamp(desired - actor.currentSpeed, -3.8 * step, 1.8 * step),
      );
      const distance = actor.currentSpeed * step;
      if (actor.transition) {
        actor.transition.progress += distance;
        if (actor.transition.progress >= actor.transition.length) {
          actor.edge = actor.transition.next;
          actor.progress = actor.transition.endAt;
          actor.transition = null;
          actor.visits++;
          actor.next = nextEdge(actor);
        }
      } else {
        actor.progress = Math.min(edge.length, actor.progress + distance);
        const next = actor.next;
        if (next) {
          const tr = transitionFor(actor, next);
          const state = junction
            ? trafficSignalState(junction, simulation.elapsed, edge.angle)
            : "green";
          const occupied =
            junction?.reservation &&
            junction.reservation.until > simulation.elapsed &&
            junction.reservation.actor !== actor.id;
          if (actor.progress >= tr.startAt && state === "green" && !occupied) {
            tr.progress = Math.max(0, actor.progress - tr.startAt);
            actor.transition = tr;
            if (junction)
              junction.reservation = {
                actor: actor.id,
                until:
                  simulation.elapsed +
                  Math.max(1.5, tr.length / Math.max(1, actor.currentSpeed)),
              };
          }
        } else if (actor.progress >= edge.length - 0.03) {
          actor.visible = false;
          actor.currentSpeed = 0;
          actor.wait = 0;
        }
      }
      actor.line = actor.edge.line;
      const at =
        actor.edge.dStart +
        (actor.edge.direction > 0
          ? actor.progress
          : actor.edge.length - actor.progress);
      actor.d = actor.edge.direction > 0 ? at : actor.line.length * 2 - at;
      actor.side = (actor.edge.direction * actor.edge.width) / 4;
    }
  }
  return simulation;
}
