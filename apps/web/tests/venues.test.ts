import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  VENUES,
  VENUE_COUNTS,
  VENUE_SOURCE,
  nearbyVenues,
  searchVenues,
  venueDistanceMetres,
  venueMapsUrl,
} from "../lib/venues";
import { containsGeo, GEO_BOUNDS, projectGeo } from "../lib/geography";
import { fromVenue } from "../lib/world-state";
import { interiorForHotspot } from "../lib/interiors";

test("bundled venues retain unique mapped identities, finite positions and exact OSM source links", () => {
  assert.equal(VENUE_SOURCE.osmTimestamp, "2026-10-02T23:00:00Z");
  assert.equal(VENUE_SOURCE.license, "ODbL 1.0");
  assert.equal(VENUES.length, VENUE_COUNTS.selected);
  assert.equal(new Set(VENUES.map((venue) => venue.id)).size, VENUES.length);
  for (const venue of VENUES) {
    assert.ok(venue.name.trim());
    assert.ok(venue.point.every(Number.isFinite));
    assert.ok(containsGeo(GEO_BOUNDS, venue.point));
    assert.equal(venue.id, `${venue.osmType}:${venue.osmId}`);
    assert.equal(
      venue.sourceUrl,
      `https://www.openstreetmap.org/${venue.osmType}/${venue.osmId}`,
    );
    assert.equal(
      venue.positionSource,
      venue.osmType === "node" ? "osm-node" : "way-centroid",
    );
    if (venue.website) {
      const url = new URL(venue.website);
      assert.equal(url.protocol, "https:");
      assert.equal(url.username, "");
      assert.equal(url.password, "");
      assert.ok(url.hostname.includes("."));
    }
  }
});

test("venue sampling includes cafés and genuine gyms across central Lisbon, Benfica and Sintra", () => {
  for (const point of [
    [-9.1446, 38.7059], // Cais do Sodré
    [-9.197, 38.75], // Benfica
    [-9.39, 38.796], // Sintra
  ] as const) {
    assert.ok(nearbyVenues(point, 2500, 100, "cafe").length > 0);
    assert.ok(nearbyVenues(point, 3500, 100, "restaurant").length > 0);
  }
  assert.ok(VENUES.filter((venue) => venue.category === "gym").length >= 50);
  assert.ok(
    !VENUES.some(
      (venue) =>
        venue.category === "gym" && venue.osmCategory === "fitness_station",
    ),
  );
  for (const category of [
    "cafe",
    "gym",
    "restaurant",
    "bar",
    "shop",
    "culture",
  ])
    assert.ok(VENUES.some((venue) => venue.category === category));
});

test("accent-insensitive search and category filtering preserve actual venue names", () => {
  const found = searchVenues("pastelinho benfica", "cafe", 10);
  assert.ok(
    found.some(
      (venue) =>
        venue.id === "node:3376196111" &&
        venue.name === "O Pastelinho de Benfica",
    ),
  );
  const cafes = searchVenues("cafe", "cafe", 100);
  assert.ok(cafes.some((venue) => venue.name.includes("Café")));
  assert.ok(cafes.every((venue) => venue.category === "cafe"));
  assert.equal(searchVenues("unmapped imaginary business", "all").length, 0);
  assert.equal(searchVenues("", "all", 0).length, 0);
});

test("nearby results sort by metre distance and Google links keep mapped coordinates", () => {
  const venue = VENUES.find((item) => item.id === "node:3376196111")!;
  assert.equal(venueDistanceMetres(venue, venue.point), 0);
  const nearby = nearbyVenues(venue.point, 1000, 10);
  assert.equal(nearby[0].id, venue.id);
  for (let i = 1; i < nearby.length; i++)
    assert.ok(
      venueDistanceMetres(nearby[i - 1], venue.point) <=
        venueDistanceMetres(nearby[i], venue.point),
    );
  const maps = new URL(venueMapsUrl(venue));
  assert.equal(maps.origin, "https://www.google.com");
  assert.equal(
    maps.searchParams.get("query"),
    `${venue.point[1]},${venue.point[0]} (${venue.name})`,
  );
});

test("beach discovery finds real coastal destinations by accent-insensitive names without assigning business interiors", () => {
  for (const [query, sourceId] of [
    ["conceicao", "way:544205149"],
    ["tamariz", "way:23847961"],
    ["paco arcos", "way:98821052"],
    ["santo amaro", "way:180126358"],
  ]) {
    const found = searchVenues(query, "beach", 40);
    assert.ok(found.some((venue) => venue.id === sourceId));
    assert.ok(found.every((venue) => venue.category === "beach"));
  }
  const beaches = VENUES.filter((venue) => venue.category === "beach");
  assert.equal(beaches.length, VENUE_COUNTS.selectedByCategory.beach);
  assert.ok(beaches.length >= 20);
  for (const beach of beaches) {
    assert.equal(beach.osmCategory, "beach");
    assert.equal(beach.positionSource, "way-centroid");
    const hotspot = fromVenue(beach);
    assert.equal(hotspot.category, "beach");
    assert.equal(hotspot.sourceUrl, beach.sourceUrl);
    assert.equal(interiorForHotspot(hotspot), null);
    assert.deepEqual(
      nearbyVenues(beach.point, 1, 1, "beach").map((venue) => venue.id),
      [beach.id],
    );
  }
  assert.equal(
    searchVenues("tamariz", "cafe", 40).some(
      (venue) => venue.category === "beach",
    ),
    false,
  );
  assert.equal(
    searchVenues("carcavelos", "beach").length,
    0,
    "outside-world beaches are not moved inside the map",
  );
});

test("every bundled beach focus stays inside the real world bounds and close to its mapped coast", () => {
  const manifest = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("../public/data/lisbon-manifest.json.gz", import.meta.url),
      ),
    ).toString("utf8"),
  );
  const coast = manifest.coastlines.map((line: any) =>
    line.points.map(projectGeo),
  );
  for (const beach of VENUES.filter((venue) => venue.category === "beach")) {
    assert.ok(containsGeo(GEO_BOUNDS, beach.point));
    const point = projectGeo(beach.point);
    let nearest = Infinity;
    for (const line of coast) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1],
          b = line[i];
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.z - a.z) * dz) /
              (dx * dx + dz * dz || 1),
          ),
        );
        nearest = Math.min(
          nearest,
          Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz),
        );
      }
    }
    assert.ok(
      nearest < 100,
      `${beach.name} must remain on its sourced coast, not an inland district`,
    );
  }
});
