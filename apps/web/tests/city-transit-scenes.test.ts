import { test } from "node:test";
import assert from "node:assert/strict";
import { createInteriorScene } from "../lib/city-interiors.js";
import { createInteriorRuntime } from "../lib/city-interior-runtime.js";
import { findRoomRoute } from "../lib/city-room-navigation.js";
import {
  INTERIOR_ACTIVITIES,
  INTERIOR_LABELS,
  type InteriorKind,
} from "../lib/interiors";
const THREE = require("three");
type TransitKind = Extract<InteriorKind, "airport" | "station" | "bus-stop">;
const expected: Record<TransitKind, string[]> = {
  airport: ["card", "check-in", "gate"],
  station: ["card", "tickets", "platform"],
  "bus-stop": ["card", "timetable", "board"],
};
const kinds = Object.keys(expected) as TransitKind[];

function dispose(group: any) {
  const geometries = new Set<any>(),
    materials = new Set<any>(),
    textures = new Set<any>();
  group.traverse((node: any) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const mat of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : []) {
      materials.add(mat);
      if (mat.map) textures.add(mat.map);
    }
  });
  geometries.forEach((resource) => resource.dispose());
  materials.forEach((resource) => resource.dispose());
  textures.forEach((resource) => resource.dispose());
  group.removeFromParent();
  group.clear();
}

test("three transit scenes are original detailed finite builds with nine real clickable catalog zones and bounded draw cost", () => {
  for (const kind of kinds) {
    const room = createInteriorScene(kind);
    try {
      assert.equal(room.group.userData.room.kind, kind);
      assert.equal(room.group.userData.room.approximate, true);
      assert.equal(room.group.userData.room.transit, true);
      assert.ok(INTERIOR_LABELS[kind]);
      assert.deepEqual(
        room.zones.map((zone: any) => zone.id),
        expected[kind],
      );
      assert.deepEqual(
        INTERIOR_ACTIVITIES[kind].map((activity) => activity.id),
        expected[kind],
      );
      const clickable = new Set<string>();
      let meshes = 0,
        triangles = 0,
        floors = 0;
      room.group.traverse((node: any) => {
        if (!node.isMesh) return;
        meshes++;
        if (node.userData.roomGround) floors++;
        if (node.userData.zone) clickable.add(node.userData.zone);
        for (const attribute of Object.values(
          node.geometry.attributes,
        ) as any[])
          for (const value of attribute.array)
            assert.ok(Number.isFinite(value), `${kind} has finite geometry`);
        triangles +=
          (node.geometry.index?.count ||
            node.geometry.attributes.position.count) / 3;
      });
      assert.equal(floors, 1);
      assert.ok(
        meshes <= 120,
        `${kind} ${meshes} draw calls including two residents`,
      );
      assert.ok(
        triangles >= 5000 && triangles < 40000,
        `${kind} ${triangles} triangles`,
      );
      assert.deepEqual([...clickable].sort(), [...expected[kind]].sort());
      assert.equal(room.residents.length, 2);
      assert.ok(
        room.residents.every(
          (actor: any) => actor.userData.rig && actor.userData.npc.simulated,
        ),
      );
      assert.ok("actorSpawn" in room && "blockers" in room);
      assert.deepEqual(room.actorSpawn, room.spawn);
      assert.equal(room.blockers, room.obstacles);
      for (const activity of INTERIOR_ACTIVITIES[kind]) {
        assert.ok(
          activity.actionLabel.length >= 7 && activity.actionLabel.length <= 30,
        );
        assert.ok(
          activity.description.length > 25 && activity.result.length > 25,
        );
        assert.ok(
          activity.durationMs &&
            activity.durationMs >= 2000 &&
            activity.durationMs <= 8000,
        );
      }
    } finally {
      dispose(room.group);
    }
  }
});

test("all nine transit targets and transitions are reachable around vehicles, luggage and furniture with .35m clearance", () => {
  for (const kind of kinds) {
    const room = createInteriorScene(kind);
    try {
      const b = room.bounds;
      const options = {
        bounds: [b.minX, b.minZ, b.maxX, b.maxZ],
        obstacles: room.obstacles,
        clearance: 0.35,
        cellSize: 0.4,
      };
      for (const start of [
        room.spawn,
        ...room.zones.map((zone: any) => zone.target),
      ])
        for (const zone of room.zones) {
          const route = findRoomRoute(start, zone.target, options);
          assert.ok(
            route.length,
            `${kind}/${zone.id} is reachable from ${JSON.stringify(start)}`,
          );
          assert.deepEqual(route[0], start);
          assert.deepEqual(route.at(-1), zone.target);
        }
    } finally {
      dispose(room.group);
    }
  }
});

test("transit residents preserve paused poses and the existing runtime can walk and complete all nine visual actions", () => {
  for (const kind of kinds) {
    const room = createInteriorScene(kind);
    try {
      room.update(1, 0.08, true, expected[kind][0]);
      const rotations = room.residents.map((actor: any) =>
        actor.userData.rig.head.rotation.toArray(),
      );
      for (let i = 0; i < 90; i++)
        room.update(20 + i, 0.1, false, expected[kind][0]);
      assert.deepEqual(
        room.residents.map((actor: any) =>
          actor.userData.rig.head.rotation.toArray(),
        ),
        rotations,
      );
    } finally {
      dispose(room.group);
    }
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(43, 1.6, 0.3, 90000),
      events: { state: string; zoneId: string | null }[] = [];
    const controls = {
      target: new THREE.Vector3(),
      update() {
        camera.lookAt(this.target);
        camera.updateMatrixWorld();
      },
    };
    const runtime = createInteriorRuntime({
      scene,
      camera,
      controls,
      disposeGroup: dispose,
      shirt: "#b68758",
      onZone() {},
      onActivity: (event: any) => events.push({ ...event }),
      badgeHost: null,
    });
    try {
      runtime.enter(
        { id: `transit-${kind}`, name: "Original ROAM transit scene", kind },
        new THREE.Vector3(1000, 40, -900),
      );
      for (const zoneId of expected[kind]) {
        const before = events.length;
        runtime.perform(zoneId, 2000);
        for (let i = 0; i < 1800 && events.at(-1)?.state !== "complete"; i++)
          runtime.update(1 / 60, true);
        assert.deepEqual(
          events.slice(before).map((event) => event.state),
          ["walking", "active", "complete"],
          `${kind}/${zoneId}`,
        );
        assert.equal(events.at(-1)?.zoneId, zoneId);
      }
    } finally {
      runtime.dispose();
    }
    assert.equal(scene.children.length, 0);
  }
});
