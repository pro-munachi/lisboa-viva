import { test } from "node:test";
import assert from "node:assert/strict";
import { createInteriorRuntime } from "../lib/city-interior-runtime.js";
import { INTERIOR_ACTIVITIES, type InteriorKind } from "../lib/interiors";

const THREE = require("three");
type ActivityEvent = { state: string; zoneId: string | null; error?: string };
const kinds: InteriorKind[] = ["home", "cafe", "gym", "shop", "museum", "bar"];

function harness() {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(43, 1.6, 0.3, 90000),
    controls = { target: new THREE.Vector3(), update() {} },
    events: ActivityEvent[] = [],
    zones: string[] = [],
    disposed: {
      group: any;
      geometries: number;
      materials: number;
      textures: number;
    }[] = [];
  const exterior = new THREE.Group();
  exterior.position.set(30, 8, -12);
  scene.add(exterior);
  function disposeGroup(group: any) {
    const geometries = new Set<any>(),
      materials = new Set<any>(),
      textures = new Set<any>();
    group.traverse((node: any) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : []) {
        materials.add(material);
        if (material.map) textures.add(material.map);
      }
    });
    const counts = { group, geometries: 0, materials: 0, textures: 0 };
    for (const [resources, key] of [
      [geometries, "geometries"],
      [materials, "materials"],
      [textures, "textures"],
    ] as const)
      for (const resource of resources) {
        resource.addEventListener("dispose", () => counts[key]++);
        resource.dispose();
      }
    assert.equal(counts.geometries, geometries.size);
    assert.equal(counts.materials, materials.size);
    assert.equal(counts.textures, textures.size);
    disposed.push(counts);
    group.removeFromParent();
    group.clear();
  }
  const runtime = createInteriorRuntime({
    scene,
    camera,
    controls,
    disposeGroup,
    shirt: "#c58e59",
    onZone: (id: string) => zones.push(id),
    onActivity: (event: ActivityEvent) => events.push({ ...event }),
  });
  const group = () => {
    const result = scene.children.find((node: any) => node.userData.room);
    assert.ok(result, "the current room is attached to the scene");
    return result;
  };
  const actor = () => {
    const result = group().children.find(
      (node: any) => node.userData.rig && !node.userData.npc,
    );
    assert.ok(
      result,
      "the visitor uses the actual articulated character model",
    );
    return result;
  };
  const enter = (
    kind: InteriorKind,
    origin = new THREE.Vector3(1200, 17, -3400),
  ) => {
    runtime.enter({ id: `test-${kind}`, name: `Test ${kind}`, kind }, origin);
    return origin;
  };
  return {
    runtime,
    scene,
    camera,
    controls,
    events,
    zones,
    disposed,
    exterior,
    group,
    actor,
    enter,
  };
}

function assertClearFloor(actor: any, group: any) {
  const room = group.userData.room,
    radius = 0.28,
    p = actor.position;
  assert.ok(
    p.x >= room.bounds.minX + radius && p.x <= room.bounds.maxX - radius,
  );
  assert.ok(
    p.z >= room.bounds.minZ + radius && p.z <= room.bounds.maxZ - radius,
  );
  for (const obstacle of room.obstacles) {
    assert.ok(
      !(
        p.x >= obstacle.minX - radius &&
        p.x <= obstacle.maxX + radius &&
        p.z >= obstacle.minZ - radius &&
        p.z <= obstacle.maxZ + radius
      ),
      `visitor cleared furniture at ${p.x}, ${p.z}`,
    );
  }
  assert.equal(p.y, 0.02);
}

function reach(
  h: ReturnType<typeof harness>,
  state: string,
  zoneId: string,
  limit = 1500,
) {
  for (let i = 0; i < limit; i++) {
    if (h.events.at(-1)?.state === state && h.events.at(-1)?.zoneId === zoneId)
      return;
    h.runtime.update(1 / 60, true);
  }
  assert.fail(
    `${zoneId} did not reach ${state}: ${JSON.stringify(h.events.at(-1))}`,
  );
}

test("all eighteen real room activities walk around furniture, become active and complete at a stable world origin", () => {
  let completed = 0;
  for (const kind of kinds) {
    const h = harness();
    try {
      const origin = h.enter(kind),
        roomGroup = h.group(),
        actor = h.actor();
      const worldOrigin = roomGroup.position.toArray(),
        exteriorOrigin = h.exterior.position.toArray();
      assert.equal(h.runtime.kind, kind);
      for (const activity of INTERIOR_ACTIVITIES[kind]) {
        const firstEvent = h.events.length;
        h.runtime.perform(activity.id, activity.durationMs);
        assert.equal(
          h.events.at(-1)?.state,
          "walking",
          `${kind}/${activity.id} begins walking`,
        );
        for (
          let frame = 0;
          frame < 1500 && h.events.at(-1)?.state === "walking";
          frame++
        ) {
          h.runtime.update(1 / 60, true);
          if (h.events.at(-1)?.state === "walking")
            assertClearFloor(actor, roomGroup);
          assert.deepEqual(roomGroup.position.toArray(), worldOrigin);
        }
        assert.equal(
          h.events.at(-1)?.state,
          "active",
          `${kind}/${activity.id} reaches its prop`,
        );
        assert.equal(h.events.at(-1)?.zoneId, activity.id);
        reach(h, "complete", activity.id);
        const sequence = h.events.slice(firstEvent);
        assert.deepEqual(
          sequence.map((event) => event.state),
          ["walking", "active", "complete"],
        );
        assertClearFloor(actor, roomGroup);
        assert.deepEqual(roomGroup.position.toArray(), worldOrigin);
        assert.deepEqual(origin.toArray(), worldOrigin);
        assert.deepEqual(h.exterior.position.toArray(), exteriorOrigin);
        assert.ok(actor.userData.rig.leftKnee && actor.userData.rig.rightElbow);
        completed++;
      }
    } finally {
      h.runtime.clear();
    }
  }
  assert.equal(completed, 18);
});

test("paused and zero-time updates freeze walking and activity completion until motion resumes", () => {
  const h = harness();
  try {
    h.enter("gym");
    h.runtime.perform("weights", 3000);
    h.runtime.update(0.05, true);
    const actor = h.actor(),
      position = actor.position.toArray(),
      angle = actor.rotation.y,
      joint = actor.userData.rig.leftLeg.rotation.x,
      count = h.events.length;
    for (let i = 0; i < 200; i++) h.runtime.update(1, false);
    assert.deepEqual(actor.position.toArray(), position);
    assert.equal(actor.rotation.y, angle);
    assert.equal(actor.userData.rig.leftLeg.rotation.x, joint);
    assert.equal(h.events.length, count);
    for (let i = 0; i < 200; i++) h.runtime.update(0, true);
    assert.deepEqual(actor.position.toArray(), position);
    assert.equal(h.events.length, count);
    reach(h, "active", "weights");
    const activeCount = h.events.length,
      activePosition = actor.position.toArray();
    for (let i = 0; i < 200; i++) {
      h.runtime.update(1, false);
      h.runtime.update(0, true);
    }
    assert.deepEqual(actor.position.toArray(), activePosition);
    assert.equal(h.events.length, activeCount);
    assert.equal(h.events.at(-1)?.state, "active");
    reach(h, "complete", "weights");
    assert.equal(
      h.events.filter((event) => event.state === "complete").length,
      1,
    );
  } finally {
    h.runtime.clear();
  }
});

test("repeated activity clicks and zone selection while busy cannot replace or duplicate the current action", () => {
  const h = harness();
  try {
    h.enter("gym");
    h.runtime.perform("weights", 3000);
    const walkingCount = h.events.length,
      selections = h.zones.length;
    for (let i = 0; i < 20; i++) {
      h.runtime.perform("weights", 12000);
      h.runtime.perform("stretch", 2000);
      h.runtime.selectZone("stretch");
    }
    assert.equal(h.events.length, walkingCount);
    assert.equal(h.zones.length, selections);
    reach(h, "active", "weights");
    const activeCount = h.events.length;
    for (let i = 0; i < 20; i++) h.runtime.perform("weights", 12000);
    assert.equal(h.events.length, activeCount);
    reach(h, "complete", "weights", 210);
    assert.deepEqual(
      h.events
        .filter((event) => event.state === "complete")
        .map((event) => event.zoneId),
      ["weights"],
    );
    h.runtime.perform("stretch", 2000);
    reach(h, "complete", "stretch");
  } finally {
    h.runtime.clear();
  }
});

test("seated activities place the articulated visitor on the actual seat and restore a clear floor target", () => {
  for (const [kind, id] of [
    ["home", "rest"],
    ["cafe", "table"],
    ["museum", "bench"],
    ["bar", "lounge"],
  ] as const) {
    const h = harness();
    try {
      h.enter(kind);
      const actor = h.actor(),
        zone = h.group().userData.zones.find((item: any) => item.id === id);
      assert.ok(zone.seat);
      h.runtime.perform(id, 2000);
      reach(h, "active", id);
      assert.equal(actor.position.x, zone.seat.x);
      assert.equal(actor.position.z, zone.seat.z);
      assert.equal(actor.rotation.y, zone.seat.angle);
      assert.ok(Math.abs(actor.userData.rig.leftLeg.rotation.x + 1.05) < 1e-8);
      const seatedHipHeight =
        actor.position.y + actor.userData.rig.hips.position.y * actor.scale.y;
      assert.ok(Math.abs(seatedHipHeight - (zone.seat.height + 0.04)) < 1e-8);
      reach(h, "complete", id);
      assert.ok(
        Math.hypot(
          actor.position.x - zone.target.x,
          actor.position.z - zone.target.z,
        ) < 0.03,
      );
      assertClearFloor(actor, h.group());
      h.runtime.update(0.1, true);
      assert.ok(
        Math.abs(actor.userData.rig.hips.position.y - actor.userData.restHipY) <
          0.015,
      );
    } finally {
      h.runtime.clear();
    }
  }
});

test("switching rooms or exiting cancels previous completion and releases the removed room exactly once", () => {
  for (const phase of ["walking", "active"]) {
    const h = harness();
    try {
      h.enter("gym");
      h.runtime.perform("weights", 12000);
      if (phase === "active") reach(h, "active", "weights");
      const oldRoom = h.group();
      const nextOrigin = new THREE.Vector3(-500, 40, 900);
      h.enter("home", nextOrigin);
      assert.equal(oldRoom.parent, null);
      assert.equal(oldRoom.children.length, 0);
      assert.equal(h.disposed.length, 1);
      assert.ok(h.disposed[0].geometries > 0 && h.disposed[0].materials > 0);
      assert.equal(h.disposed[0].group, oldRoom);
      assert.equal(h.runtime.kind, "home");
      assert.deepEqual(h.group().position.toArray(), nextOrigin.toArray());
      for (let i = 0; i < 300; i++) h.runtime.update(0.1, true);
      assert.equal(
        h.events.filter(
          (event) => event.state === "complete" && event.zoneId === "weights",
        ).length,
        0,
      );
      h.runtime.perform("kitchen", 2000);
      reach(h, "active", "kitchen");
      const currentRoom = h.group(),
        beforeClear = h.events.length;
      h.runtime.clear();
      assert.equal(h.runtime.active, false);
      assert.equal(h.runtime.kind, undefined);
      assert.equal(currentRoom.parent, null);
      assert.equal(currentRoom.children.length, 0);
      assert.equal(h.disposed.length, 2);
      for (let i = 0; i < 300; i++) h.runtime.update(0.1, true);
      assert.equal(h.events.length, beforeClear);
      h.runtime.clear();
      assert.equal(h.disposed.length, 2);
      assert.deepEqual(h.scene.children, [h.exterior]);
    } finally {
      h.runtime.clear();
    }
  }
});
