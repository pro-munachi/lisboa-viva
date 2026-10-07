import { test } from "node:test";
import assert from "node:assert/strict";
import { createInteriorScene } from "../lib/city-interiors.js";
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
      const bounds = new Box3().setFromObject(room.group);
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
      assert.ok(room.residents.length >= 1 && room.residents.length <= 2);
      assert.equal(room.group.userData.room.approximate, true);
    } finally {
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
    dispose(restaurant.group);
  } finally {
    dispose(room.group);
  }
});
