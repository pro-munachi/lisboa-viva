import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInteriorScene,
  interiorLightingForMinute,
} from "../lib/city-interiors.js";
import { findRoomRoute } from "../lib/city-room-navigation.js";
const { Box3 } = require("three");

const kinds = ["home", "cafe", "gym", "shop", "museum", "bar"];
const expectedZones: Record<string, string[]> = {
  home: ["rest", "kitchen", "plan"],
  cafe: ["espresso", "pastry", "table"],
  gym: ["treadmill", "weights", "stretch"],
  shop: ["browse", "try-on", "counter"],
  museum: ["gallery", "tiles", "bench"],
  bar: ["listen", "counter", "lounge"],
};

function dispose(group: any) {
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
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

test("all six original rooms have finite detailed geometry, clickable props and bounded rendering cost without browser APIs", () => {
  for (const kind of kinds) {
    const room = createInteriorScene(kind, { shirt: "#c58951" });
    try {
      // The moving cone meshes need vertex bounds rather than the conservative
      // transformed AABB, which can extend above the actual fixture.
      const bounds = new Box3().setFromObject(room.group, true);
      assert.ok(bounds.min.x >= -9.2 && bounds.max.x <= 9.2);
      assert.ok(bounds.min.z >= -7.2 && bounds.max.z <= 7.2);
      assert.ok(bounds.max.y < 4);
      let meshes = 0,
        triangles = 0,
        floorCount = 0;
      const clickable = new Set<string>();
      room.group.traverse((node: any) => {
        if (!node.isMesh) return;
        meshes++;
        for (const attribute of Object.values(
          node.geometry.attributes,
        ) as any[])
          for (const value of attribute.array)
            assert.ok(
              Number.isFinite(value),
              `${kind} finite ${attribute.name || "attribute"}`,
            );
        triangles +=
          (node.geometry.index?.count ||
            node.geometry.attributes.position.count) / 3;
        if (node.userData.zone) clickable.add(node.userData.zone);
        if (node.userData.roomGround) floorCount++;
      });
      assert.equal(floorCount, 1);
      assert.ok(
        meshes <= 100,
        `${kind}: ${meshes} draw calls including residents`,
      );
      assert.ok(
        triangles > 6000 && triangles < 30000,
        `${kind}: ${triangles} triangles`,
      );
      assert.deepEqual(
        room.zones.map((zone: any) => zone.id),
        expectedZones[kind],
      );
      expectedZones[kind].forEach((id) =>
        assert.ok(clickable.has(id), `${kind}/${id} pickable`),
      );
      assert.equal(room.residents.length, kind === "home" ? 2 : 4);
      assert.equal(
        new Set(room.residents.map((npc: any) => npc.name)).size,
        room.residents.length,
      );
      assert.ok(
        room.residents.every(
          (npc: any) => npc.userData.npc.simulated && !npc.userData.peer,
        ),
      );
      assert.equal(room.group.userData.room.approximate, true);
    } finally {
      room.dispose();
      dispose(room.group);
    }
  }
});

test("all eighteen activity targets and transitions are reachable around actual furniture with avatar clearance", () => {
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
      const starts = [
        room.spawn,
        ...room.zones.map((zone: any) => zone.target),
      ];
      for (const start of starts)
        for (const zone of room.zones) {
          const route = findRoomRoute(start, zone.target, options);
          assert.ok(
            route.length,
            `${kind}/${zone.id} reachable from ${JSON.stringify(start)}`,
          );
          assert.deepEqual(route[0], start);
          assert.deepEqual(route[route.length - 1], zone.target);
        }
      for (const zone of room.zones) {
        if (!zone.seat) continue;
        assert.ok(
          [zone.seat.x, zone.seat.z, zone.seat.angle, zone.seat.height].every(
            Number.isFinite,
          ),
        );
        assert.ok(zone.seat.height > 0.4 && zone.seat.height < 1);
      }
    } finally {
      room.dispose();
      dispose(room.group);
    }
  }
});

test("added scenic locals stay outside furniture and activity targets with two owned meshes and paused head motion", () => {
  for (const kind of kinds) {
    const room = createInteriorScene(kind);
    try {
      const additions = room.residents.filter(
        (npc: any) => npc.userData.scenicHead,
      );
      assert.equal(additions.length, kind === "home" ? 1 : 2);
      for (const npc of additions) {
        let meshes = 0;
        npc.traverse((node: any) => {
          if (node.isMesh) meshes++;
        });
        assert.equal(meshes, 2, `${kind} extra local stays batched`);
        const { x, z } = npc.position;
        for (const obstacle of room.obstacles) {
          // Every resident has its own exact 0.58m blocker for live-peer placement.
          const own =
            Math.abs((obstacle.minX + obstacle.maxX) / 2 - x) < 1e-6 &&
            Math.abs((obstacle.minZ + obstacle.maxZ) / 2 - z) < 1e-6 &&
            Math.abs(obstacle.maxX - obstacle.minX - 0.58) < 1e-6;
          if (own) continue;
          assert.ok(
            !(
              x >= obstacle.minX - 0.32 &&
              x <= obstacle.maxX + 0.32 &&
              z >= obstacle.minZ - 0.32 &&
              z <= obstacle.maxZ + 0.32
            ),
            `${kind}/${npc.name} clears furniture`,
          );
        }
        for (const zone of room.zones)
          assert.ok(
            Math.hypot(x - zone.target.x, z - zone.target.z) > 0.85,
            `${kind}/${npc.name} leaves activity arrival clear`,
          );
      }
      const head = additions[0].userData.scenicHead;
      room.update(1, 0.1, true, null);
      const moving = head.rotation.y;
      room.update(2, 0.1, true, null);
      assert.notEqual(head.rotation.y, moving);
      const paused = head.rotation.y;
      room.update(20, 0, false, null);
      assert.equal(head.rotation.y, paused);
    } finally {
      room.dispose();
      dispose(room.group);
    }
  }
});

test("room updates animate residents and selected-zone poses while reduced motion keeps their pose time stable", () => {
  const room = createInteriorScene("gym");
  try {
    const runner = room.residents[1];
    const start = runner.position.toArray();
    for (let i = 0; i < 90; i++) room.update(i / 60, 1 / 60, true, "treadmill");
    assert.ok(Math.abs(runner.userData.rig.leftLeg.rotation.x) > 0.05);
    assert.equal(runner.userData.rig.rightArm.rotation.x, -0.35);
    assert.deepEqual(runner.position.toArray(), start);
    room.update(2, 0, false, null);
    const pausedHead = runner.userData.rig.head.rotation.y;
    for (let i = 0; i < 90; i++) room.update(20 + i, 0, false, null);
    assert.equal(runner.userData.rig.head.rotation.y, pausedHead);
    const ring = room.group.children.find(
      (node: any) => node.userData.interiorFocus,
    )!;
    assert.equal(ring.visible, false);
    const restaurant = createInteriorScene("restaurant");
    assert.equal(restaurant.group.userData.room.kind, "cafe");
    restaurant.dispose();
    dispose(restaurant.group);
  } finally {
    room.dispose();
    dispose(room.group);
  }
});

test("all nine rooms receive bounded warm night lamps while the city-time bar palette stays subdued and readable", () => {
  for (const kind of [...kinds, "airport", "station", "bus-stop"]) {
    const room = createInteriorScene(kind);
    try {
      const lamps: any[] = [];
      room.group.traverse((node: any) => {
        if (node.userData.interiorLamp) lamps.push(node);
      });
      assert.equal(lamps.length, 2);
      const dayIntensity = lamps[0].intensity;
      room.setNight(1);
      assert.ok(lamps.every((lamp) => lamp.intensity > dayIntensity));
      assert.ok(
        lamps.every((lamp) => lamp.intensity <= 27 && !lamp.castShadow),
      );
      assert.ok(lamps.every((lamp) => lamp.color.r > lamp.color.b));
      room.setNight(Infinity);
      assert.equal(lamps[0].intensity, dayIntensity);
      const day = interiorLightingForMinute(660, kind),
        night = interiorLightingForMinute(60, kind);
      assert.equal(day.night, 0);
      assert.equal(night.night, 1);
      assert.equal(night.minute, 60);
      assert.ok(day.sunIntensity > night.sunIntensity);
      assert.ok(night.hemisphereIntensity >= 0.7);
      assert.ok(
        [day.exposure, night.exposure, night.sunIntensity].every(
          Number.isFinite,
        ),
      );
      if (kind === "bar") {
        assert.ok(
          day.sunIntensity <
            interiorLightingForMinute(660, "home").sunIntensity,
        );
        assert.ok(
          room.group.children.some((node: any) => node.userData.clubLighting),
        );
      } else {
        assert.ok(
          !room.group.children.some((node: any) => node.userData.clubLighting),
        );
        assert.notEqual(day.hemisphereSky, night.hemisphereSky);
      }
    } finally {
      room.dispose();
      dispose(room.group);
    }
  }
  assert.equal(interiorLightingForMinute(-1, "bar").minute, 1439);
  assert.equal(interiorLightingForMinute(NaN).minute, 660);
});
