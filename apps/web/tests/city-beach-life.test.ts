import { test } from "node:test";
import assert from "node:assert/strict";
import { createBeachLife, updateBeachLife } from "../lib/city-beach-life.js";

const projectGeo = ([x, z]: number[]) => ({ x, z });
const ring = [
  [-100, -100],
  [100, -100],
  [100, 100],
  [-100, 100],
  [-100, -100],
];
const chunk = {
  bounds: [-100, -100, 100, 100],
  buildings: [],
  roads: [],
  surfaces: [{ id: 42, kind: "sand", ring }],
};
const options = {
  projectGeo,
  geoY: ([x, z]: number[]) => x * 0.001 + z * 0.001,
  focusPoint: [0, 0],
};
const inside = (x: number, z: number, points: number[][]) => {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
};
function release(group: any) {
  const resources = new Set<any>();
  group.traverse((node: any) => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      if (material) resources.add(material);
  });
  const counts = new Map<any, number>();
  for (const resource of resources)
    resource.addEventListener("dispose", () =>
      counts.set(resource, (counts.get(resource) || 0) + 1),
    );
  resources.forEach((resource) => resource.dispose());
  assert.equal(counts.size, resources.size);
  assert.ok([...counts.values()].every((count) => count === 1));
}

test("roomy mapped beach has a bounded holiday crowd, distinct poses, striped shades and clear aisles", () => {
  const original = JSON.stringify(chunk),
    group = createBeachLife(chunk, options);
  try {
    const state = group.userData.beachLife;
    assert.equal(state.arrangements, 40);
    assert.equal(state.people, 32);
    assert.equal(state.walkers, 6);
    assert.equal(state.loungers, 80);
    assert.equal(state.canopies, 6);
    assert.equal(state.parasols, 34);
    assert.equal(state.towels, 40);
    assert.equal(state.resting, 26);
    assert.ok(
      state.drawCalls <= 128,
      "resting people and furniture remain two batches",
    );
    assert.equal(
      group.getObjectByName(
        "Striped beach shades, loungers and picnic belongings",
      )!.type,
      "Mesh",
    );
    assert.equal(
      group.getObjectByName("Resting and chatting scenic beachgoers")!.type,
      "Mesh",
    );
    assert.deepEqual(
      new Set(state.actors.map((actor: any) => actor.pose)),
      new Set(["lounging", "seated", "chatting", "walking"]),
    );
    assert.equal(
      new Set(state.actors.map((actor: any) => actor.bodyType)).size,
      2,
    );
    assert.ok(new Set(state.actors.map((actor: any) => actor.skin)).size >= 4);
    assert.ok(state.actors.some((actor: any) => actor.ageBand === "elder"));
    for (const child of state.actors.filter(
      (actor: any) => actor.ageBand === "child",
    )) {
      assert.ok(
        state.actors.some(
          (adult: any) =>
            adult.groupId === child.groupId &&
            adult.ageBand === "adult" &&
            Math.hypot(adult.x - child.x, adult.z - child.z) < 4,
        ),
      );
    }
    for (const plot of state.plots) {
      assert.ok(
        Math.abs(plot.xLocal) > 5.7 && Math.abs(plot.zLocal) > 5.7,
        "arrival cross aisle stays open",
      );
      assert.ok(plot.x > -100 && plot.x < 100 && plot.z > -100 && plot.z < 100);
    }
    let sunhats = 0;
    group.traverse((node: any) => {
      if (node.name === "Beach sunhat") sunhats++;
      if (!node.geometry) return;
      for (const attribute of Object.values(node.geometry.attributes) as any[])
        for (const value of attribute.array) assert.ok(Number.isFinite(value));
    });
    assert.ok(sunhats > 0);
    assert.equal(JSON.stringify(chunk), original);
  } finally {
    release(group);
  }
});

test("all furnishings fit concave sand and avoid holes, mapped buildings, driving roads and the water edge", () => {
  const shape = [
    [-80, -80],
    [80, -80],
    [80, 80],
    [20, 80],
    [20, 15],
    [-80, 15],
    [-80, -80],
  ];
  const hole = [
    [-15, -45],
    [8, -45],
    [8, -20],
    [-15, -20],
    [-15, -45],
  ];
  const building = [
    [35, -60],
    [58, -60],
    [58, -25],
    [35, -25],
    [35, -60],
  ];
  const source = {
    bounds: [-80, -80, 80, 80],
    surfaces: [{ id: 43, kind: "sand", ring: shape, holes: [hole] }],
    buildings: [{ id: 2, ring: building }],
    roads: [
      {
        kind: "residential",
        width: 6,
        points: [
          [-80, -65],
          [80, -65],
        ],
      },
    ],
  };
  const group = createBeachLife(source, {
    ...options,
    focusPoint: [25, -5],
    waterAt: (point: any) => point.x > 65,
  });
  try {
    assert.ok(group.userData.beachLife.arrangements >= 18);
    const mesh: any = group.getObjectByName(
      "Striped beach shades, loungers and picnic belongings",
    );
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      assert.ok(inside(x, z, shape), `furnishing outside sand at ${x}, ${z}`);
      assert.equal(inside(x, z, hole), false);
      assert.equal(inside(x, z, building), false);
      assert.ok(Math.abs(z + 65) >= 3, "driving lane remains empty");
      assert.ok(x <= 65, "no furniture reaches water");
    }
    for (const actor of group.userData.beachLife.animatedActors) {
      for (let frame = 0; frame < 600; frame++) {
        updateBeachLife(group, 0.05, frame * 0.05, true);
        assert.ok(inside(actor.x, actor.z, shape));
        assert.equal(inside(actor.x, actor.z, hole), false);
        assert.equal(inside(actor.x, actor.z, building), false);
        assert.ok(Math.abs(actor.z + 65) > 3.4 && actor.x < 65);
      }
    }
  } finally {
    release(group);
  }
});

test("chunk ownership deduplicates overlapping source polygons and placement is deterministic", () => {
  const first = createBeachLife(
    { ...chunk, bounds: [-100, -100, 0, 100] },
    options,
  );
  const second = createBeachLife(
    { ...chunk, bounds: [0, -100, 100, 100] },
    options,
  );
  const repeat = createBeachLife(
    { ...chunk, bounds: [0, -100, 100, 100] },
    options,
  );
  try {
    for (const plot of first.userData.beachLife.plots) assert.ok(plot.x < 0);
    for (const plot of second.userData.beachLife.plots) assert.ok(plot.x >= 0);
    const left = new Set(
      first.userData.beachLife.plots.map((plot: any) => `${plot.x}:${plot.z}`),
    );
    assert.ok(
      second.userData.beachLife.plots.every(
        (plot: any) => !left.has(`${plot.x}:${plot.z}`),
      ),
    );
    assert.deepEqual(
      second.userData.beachLife.plots,
      repeat.userData.beachLife.plots,
    );
    assert.deepEqual(
      second.userData.beachLife.actors.map(
        ({ character, ...actor }: any) => actor,
      ),
      repeat.userData.beachLife.actors.map(
        ({ character, ...actor }: any) => actor,
      ),
    );
  } finally {
    release(first);
    release(second);
    release(repeat);
  }
});

test("narrow sand adapts population and unsupported or unsafe terrain stays empty", () => {
  const narrow = createBeachLife(
    {
      ...chunk,
      surfaces: [
        {
          id: 1,
          kind: "sand",
          ring: [
            [-18, -18],
            [18, -18],
            [18, 18],
            [-18, 18],
          ],
        },
      ],
    },
    options,
  );
  try {
    assert.ok(
      narrow.userData.beachLife.arrangements > 0 &&
        narrow.userData.beachLife.arrangements < 40,
    );
    assert.ok(
      narrow.userData.beachLife.people > 0 &&
        narrow.userData.beachLife.people < 32,
    );
  } finally {
    release(narrow);
  }
  for (const [source, config] of [
    [{ ...chunk, surfaces: [{ ...chunk.surfaces[0], kind: "park" }] }, options],
    [chunk, { ...options, waterAt: () => true }],
    [chunk, { ...options, geoY: ([x]: number[]) => x }],
    [chunk, { ...options, focusPoint: [1000, 1000] }],
    [chunk, { ...options, maxArrangements: 0 }],
  ] as any[]) {
    const group = createBeachLife(source, config);
    assert.equal(group.userData.beachLife.arrangements, 0);
    assert.equal(group.userData.beachLife.people, 0);
    assert.equal(group.children.length, 0);
    release(group);
  }
});

test("walking scenery stays bounded, pauses completely and creates no new resources during updates", () => {
  const group = createBeachLife(chunk, options);
  try {
    const actors = group.userData.beachLife.animatedActors;
    const snapshot = () =>
      actors.map((actor: any) => ({
        x: actor.x,
        y: actor.y,
        z: actor.z,
        angle: actor.angle,
        head: actor.character.userData.rig.head.rotation.y,
        time: actor.character.userData.lastTime,
      }));
    const before = snapshot(),
      nodes: any[] = [],
      geometry: any[] = [];
    group.traverse((node: any) => {
      nodes.push(node);
      if (node.geometry) geometry.push(node.geometry);
    });
    for (const [dt, time, motion] of [
      [0.1, 1, false],
      [0, 1, true],
      [-1, 1, true],
      [NaN, 1, true],
      [0.1, Infinity, true],
    ] as [number, number, boolean][])
      updateBeachLife(group, dt, time, motion);
    assert.deepEqual(snapshot(), before);
    for (let i = 0; i < 2000; i++) updateBeachLife(group, 0.05, i * 0.05, true);
    assert.notDeepEqual(snapshot(), before);
    for (const actor of actors) {
      assert.ok(
        Math.hypot(actor.x - actor.route.a.x, actor.z - actor.route.a.z) <=
          actor.route.length + 1e-7,
      );
      assert.ok(
        Math.hypot(actor.x - actor.route.b.x, actor.z - actor.route.b.z) <=
          actor.route.length + 1e-7,
      );
      assert.ok(Number.isFinite(actor.y));
      for (const occupied of group.userData.beachLife.reservations)
        assert.ok(
          Math.hypot(actor.x - occupied.x, actor.z - occupied.z) >=
            occupied.radius + 0.49,
        );
    }
    const afterNodes: any[] = [],
      afterGeometry: any[] = [];
    group.traverse((node: any) => {
      afterNodes.push(node);
      if (node.geometry) afterGeometry.push(node.geometry);
    });
    assert.deepEqual(afterNodes, nodes);
    assert.deepEqual(afterGeometry, geometry);
    assert.ok(
      actors.every(
        (actor: any) =>
          actor.person.simulated && actor.person.label.startsWith("Simulated"),
      ),
    );
  } finally {
    release(group);
  }
});
