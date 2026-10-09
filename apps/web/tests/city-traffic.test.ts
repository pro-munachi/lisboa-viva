import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseLocalTraffic,
  createTrafficNetwork,
  createTrafficSimulation,
  advanceTraffic,
  sampleTrafficVehicle,
  trafficSignalState,
} from "../lib/city-traffic.js";

const street = {
  id: 1,
  kind: "residential",
  width: 8,
  owner: "detail",
  length: 1000,
  lengths: [0, 1000],
  ps: [
    { x: 0, z: 0 },
    { x: 1000, z: 0 },
  ],
};
test("street traffic finds the closest section of a long mapped road and both driving lanes", () => {
  const actors = chooseLocalTraffic([street], { x: 500, z: 0 });
  assert.ok(actors.length >= 6);
  assert.ok(actors.some((a) => a.side > 0) && actors.some((a) => a.side < 0));
  for (const a of actors) {
    const d = a.d > street.length ? street.length * 2 - a.d : a.d;
    assert.ok(Math.abs(d - 500) <= 78);
    assert.ok(Math.abs(a.side) + 0.875 < street.width / 2);
  }
});
test("cars never populate beaches, pedestrian routes, tracks, cycleways or narrow streets", () => {
  const paths = [
    "footway",
    "pedestrian",
    "path",
    "steps",
    "cycleway",
    "rail",
    "tram",
  ].map((kind, i) => ({ ...street, id: i, kind }));
  paths.push({ ...street, id: 99, width: 2.5 });
  assert.deepEqual(chooseLocalTraffic(paths, { x: 500, z: 0 }), []);
});
test("duplicated overview roads do not duplicate actors and crowd caps remain deterministic", () => {
  const overview = { ...street, owner: "overview" };
  const once = chooseLocalTraffic([street], { x: 500, z: 0 }, { max: 6 });
  const twice = chooseLocalTraffic(
    [overview, street],
    { x: 500, z: 0 },
    { max: 6 },
  );
  assert.deepEqual(twice, once);
  assert.equal(twice.length, 6);
  assert.ok(twice.every((a) => a.line === street));
  assert.deepEqual(chooseLocalTraffic([street], { x: NaN, z: 0 }), []);
  assert.deepEqual(chooseLocalTraffic([street], { x: 500, z: 500 }), []);
});

const route = (
  id: number,
  ps: { x: number; z: number; y?: number }[],
  width = 8,
  kind = "residential",
  extra = {},
) => {
  const lengths = [0];
  for (let i = 1; i < ps.length; i++)
    lengths.push(
      lengths.at(-1)! +
        Math.hypot(ps[i].x - ps[i - 1].x, ps[i].z - ps[i - 1].z),
    );
  return {
    id,
    ps,
    lengths,
    length: lengths.at(-1)!,
    width,
    kind,
    owner: "detail",
    ...extra,
  };
};
const cross = [
  route(
    10,
    [
      { x: -60, z: 0 },
      { x: 0, z: 0 },
      { x: 60, z: 0 },
    ],
    10,
    "primary",
  ),
  route(
    11,
    [
      { x: 0, z: -60 },
      { x: 0, z: 0 },
      { x: 0, z: 60 },
    ],
    8,
    "secondary",
  ),
];

test("mapped connected junctions keep bridge/level crossings separate and expose shared signal phases", () => {
  const network = createTrafficNetwork(cross, { x: 0, z: 0 });
  assert.equal(network.junctions.length, 1);
  const junction = network.junctions[0];
  assert.equal(junction.approaches.length, 4);
  assert.equal(junction.signal, true);
  junction.offset = 0;
  junction.axis = Math.PI / 2;
  assert.equal(trafficSignalState(junction, 1, Math.PI / 2), "green");
  assert.equal(trafficSignalState(junction, 1, 0), "red");
  assert.equal(trafficSignalState(junction, 22.5, Math.PI / 2), "amber");
  assert.equal(trafficSignalState(junction, 24.5, Math.PI / 2), "red");
  assert.equal(trafficSignalState(junction, 27, 0), "green");
  const bridge = route(
    12,
    [
      { x: 0, y: 8, z: -60 },
      { x: 0, y: 8, z: 0 },
      { x: 0, y: 8, z: 60 },
    ],
    8,
    "secondary",
    { bridge: true },
  );
  assert.equal(
    createTrafficNetwork([cross[0], bridge], { x: 0, z: 0 }).junctions.length,
    0,
  );
  const subset = createTrafficNetwork([...cross].reverse(), { x: 0, z: 0 });
  assert.equal(subset.junctions[0].id, network.junctions[0].id);
});
test("cars accelerate, smoothly take a connected turn and never reflect at road endpoints", () => {
  const paths = [
    route(20, [
      { x: 0, z: -45 },
      { x: 0, z: 0 },
    ]),
    route(21, [
      { x: 0, z: 0 },
      { x: 45, z: 0 },
    ]),
  ];
  const sim = createTrafficSimulation(paths, { x: 0, z: -30 }, { max: 1 });
  const actor = sim.vehicles[0];
  assert.ok(actor);
  actor.progress = actor.edge.length - 9;
  actor.currentSpeed = 4;
  const first = sampleTrafficVehicle(actor);
  assert.equal(first.angle, 0);
  let observedCurve = false;
  let previous = first;
  for (let i = 0; i < 130; i++) {
    advanceTraffic(sim, 0.1);
    const sample = sampleTrafficVehicle(actor);
    assert.ok(Math.hypot(sample.x - previous.x, sample.z - previous.z) < 1.2);
    if (actor.transition) {
      observedCurve = true;
      assert.ok(sample.angle >= -0.05 && sample.angle <= Math.PI / 2 + 0.05);
    }
    previous = sample;
  }
  assert.ok(observedCurve);
  assert.equal(actor.edge.line.id, 21);
  assert.equal(actor.edge.direction, 1);
  assert.ok(actor.progress > 0);
  for (let i = 0; i < 400; i++) advanceTraffic(sim, 0.1);
  assert.equal(
    actor.visible,
    false,
    "disconnected road leaves the simulation instead of bouncing back",
  );
});
test("red signals stop a vehicle before the junction and green releases it", () => {
  const sim = createTrafficSimulation(cross, { x: -28, z: 0 }, { max: 1 });
  const actor = sim.vehicles[0],
    junction = sim.junctions[0];
  actor.progress = actor.edge.length - 14;
  actor.currentSpeed = 2;
  junction.axis = actor.edge.angle;
  junction.offset = 27;
  for (let i = 0; i < 70; i++) advanceTraffic(sim, 0.1);
  assert.equal(actor.transition, null);
  assert.ok(
    actor.edge.length - actor.progress >= actor.vehicleLength / 2 + 3.8,
  );
  assert.ok(actor.currentSpeed < 0.1);
  junction.offset = 0;
  sim.elapsed = 0;
  for (let i = 0; i < 45; i++) advanceTraffic(sim, 0.1);
  assert.ok(actor.transition || actor.visits > 0);
});
test("following traffic and pedestrians enforce a gap; wide roads alone admit buses and oneway is respected", () => {
  const long = route(
    30,
    [
      { x: 0, z: 0 },
      { x: 0, z: 250 },
    ],
    10,
    "primary",
    { oneWay: true },
  );
  const sim = createTrafficSimulation([long], { x: 0, z: 120 }, { max: 10 });
  assert.ok(sim.vehicles.every((v) => v.edge.direction === 1));
  assert.ok(sim.vehicles.some((v) => v.kind === "bus"));
  const actor = sim.vehicles[0];
  actor.progress = 100;
  actor.currentSpeed = 4;
  sim.vehicles = [actor];
  const at = sampleTrafficVehicle(actor);
  for (let i = 0; i < 40; i++)
    advanceTraffic(sim, 0.1, {
      pedestrians: [{ x: at.x, z: at.z + 9, radius: 0.4 }],
    });
  assert.ok(actor.progress < 108);
  assert.ok(actor.currentSpeed < 0.2);
  const narrow = createTrafficSimulation(
    [
      route(
        31,
        [
          { x: 0, z: 0 },
          { x: 0, z: 250 },
        ],
        4,
      ),
    ],
    { x: 0, z: 120 },
    { max: 10 },
  );
  assert.ok(narrow.vehicles.every((v) => v.kind !== "bus"));
});

test("simplified streets are split at same-level interior intersections, and trams follow connected centre rails", () => {
  const simplified = [
    route(
      40,
      [
        { x: -50, z: 0 },
        { x: 50, z: 0 },
      ],
      9,
      "primary",
    ),
    route(
      41,
      [
        { x: 0, z: -50 },
        { x: 0, z: 50 },
      ],
      8,
      "secondary",
    ),
  ];
  const network = createTrafficNetwork(simplified, { x: 0, z: 0 });
  assert.equal(network.junctions.length, 1);
  assert.equal(network.junctions[0].approaches.length, 4);
  assert.equal(network.edges.length, 8);
  const tracks = [
    route(
      42,
      [
        { x: 0, z: -45 },
        { x: 0, z: 0 },
      ],
      2.2,
      "tram",
    ),
    route(
      43,
      [
        { x: 0, z: 0 },
        { x: 45, z: 0 },
      ],
      2.2,
      "tram",
    ),
  ];
  const sim = createTrafficSimulation(
    tracks,
    { x: 0, z: -30 },
    { max: 1, tracksOnly: true },
  );
  const actor = sim.vehicles[0];
  assert.equal(actor.kind, "tram");
  const sample = sampleTrafficVehicle(actor);
  assert.equal(sample.x, 0);
  actor.progress = actor.edge.length - 9;
  actor.currentSpeed = 3;
  for (let i = 0; i < 150; i++) advanceTraffic(sim, 0.1);
  assert.equal(actor.edge.line.id, 43);
  assert.equal(actor.edge.direction, 1);
  const at = sampleTrafficVehicle(actor);
  assert.ok(Math.abs(at.z) < 0.001);
});
test("following cars brake before overlapping the leading vehicle", () => {
  const sim = createTrafficSimulation(
    [
      route(
        44,
        [
          { x: 0, z: 0 },
          { x: 0, z: 250 },
        ],
        9,
        "primary",
        { oneWay: true },
      ),
    ],
    { x: 0, z: 100 },
    { max: 2 },
  );
  const [behind, ahead] = sim.vehicles;
  behind.progress = 80;
  behind.currentSpeed = 6;
  ahead.progress = 94;
  ahead.currentSpeed = 0;
  ahead.cruiseSpeed = 0;
  for (let i = 0; i < 70; i++) advanceTraffic(sim, 0.1);
  const gap = ahead.progress - behind.progress;
  assert.ok(gap > (behind.vehicleLength + ahead.vehicleLength) / 2 + 1.8);
  assert.ok(behind.currentSpeed < 0.1);
});

test("overpass cars and pedestrians do not stop ground traffic, while at-grade obstacles retain their clearance", () => {
  const ground = route(
    45,
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 250 },
    ],
    9,
    "primary",
    { oneWay: true },
  );
  const bridge = route(
    46,
    [
      { x: 0, y: 8, z: 0 },
      { x: 0, y: 8, z: 250 },
    ],
    9,
    "primary",
    { oneWay: true, bridge: true, layer: 1 },
  );
  const headway = (separateDeck: boolean) => {
    const sim = createTrafficSimulation(
      [ground, bridge],
      { x: 0, z: 100 },
      { max: 2 },
    );
    const [behind, ahead] = sim.vehicles;
    behind.edge = sim.network.edges.find(
      (edge: { line: { id: number } }) => edge.line.id === ground.id,
    )!;
    ahead.edge = sim.network.edges.find(
      (edge: { line: { id: number } }) =>
        edge.line.id === (separateDeck ? bridge.id : ground.id),
    )!;
    behind.progress = 80;
    behind.currentSpeed = 4;
    behind.cruiseSpeed = 6;
    ahead.progress = 94;
    ahead.currentSpeed = ahead.cruiseSpeed = 0;
    for (const actor of [behind, ahead]) {
      actor.next = null;
      actor.transition = null;
    }
    for (let i = 0; i < 40; i++) advanceTraffic(sim, 0.1);
    return { behind, ahead };
  };
  const atGrade = headway(false);
  const overpass = headway(true);
  assert.ok(
    atGrade.behind.progress < 88,
    "a stopped car still keeps the following car clear",
  );
  assert.ok(
    overpass.behind.progress > 100,
    "a car eight metres above does not create a phantom queue below",
  );
  const pedestrian = (y: number | undefined) => {
    const sim = createTrafficSimulation([ground], { x: 0, z: 100 }, { max: 1 });
    const actor = sim.vehicles[0];
    actor.progress = 80;
    actor.currentSpeed = 4;
    actor.cruiseSpeed = 6;
    actor.next = null;
    const at = sampleTrafficVehicle(actor);
    for (let i = 0; i < 40; i++)
      advanceTraffic(sim, 0.1, {
        pedestrians: [{ x: at.x, y, z: 89, radius: 0.4 }],
      });
    return actor.progress;
  };
  assert.ok(pedestrian(0) < 87, "a pedestrian in the lane still stops traffic");
  assert.ok(
    pedestrian(undefined) < 87,
    "older callers without elevation retain pedestrian clearance",
  );
  assert.ok(
    pedestrian(8) > 100,
    "a pedestrian on another deck cannot stop the street below",
  );
});

const independentCrossing = (tramY = 0) => {
  const street = createTrafficSimulation(
    [
      route(
        60,
        [
          { x: 0, y: 0, z: -100 },
          { x: 0, y: 0, z: 100 },
        ],
        8,
        "residential",
        { oneWay: true },
      ),
    ],
    { x: 0, z: 0 },
    { max: 1 },
  );
  const rails = createTrafficSimulation(
    [
      route(
        61,
        [
          { x: -100, y: tramY, z: 0 },
          { x: 100, y: tramY, z: 0 },
        ],
        2.2,
        "tram",
        { oneWay: true, bridge: tramY > 0, layer: tramY > 0 ? 1 : 0 },
      ),
    ],
    { x: 0, z: 0 },
    { max: 1, tracksOnly: true },
  );
  for (const actor of [...street.vehicles, ...rails.vehicles]) {
    actor.progress = 80;
    actor.currentSpeed = actor.cruiseSpeed = 4;
    actor.next = null;
  }
  return { street, rails };
};
const advanceIndependentCrossing = (
  street: ReturnType<typeof createTrafficSimulation>,
  rails: ReturnType<typeof createTrafficSimulation>,
) => {
  advanceTraffic(street, 0.05, { externalVehicles: rails.vehicles });
  advanceTraffic(rails, 0.05, { externalVehicles: street.vehicles });
};
const assertCrossingClear = (
  street: ReturnType<typeof createTrafficSimulation>,
  rails: ReturnType<typeof createTrafficSimulation>,
) => {
  const car = street.vehicles[0],
    tram = rails.vehicles[0];
  const a = sampleTrafficVehicle(car),
    b = sampleTrafficVehicle(tram);
  const overlapping =
    Math.abs(a.x - b.x) < (car.vehicleWidth + tram.vehicleLength) / 2 &&
    Math.abs(a.z - b.z) < (car.vehicleLength + tram.vehicleWidth) / 2;
  assert.equal(
    overlapping,
    false,
    "independent route graphs cannot drive their bodies through each other",
  );
};

test("independent road and tram simulations yield at shared crossings, release afterwards, and do not block another deck", () => {
  const { street, rails } = independentCrossing();
  let waited = false;
  for (let i = 0; i < 260; i++) {
    advanceIndependentCrossing(street, rails);
    assertCrossingClear(street, rails);
    waited ||= street.vehicles[0].currentSpeed < 0.3;
  }
  assert.ok(
    waited,
    "street traffic waits outside the approaching tram’s crossing",
  );
  assert.ok(
    street.vehicles[0].progress > 105,
    "the car resumes when the tram’s rear clears",
  );
  assert.ok(
    rails.vehicles[0].progress > 110,
    "tram priority does not deadlock both simulations",
  );

  const elevated = independentCrossing(8);
  for (let i = 0; i < 110; i++)
    advanceIndependentCrossing(elevated.street, elevated.rails);
  assert.ok(
    elevated.street.vehicles[0].progress > 101,
    "a rail overpass does not make ground cars wait",
  );
  assert.ok(elevated.street.vehicles[0].currentSpeed > 3.9);
  assert.ok(elevated.rails.vehicles[0].currentSpeed > 3.9);
});

test("an approaching tram yields to a car already occupying the crossing, then proceeds once it clears", () => {
  const { street, rails } = independentCrossing();
  const car = street.vehicles[0],
    tram = rails.vehicles[0];
  car.progress = 100;
  car.currentSpeed = car.cruiseSpeed = 0;
  for (let i = 0; i < 130; i++) {
    advanceIndependentCrossing(street, rails);
    assertCrossingClear(street, rails);
  }
  assert.ok(
    tram.currentSpeed < 0.1,
    "priority cannot enter an occupied crossing",
  );
  car.cruiseSpeed = 4;
  for (let i = 0; i < 220; i++) {
    advanceIndependentCrossing(street, rails);
    assertCrossingClear(street, rails);
  }
  assert.ok(car.progress > 105);
  assert.ok(
    tram.progress > 105,
    "both actors complete the crossing after it becomes clear",
  );
});
