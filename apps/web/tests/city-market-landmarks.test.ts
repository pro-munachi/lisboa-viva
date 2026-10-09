import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createLandmarks, isLandmarkBuilding } from "../lib/city-landmarks.js";
import { projectGeo } from "../lib/geography";

const THREE = require("three");
const markets = [
  {
    id: 39729235,
    file: "buildings-11-0",
    architecture: "three-nave covered hall",
  },
  {
    id: 146533532,
    file: "buildings-9-2",
    architecture: "circular concrete nave",
  },
].map((market) => {
  const chunk = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(`../public/data/${market.file}.json.gz`, import.meta.url),
      ),
    ).toString(),
  );
  return {
    ...market,
    building: chunk.buildings.find((b: any) => b.id === market.id),
  };
});

function release(group: any) {
  group.traverse((object: any) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
}

function insideOrBoundary(
  x: number,
  z: number,
  ring: { x: number; z: number }[],
) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (
      Math.abs((x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x)) <
        length * 0.005 &&
      x >= Math.min(a.x, b.x) - 0.005 &&
      x <= Math.max(a.x, b.x) + 0.005 &&
      z >= Math.min(a.z, b.z) - 0.005 &&
      z <= Math.max(a.z, b.z) + 0.005
    )
      return true;
    if (
      a.z > z !== b.z > z &&
      x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

test("only the exact mapped market halls replace generic buildings, including safe malformed-footprint rejection", () => {
  for (const market of markets)
    assert.equal(isLandmarkBuilding(market.building), true);
  assert.equal(
    isLandmarkBuilding({ ...markets[1].building, id: 737906969 }),
    false,
    "the nearby apartment that shares Benfica's market name remains an apartment",
  );
  for (const ring of [
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [1, 0],
      [1, NaN],
      [0, 0],
    ],
    Array.from({ length: 257 }, (_, i) => [Math.cos(i), Math.sin(i)]),
  ]) {
    const bad = { ...markets[1].building, ring };
    assert.equal(isLandmarkBuilding(bad), false);
    const group = createLandmarks(
      { buildings: [bad] },
      { projectGeo, geoY: () => 0 },
    );
    assert.equal(group.children.length, 0);
  }
});

test("real market footprints keep their position and mapped height, with distinct architecture and bounded finite geometry", () => {
  for (const market of markets) {
    const original = JSON.stringify(market.building);
    const group = createLandmarks(
      { buildings: [market.building] },
      { projectGeo, geoY: () => 3 },
    );
    const metadata = group.userData.models[0];
    assert.equal(metadata.marketArchitecture, market.architecture);
    assert.equal(metadata.mappedHeight, market.building.height);
    assert.deepEqual(group.userData.landmarkIds, [market.id]);
    assert.equal(group.userData.approximateArchitecture, true);
    assert.equal(JSON.stringify(market.building), original);
    assert.ok(
      group.children.length >= 5 && group.children.length <= 9,
      "doors, lettering and roof pieces are merged by material rather than separate draw calls",
    );
    const bounds = new THREE.Box3().setFromObject(group);
    assert.ok(Math.abs(bounds.max.y - (market.building.height + 3.12)) < 0.005);
    assert.ok(bounds.min.y >= 2.99);
    const ring = market.building.ring.map(projectGeo);
    const xs = ring.map((p: any) => p.x),
      zs = ring.map((p: any) => p.z);
    assert.ok(bounds.min.x >= Math.min(...xs) - 1.1);
    assert.ok(bounds.max.x <= Math.max(...xs) + 1.1);
    assert.ok(bounds.min.z >= Math.min(...zs) - 1.1);
    assert.ok(bounds.max.z <= Math.max(...zs) + 1.1);
    let triangles = 0;
    let roofSeams = 0;
    const cupola = new THREE.Box3();
    group.traverse((object: any) => {
      if (!object.isMesh) return;
      const count = object.geometry.attributes.position.count;
      triangles += count / 3;
      for (const attribute of Object.values(
        object.geometry.attributes,
      ) as any[]) {
        assert.equal(attribute.count, count);
        assert.ok(Array.from(attribute.array).every(Number.isFinite));
      }
      if (
        market.id === 39729235 &&
        ["b65843", "a34d3b"].includes(object.material.color.getHexString())
      ) {
        const position = object.geometry.attributes.position;
        for (let i = 0; i < count; i++)
          assert.ok(
            insideOrBoundary(position.getX(i), position.getZ(i), ring),
            "the multi-nave roof follows the concave OSM footprint, including its annex",
          );
        if (object.material.color.getHexString() === "a34d3b")
          roofSeams += count;
      }
      if (
        market.id === 39729235 &&
        object.material.color.getHexString() === "648b96"
      ) {
        const position = object.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          if (position.getY(i) <= 3.12 + market.building.height * 0.66)
            continue;
          cupola.expandByPoint(
            new THREE.Vector3(
              position.getX(i),
              position.getY(i),
              position.getZ(i),
            ),
          );
        }
      }
    });
    if (market.id === 39729235) {
      assert.ok(
        roofSeams > 1000,
        "the original tiled roof includes merged raised seam geometry",
      );
      const size = cupola.getSize(new THREE.Vector3());
      assert.ok(
        size.y >= Math.max(size.x, size.z) * 0.4,
        "the metal cupola remains an upright dome rather than a flattened plate",
      );
    }
    assert.ok(triangles > 4000 && triangles < 24000);
    release(group);
  }
});

test("market geometry follows sloping ground and each chunk owns independent disposable resources", () => {
  const building = markets[0].building;
  const geoY = ([, lat]: number[]) => 1 + (lat - 38.7066) * 2400;
  const first = createLandmarks(
    { buildings: [building] },
    { projectGeo, geoY },
  );
  const second = createLandmarks(
    { buildings: [building] },
    { projectGeo, geoY },
  );
  const levels = building.ring.map(geoY);
  const bounds = new THREE.Box3().setFromObject(first);
  assert.ok(bounds.min.y <= Math.min(...levels) + 0.13);
  assert.ok(
    Math.abs(bounds.max.y - (Math.max(...levels) + building.height + 0.12)) <
      0.005,
  );
  let disposed = 0;
  first.children.forEach((mesh: any, index: number) => {
    assert.notEqual(mesh.geometry, second.children[index].geometry);
    assert.notEqual(mesh.material, second.children[index].material);
    mesh.geometry.addEventListener("dispose", () => disposed++);
    mesh.material.addEventListener("dispose", () => disposed++);
  });
  release(first);
  assert.equal(disposed, first.children.length * 2);
  release(second);
});
