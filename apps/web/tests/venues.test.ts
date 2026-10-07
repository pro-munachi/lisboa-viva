import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VENUES,
  VENUE_COUNTS,
  VENUE_SOURCE,
  nearbyVenues,
  searchVenues,
  venueDistanceMetres,
  venueMapsUrl,
} from "../lib/venues";
import { containsGeo, GEO_BOUNDS } from "../lib/geography";

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
