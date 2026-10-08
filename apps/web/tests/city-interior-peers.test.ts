import { test } from "node:test";
import assert from "node:assert/strict";
import { createInteriorRuntime } from "../lib/city-interior-runtime.js";
import { VENUES } from "../lib/venues";
import type { InteriorKind } from "../lib/interiors";

const THREE = require("three");
const venueId = "node:11341409242";
const appearance = {
  outfitStyle: "jacket",
  topColor: "#b47459",
  bottomColor: "#34444f",
  hairStyle: "bun",
  hairColor: "#302823",
  skinTone: "#5b3d30",
  shoeColor: "#eee8df",
};
function peer(index: number, placeId: string | undefined = venueId) {
  return {
    id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    handle: `roamer_${index}`,
    userType: "tourist",
    latitude: 38.7061,
    longitude: -9.1459,
    area: "Cais do Sodré",
    placeId,
    distanceMetres: 0,
    lastSeenAt: "2026-10-07T21:00:00Z",
    appearance: { ...appearance },
  };
}

function harness() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1.6, 0.3, 90000);
  const controls = {
    target: new THREE.Vector3(),
    updates: 0,
    update() {
      this.updates++;
      camera.lookAt(this.target);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
    },
  };
  const events: any[] = [],
    zones: string[] = [],
    selectedPeers: any[] = [];
  const disposed: any[] = [];
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
    for (const resource of [...geometries, ...materials, ...textures])
      resource.dispose();
    group.removeFromParent();
    group.clear();
    disposed.push(group);
  }
  const runtime = createInteriorRuntime({
    scene,
    camera,
    controls,
    disposeGroup,
    shirt: "#c58e59",
    badgeHost: null,
    onZone: (id: string) => zones.push(id),
    onActivity: (event: any) => events.push({ ...event }),
    onPeer: (value: any) => selectedPeers.push(value),
  });
  function enter(kind: InteriorKind = "cafe", id = venueId) {
    runtime.enter(
      { id, name: `Test ${kind}`, kind },
      new THREE.Vector3(1200, 17, -3400),
    );
  }
  function room() {
    return scene.children.find((node: any) => node.userData.room)!;
  }
  function actors() {
    const group = room()?.children.find(
      (node: any) => node.name === "Nearby ROAM players",
    );
    return group?.children || [];
  }
  function localActor() {
    return room().children.find(
      (node: any) => node.userData.rig && !node.userData.npc,
    )!;
  }
  return {
    runtime,
    scene,
    camera,
    controls,
    events,
    zones,
    selectedPeers,
    disposed,
    enter,
    room,
    actors,
    localActor,
  };
}

function watchResources(group: any) {
  const resources = new Set<any>();
  group.traverse((node: any) => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : []) {
      resources.add(material);
      if (material.map) resources.add(material.map);
    }
  });
  const counts = new Map<any, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener("dispose", () =>
      counts.set(resource, counts.get(resource)! + 1),
    );
  }
  return counts;
}

test("interior peers require the exact canonical public venue and never appear at home or an invented room", () => {
  const h = harness();
  try {
    h.runtime.setPeers([
      peer(1),
      peer(2, "maat"),
      { ...peer(3), placeId: undefined },
      peer(4, "home"),
    ]);
    assert.equal(h.scene.children.length, 0);
    h.enter("cafe", "test-cafe");
    assert.equal(h.actors().length, 0);
    h.enter("home", venueId);
    assert.equal(
      h.actors().length,
      0,
      "even a public ID cannot make a home shared",
    );
    h.enter("cafe", venueId);
    assert.deepEqual(
      h.actors().map((actor: any) => actor.userData.peer.id),
      [peer(1).id],
    );
    h.enter("museum", "maat");
    assert.deepEqual(
      h.actors().map((actor: any) => actor.userData.peer.id),
      [peer(2).id],
    );
  } finally {
    h.runtime.dispose();
  }
});

test("real peers use their saved articulated appearance and malformed player records do not create fallback people", () => {
  const h = harness();
  try {
    h.enter();
    h.runtime.setPeers([
      peer(1),
      { ...peer(2), id: "invented-player" },
      { ...peer(3), appearance: undefined },
      { ...peer(4), handle: "" },
      { ...peer(5), appearance: { ...appearance, skinTone: "invalid" } },
      { ...peer(6), latitude: NaN },
      { ...peer(1), handle: "duplicate" },
    ]);
    assert.equal(h.actors().length, 1);
    const actor = h.actors()[0];
    assert.ok(actor.userData.rig);
    assert.equal(actor.userData.style, "jacket");
    assert.equal(actor.userData.hairStyle, "bun");
    const colors = new Set<string>();
    actor.traverse((node: any) => {
      if (node.material?.color)
        colors.add(`#${node.material.color.getHexString()}`);
      assert.equal(node.userData.peer.id, peer(1).id);
    });
    for (const color of [
      appearance.topColor,
      appearance.bottomColor,
      appearance.hairColor,
      appearance.skinTone,
      appearance.shoeColor,
    ])
      assert.ok(colors.has(color), `saved ${color} is used by the adult model`);
  } finally {
    h.runtime.dispose();
  }
});

test("at most twelve shared peers stand deterministically on connected clear floor outside furniture, activities and spawn", () => {
  const visits: [InteriorKind, string][] = [
    ["cafe", venueId],
    ["gym", VENUES.find((v) => v.category === "gym")!.id],
    ["shop", VENUES.find((v) => v.category === "shop")!.id],
    ["museum", "maat"],
    ["bar", VENUES.find((v) => v.category === "bar")!.id],
    ["airport", "transit-airport"],
    ["station", "transit-rossio"],
    ["bus-stop", "transit-cais-bus"],
  ];
  for (const [kind, id] of visits) {
    const first = harness(),
      second = harness();
    try {
      const roster = Array.from({ length: 17 }, (_, index) =>
        peer(index + 1, id),
      );
      first.runtime.setPeers(roster);
      second.runtime.setPeers([...roster].reverse());
      first.enter(kind, id);
      second.enter(kind, id);
      assert.equal(
        first.actors().length,
        12,
        `${kind} fits its bounded live roster`,
      );
      const state = (h: ReturnType<typeof harness>) =>
        h
          .actors()
          .map((actor: any) => [
            actor.userData.peer.id,
            actor.position.toArray(),
          ]);
      assert.deepEqual(
        state(first),
        state(second),
        `${kind} placement is independent of polling order`,
      );
      const room = first.room().userData.room,
        spawn = first.localActor().position;
      for (const actor of first.actors()) {
        const p = actor.position,
          radius = 0.38;
        assert.equal(p.y, 0.02);
        assert.ok(
          p.x >= room.bounds.minX + radius && p.x <= room.bounds.maxX - radius,
        );
        assert.ok(
          p.z >= room.bounds.minZ + radius && p.z <= room.bounds.maxZ - radius,
        );
        assert.ok(Math.hypot(p.x - spawn.x, p.z - spawn.z) >= 1.5);
        for (const obstacle of room.obstacles)
          assert.ok(
            !(
              p.x >= obstacle.minX - radius &&
              p.x <= obstacle.maxX + radius &&
              p.z >= obstacle.minZ - radius &&
              p.z <= obstacle.maxZ + radius
            ),
            `${kind} peer clears furniture`,
          );
        for (const other of first.actors())
          if (other !== actor)
            assert.ok(
              p.distanceTo(other.position) >= 1.3,
              `${kind} peers do not overlap`,
            );
      }
    } finally {
      first.runtime.dispose();
      second.runtime.dispose();
    }
  }
});

test("passive roster updates preserve actor resources, room camera and an active local activity", () => {
  const h = harness();
  try {
    h.enter("gym");
    const first = peer(1),
      second = peer(2);
    h.runtime.setPeers([first, second]);
    h.runtime.perform("weights", 2000);
    for (
      let frame = 0;
      frame < 1200 && h.events.at(-1)?.state !== "active";
      frame++
    )
      h.runtime.update(1 / 60, true);
    assert.equal(h.events.at(-1)?.state, "active");
    const actors = [...h.actors()],
      camera = h.camera.position.toArray(),
      target = h.controls.target.toArray();
    const local = h.localActor(),
      localPosition = local.position.toArray(),
      beforeEvents = h.events.length,
      beforeControls = h.controls.updates;
    const counts = watchResources(actors[0]);
    const latest = {
      ...first,
      lastSeenAt: "2026-10-07T21:00:10Z",
      distanceMetres: 17,
    };
    h.runtime.setPeers([second, latest]);
    assert.deepEqual(h.actors(), actors);
    assert.deepEqual(h.camera.position.toArray(), camera);
    assert.deepEqual(h.controls.target.toArray(), target);
    assert.equal(h.controls.updates, beforeControls);
    assert.equal(h.events.length, beforeEvents);
    assert.equal(h.localActor(), local);
    assert.deepEqual(local.position.toArray(), localPosition);
    assert.ok([...counts.values()].every((count) => count === 0));
    const mesh = actors[0].getObjectByProperty("isMesh", true);
    h.runtime.pick({ intersectObject: () => [{ object: mesh }] }, "walk");
    assert.equal(h.selectedPeers.at(-1).lastSeenAt, latest.lastSeenAt);
    assert.equal(h.selectedPeers.at(-1).distanceMetres, 17);
    for (
      let frame = 0;
      frame < 600 && h.events.at(-1)?.state !== "complete";
      frame++
    )
      h.runtime.update(1 / 60, true);
    assert.equal(h.events.at(-1)?.state, "complete");
    assert.equal(h.events.at(-1)?.zoneId, "weights");
  } finally {
    h.runtime.dispose();
  }
});

test("appearance and identity changes rebuild only the changed peer while leaving its floor placement and other peers stable", () => {
  const h = harness();
  try {
    h.enter();
    const one = peer(1),
      two = peer(2);
    h.runtime.setPeers([one, two]);
    const first = h.actors()[0],
      other = h.actors()[1],
      position = first.position.toArray();
    const counts = watchResources(first);
    const changed = {
      ...one,
      appearance: { ...one.appearance, topColor: "#687f73" },
    };
    h.runtime.setPeers([changed, two]);
    const replacement = h
      .actors()
      .find((actor: any) => actor.userData.peer.id === one.id);
    assert.notEqual(replacement, first);
    assert.deepEqual(replacement.position.toArray(), position);
    assert.equal(
      h.actors().find((actor: any) => actor.userData.peer.id === two.id),
      other,
    );
    assert.ok([...counts.values()].every((count) => count === 1));
    h.runtime.setPeers([{ ...changed, handle: "updated_handle" }, two]);
    assert.notEqual(
      h.actors().find((actor: any) => actor.userData.peer.id === one.id),
      replacement,
    );
    assert.equal(
      h.actors().find((actor: any) => actor.userData.peer.id === two.id),
      other,
    );
  } finally {
    h.runtime.dispose();
  }
});

test("a real raycast and a tagged name label select the latest peer before room activity zones", () => {
  const h = harness();
  try {
    h.enter();
    h.runtime.setPeers([peer(1)]);
    const actor = h.actors()[0];
    h.room().updateMatrixWorld(true);
    const centre = actor
      .getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0, 1.15, 0));
    const ray = new THREE.Raycaster(
      centre.clone().add(new THREE.Vector3(0, 0, 4)),
      new THREE.Vector3(0, 0, -1),
      0,
      8,
    );
    assert.ok(
      ray.intersectObject(actor, true).length > 0,
      "actual articulated meshes are hit targets",
    );
    const beforeZones = h.zones.length,
      beforeEvents = h.events.length;
    assert.equal(h.runtime.pick(ray, "walk"), true);
    assert.equal(h.selectedPeers.at(-1).id, peer(1).id);
    const mesh = actor.getObjectByProperty("isMesh", true);
    h.runtime.pick(
      {
        intersectObject: () => [
          { object: { userData: { zone: "espresso" } } },
          { object: mesh },
        ],
      },
      "walk",
    );
    assert.equal(h.selectedPeers.length, 2);
    assert.equal(h.zones.length, beforeZones);
    assert.equal(
      h.events.length,
      beforeEvents,
      "peer clicks do not trigger walking or an activity",
    );
  } finally {
    h.runtime.dispose();
  }
});

test("departure, leaving the room and teardown release every peer resource exactly once and retain only the latest outside roster", () => {
  const h = harness();
  h.enter();
  h.runtime.setPeers([peer(1), peer(2)]);
  const removed = h.actors()[0],
    remaining = h.actors()[1];
  const removedCounts = watchResources(removed),
    remainingCounts = watchResources(remaining);
  h.runtime.setPeers([{ ...peer(1), placeId: "maat" }, peer(2)]);
  assert.deepEqual(h.actors(), [remaining]);
  assert.ok([...removedCounts.values()].every((count) => count === 1));
  h.runtime.clear();
  assert.ok([...remainingCounts.values()].every((count) => count === 1));
  h.runtime.setPeers([peer(3)]);
  assert.equal(h.scene.children.length, 0);
  h.enter();
  assert.deepEqual(
    h.actors().map((actor: any) => actor.userData.peer.id),
    [peer(3).id],
  );
  const finalCounts = watchResources(h.actors()[0]);
  h.runtime.dispose();
  h.runtime.clear();
  h.runtime.dispose();
  h.runtime.setPeers([peer(4)]);
  h.enter();
  assert.equal(h.scene.children.length, 0);
  for (const counts of [removedCounts, remainingCounts, finalCounts])
    assert.ok([...counts.values()].every((count) => count === 1));
});

test("browser-only peer labels are owned canvas textures and dispose once; headless rooms need no browser API", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const context = {
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    roundRect() {},
    rect() {},
    fill() {},
    fillText() {},
    measureText: () => ({ width: 200 }),
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    },
  });
  const h = harness();
  try {
    h.enter();
    h.runtime.setPeers([peer(1)]);
    const actor = h.actors()[0],
      label = actor.children.find((node: any) => node.isSprite);
    assert.ok(label?.material.map.isCanvasTexture);
    assert.equal(label.name, "@roamer_1");
    let disposals = 0;
    label.material.map.addEventListener("dispose", () => disposals++);
    h.runtime.pick({ intersectObject: () => [{ object: label }] }, "view");
    assert.equal(h.selectedPeers.at(-1).id, peer(1).id);
    h.runtime.clear();
    h.runtime.dispose();
    assert.equal(disposals, 1);
  } finally {
    h.runtime.dispose();
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete (globalThis as any).document;
  }
});
