import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { coastRegions, waterAt } from "../lib/city-water";

const manifest = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("../public/data/lisbon-manifest.json.gz", import.meta.url),
    ),
  ).toString(),
);
const regions = coastRegions(manifest);

test("the bundled coastline fills the Tagus and Atlantic while preserving Baixa and Almada", () => {
  for (const point of [
    [-9.137, 38.702], // Tagus off Praça do Comércio
    [-9.1446, 38.701], // Water south of Cais do Sodré
    [-9.214, 38.69], // Tagus south of Belém
    [-9.42, 38.689], // Atlantic off the western shore
  ])
    assert.equal(regions.waterAt(point), true, `${point} should be water`);
  for (const point of [
    [-9.137, 38.712], // Baixa
    [-9.1446, 38.708], // Cais do Sodré inland
    [-9.214, 38.7], // Belém inland
    [-9.15, 38.684], // Almada thumb inside the southern coverage edge
    [-9.151, 38.687],
    [-9.39, 38.79], // Sintra
  ]) {
    assert.equal(regions.waterAt(point), false, `${point} should be land`);
    assert.equal(
      waterAt(point, regions.land),
      true,
      `${point} should have land geometry`,
    );
  }
});

test("both coast regions have closed rings strictly inside the world bounds", () => {
  assert.equal(regions.water.length, 2);
  assert.equal(regions.land.length, 10);
  const [west, south, east, north] = manifest.bounds;
  for (const polygon of [...regions.land, ...regions.water]) {
    for (const ring of [polygon.ring, ...polygon.holes]) {
      assert.deepEqual(ring[0], ring[ring.length - 1]);
      assert.ok(ring.length >= 4);
      for (const [lng, lat] of ring) {
        assert.ok(lng >= west - 1e-10 && lng <= east + 1e-10);
        assert.ok(lat >= south - 1e-10 && lat <= north + 1e-10);
      }
    }
  }
});

test("small closed coastline islands become land and holes in the surrounding Tagus", () => {
  const island = [-9.144585, 38.6874];
  assert.equal(waterAt(island, regions.land), true);
  assert.equal(regions.waterAt(island), false);
  assert.equal(regions.waterAt([-9.1443, 38.6874]), true);
  assert.equal(
    regions.water.reduce((sum, polygon) => sum + polygon.holes.length, 0),
    7,
  );
});

test("land and water partition the full coverage without holes or overlapping regions", () => {
  const [west, south, east, north] = manifest.bounds;
  for (let x = 0; x < 30; x++)
    for (let y = 0; y < 30; y++) {
      const point = [
        west + ((x + 0.321) / 30) * (east - west),
        south + ((y + 0.456) / 30) * (north - south),
      ];
      assert.equal(
        Number(regions.waterAt(point)) + Number(waterAt(point, regions.land)),
        1,
        `${point} must belong to exactly one side of the coastline`,
      );
    }
});

test("region clipping handles a coast that leaves and re-enters the southern boundary", () => {
  // Land-left coastline enters from west, dips outside coverage, then returns.
  const coast = {
    bounds: [0, 0, 4, 4],
    coastlines: [
      {
        points: [
          [-1, 1],
          [1, 1],
          [2, -1],
          [3, 1],
          [5, 1],
        ],
      },
    ],
  };
  const clipped = coastRegions(coast);
  assert.equal(clipped.water.length, 2);
  assert.equal(clipped.waterAt([0.5, 0.5]), true);
  assert.equal(clipped.waterAt([3.5, 0.5]), true);
  assert.equal(clipped.waterAt([2, 0.5]), false);
  assert.equal(waterAt([2, 0.5], clipped.land), true);
  assert.equal(clipped.waterAt([-0.1, 0.5]), false);
});

test("splitting ways at existing nodes does not change coastline topology", () => {
  const complete = coastRegions({
    bounds: [0, 0, 4, 4],
    coastlines: [
      {
        points: [
          [-1, 1],
          [1, 1],
          [2, 2],
          [5, 2],
        ],
      },
    ],
  });
  const split = coastRegions({
    bounds: [0, 0, 4, 4],
    coastlines: [
      {
        points: [
          [2, 2],
          [5, 2],
        ],
      },
      {
        points: [
          [-1, 1],
          [1, 1],
        ],
      },
      {
        points: [
          [1, 1],
          [2, 2],
        ],
      },
    ],
  });
  for (let x = 0.25; x < 4; x += 0.5)
    for (let y = 0.25; y < 4; y += 0.5)
      assert.equal(split.waterAt([x, y]), complete.waterAt([x, y]));
});
