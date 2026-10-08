import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTravelMaterials,
  TRAVEL_TEXTURE_SIZE,
} from "../lib/travel-materials.js";

const THREE = require("three");

const kinds = ["fabric", "asphalt", "carpet", "aircraft"] as const;

test("travel maps are deterministic native pixels with a bounded half-megabyte allocation and no browser dependency", () => {
  const first = createTravelMaterials(),
    second = createTravelMaterials();
  try {
    const unique = new Set<any>();
    for (const kind of kinds) {
      const a = first[kind],
        b = second[kind];
      for (const name of ["map", "bumpMap", "roughnessMap"] as const) {
        const map = a[name];
        assert.ok(map.isDataTexture);
        assert.ok(map.image.data instanceof Uint8Array);
        assert.equal(map.image.width, TRAVEL_TEXTURE_SIZE);
        assert.equal(map.image.height, TRAVEL_TEXTURE_SIZE);
        assert.ok(map.image.width <= 128 && map.image.height <= 128);
        assert.equal(map.image.data.byteLength, 128 * 128 * 4);
        assert.deepEqual(map.image.data, b[name].image.data);
        assert.notEqual(
          map,
          b[name],
          "separate journeys own separate resources",
        );
        unique.add(map);
      }
    }
    assert.equal(
      unique.size,
      8,
      "height and roughness share one packed map per surface",
    );
    assert.equal(
      [...unique].reduce((sum, map) => sum + map.image.data.byteLength, 0),
      512 * 1024,
    );
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("colour and scalar travel maps tile with appropriate colour spaces, opaque alpha and independently varying physical channels", () => {
  const kit = createTravelMaterials();
  try {
    for (const kind of kinds) {
      const bundle = kit[kind],
        color = bundle.map,
        scalar = bundle.bumpMap;
      assert.equal(color.colorSpace, THREE.SRGBColorSpace);
      assert.equal(scalar.colorSpace, THREE.NoColorSpace);
      assert.equal(bundle.bumpMap, bundle.roughnessMap);
      for (const map of [color, scalar]) {
        assert.equal(map.wrapS, THREE.RepeatWrapping);
        assert.equal(map.wrapT, THREE.RepeatWrapping);
        assert.ok(map.repeat.x >= 1 && map.repeat.y >= 1);
        assert.deepEqual(map.repeat.toArray(), color.repeat.toArray());
        assert.equal(map.magFilter, THREE.LinearFilter);
        assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter);
        assert.ok(
          map.generateMipmaps,
          "fine detail uses mipmaps at a distant camera",
        );
        for (let index = 3; index < map.image.data.length; index += 4)
          assert.equal(map.image.data[index], 255);
      }
      const height = new Set<number>(),
        roughness = new Set<number>(),
        reflectance = new Set<number>();
      for (let index = 0; index < scalar.image.data.length; index += 4) {
        height.add(scalar.image.data[index]);
        roughness.add(scalar.image.data[index + 1]);
        reflectance.add(color.image.data[index]);
      }
      assert.ok(
        height.size > 3 && roughness.size >= 3 && reflectance.size > 3,
        `${kind} has restrained surface detail`,
      );
      assert.ok(
        Math.max(...height) - Math.min(...height) < 60,
        `${kind} height does not become coarse displacement`,
      );
      assert.ok(
        Math.max(...reflectance) - Math.min(...reflectance) < 30,
        `${kind} keeps the material's original tint`,
      );
    }
    assert.notDeepEqual(kit.fabric.map.image.data, kit.carpet.map.image.data);
    assert.notDeepEqual(
      kit.asphalt.bumpMap.image.data,
      kit.aircraft.bumpMap.image.data,
    );
    const paint = kit.aircraft.map.image.data;
    for (let index = 0; index < paint.length; index += 4)
      assert.ok(
        paint[index] >= 244,
        "aircraft panel joins do not overwhelm the livery",
      );
  } finally {
    kit.dispose();
  }
});

test("the travel kit owns and disposes every shared texture exactly once without invalidating another journey", () => {
  const first = createTravelMaterials(),
    other = createTravelMaterials();
  const firstCounts = new Map<any, number>(),
    otherCounts = new Map<any, number>();
  for (const [kit, counts] of [
    [first, firstCounts],
    [other, otherCounts],
  ] as const)
    for (const kind of kinds)
      for (const texture of [kit[kind].map, kit[kind].bumpMap]) {
        counts.set(texture, 0);
        texture.addEventListener("dispose", () =>
          counts.set(texture, counts.get(texture)! + 1),
        );
      }
  first.dispose();
  first.dispose();
  assert.ok([...firstCounts.values()].every((count) => count === 1));
  assert.ok([...otherCounts.values()].every((count) => count === 0));
  other.dispose();
  other.dispose();
  assert.ok([...otherCounts.values()].every((count) => count === 1));
});
