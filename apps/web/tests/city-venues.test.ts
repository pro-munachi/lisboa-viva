import { test } from "node:test";
import assert from "node:assert/strict";
import { createVenueDecorations } from "../lib/city-venues.js";

const categories = ["cafe", "restaurant", "gym", "shop", "bar", "culture"];
const projectGeo = ([x, z]: number[]) => ({ x, z });
const geoY = ([x, z]: number[]) => x * 0.01 + z * 0.003;

function withCanvas(run: () => void) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(name: string) {
        assert.equal(name, "canvas");
        const context = new Proxy(
          { measureText: (value: string) => ({ width: value.length * 8 }) },
          { get: (target: any, key) => target[key] || (() => {}) },
        );
        return { width: 0, height: 0, getContext: () => context };
      },
    },
  });
  try {
    run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

function fixtures(count = 6) {
  const chunk = {
    bounds: [0, 0, 1800, 100],
    buildings: Array.from({ length: count }, (_, i) => {
      const x = 30 + i * 50;
      return {
        id: i + 1,
        kind: "retail",
        height: 12,
        ring: [
          [x, 35],
          [x + 12, 35],
          [x + 12, 55],
          [x, 55],
          [x, 35],
        ],
      };
    }),
    roads: [
      {
        kind: "residential",
        width: 5,
        points: [
          [0, 29],
          [1800, 29],
        ],
      },
    ],
  };
  const venues = Array.from({ length: count }, (_, i) => ({
    id: `node:${i + 1}`,
    name: `Mapped place ${i + 1}`,
    category: categories[i % categories.length],
    point: [36 + i * 50, 35.4],
  }));
  return { chunk, venues };
}

function release(group: any) {
  const resources = new Set<any>();
  group.traverse((node: any) => {
    if (node.geometry) resources.add(node.geometry);
    if (node.material) {
      resources.add(node.material);
      if (node.material.map) resources.add(node.material.map);
    }
  });
  resources.forEach((resource) => resource.dispose());
}

test("six mapped venue categories keep clickable source identities, finite grounded entrances and clear road corridors", () => {
  withCanvas(() => {
    const { chunk, venues } = fixtures();
    const original = JSON.stringify({ chunk, venues });
    const group = createVenueDecorations(chunk, venues, {
      projectGeo,
      geoY,
      focusPoint: [36, 35.4],
    });
    try {
      assert.equal(group.userData.venueDecorations.count, 6);
      assert.equal(group.userData.venueDecorations.mounted, 6);
      const signs: any[] = [];
      let meshes = 0,
        triangles = 0;
      group.updateMatrixWorld(true);
      group.traverse((node: any) => {
        if (!node.isMesh) return;
        meshes++;
        const position = node.geometry.attributes.position;
        for (const attribute of Object.values(
          node.geometry.attributes,
        ) as any[])
          for (const value of attribute.array)
            assert.ok(Number.isFinite(value));
        triangles += (node.geometry.index?.count || position.count) / 3;
        if (node.userData.hotspot) signs.push(node);
      });
      assert.equal(signs.length, venues.length);
      assert.equal(meshes, group.userData.venueDecorations.drawCalls);
      assert.ok(meshes <= 12);
      assert.ok(triangles < 12000);
      for (let i = 0; i < signs.length; i++) {
        const sign = signs[i];
        assert.equal(sign.userData.hotspot, venues[i]);
        assert.ok(Math.abs(sign.userData.venueView.normal.z + 1) < 1e-9);
        const facade = sign.parent.position;
        assert.ok(Math.abs(facade.z - 34.87) < 1e-7);
        assert.ok(
          Math.abs(facade.y - geoY([facade.x, facade.z]) - 0.12) < 1e-7,
        );
        for (const table of sign.userData.terraceTables) {
          assert.ok(Math.abs(table.z - 29) > 2.5 + 0.6);
          assert.ok(Math.abs(table.y - geoY([table.x, table.z]) - 0.17) < 1e-7);
        }
      }
      const entrances = group.getObjectByName(
        "Colorful mapped venue entrances",
      )!;
      assert.ok(entrances);
      assert.equal(entrances.material.vertexColors, true);
      const colors = entrances.geometry.attributes.color;
      assert.equal(colors.count, entrances.geometry.attributes.position.count);
      const tones = new Set<string>();
      for (let i = 0; i < colors.count; i++)
        tones.add([colors.getX(i), colors.getY(i), colors.getZ(i)].join(","));
      assert.ok(
        tones.size >= 12,
        "category entries retain contrasting colors after batching",
      );
      assert.equal(JSON.stringify({ chunk, venues }), original);
    } finally {
      release(group);
    }
  });
});

test("busy streets cap local venue details at 24 and preserve per-place picking while batching furnishings", () => {
  withCanvas(() => {
    const { chunk, venues } = fixtures(32);
    const group = createVenueDecorations(chunk, venues, {
      projectGeo,
      geoY,
      focusPoint: [36, 35.4],
    });
    try {
      assert.equal(group.userData.venueDecorations.count, 24);
      assert.equal(group.userData.venueDecorations.mounted, 24);
      assert.ok(group.userData.venueDecorations.tables <= 24);
      assert.ok(group.userData.venueDecorations.drawCalls <= 30);
      assert.deepEqual(
        group.userData.venueIds,
        venues.slice(0, 24).map((venue) => venue.id),
      );
      assert.equal(
        group.children.filter(
          (node: any) => node.name === "Colorful mapped venue entrances",
        ).length,
        1,
      );
    } finally {
      release(group);
    }
  });
});

test("beach scenery stays on its own mapped sand polygon and never becomes an inland storefront", () => {
  withCanvas(() => {
    const chunk = {
      bounds: [0, 0, 100, 100],
      buildings: [],
      roads: [],
      surfaces: [
        {
          id: 42,
          kind: "sand",
          ring: [
            [0, 0],
            [25, 0],
            [25, 25],
            [0, 25],
            [0, 0],
          ],
        },
      ],
    };
    const venues = [
      {
        id: "way:42",
        name: "Mapped coastal beach",
        category: "beach",
        point: [10, 10],
      },
      {
        id: "way:99",
        name: "Inland marker without matching beach sand",
        category: "beach",
        point: [70, 70],
      },
      {
        id: "way:43",
        name: "Unrelated sand is not a beach",
        category: "beach",
        point: [15, 15],
      },
    ];
    const group = createVenueDecorations(chunk, venues, {
      projectGeo,
      geoY,
      focusPoint: [10, 10],
    });
    try {
      assert.equal(group.userData.venueDecorations.rendered, 1);
      assert.equal(group.userData.venueDecorations.mounted, 0);
      assert.equal(group.userData.venueDecorations.beachScenes, 1);
      assert.equal(
        group.getObjectByName("Colorful mapped venue entrances"),
        undefined,
      );
      const furniture: any = group.getObjectByName(
        "Umbrellas on mapped beach sand",
      );
      assert.ok(furniture);
      assert.equal(furniture.material.vertexColors, true);
      const position = furniture.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        assert.ok(position.getX(i) >= 0 && position.getX(i) <= 25);
        assert.ok(position.getZ(i) >= 0 && position.getZ(i) <= 25);
        assert.ok(Number.isFinite(position.getY(i)));
      }
      const signs: any[] = [];
      group.traverse((node: any) => {
        if (node.userData.hotspot) signs.push(node);
      });
      assert.deepEqual(
        signs.map((sign) => sign.userData.hotspot.id),
        ["way:42"],
      );
      assert.ok(group.userData.venueDecorations.drawCalls <= 3);
    } finally {
      release(group);
    }
  });
});
