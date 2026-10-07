import { test } from "node:test";
import assert from "node:assert/strict";
import { containsGeo, GEO_BOUNDS } from "../lib/geography";
import {
  MAP_LOCATIONS,
  MAP_LOCATION_SOURCE,
  MAP_LOCATION_COUNTS,
  searchMapLocations,
} from "../lib/map-locations";
import type { WorldHotspot } from "../lib/world-state";

test("the offline name index preserves source identities and distinguishes mapped place points from approximate street focuses", () => {
  assert.equal(MAP_LOCATION_SOURCE.osmTimestamp, "2026-10-02T23:00:00Z");
  assert.equal(MAP_LOCATION_SOURCE.license, "ODbL 1.0");
  assert.equal(MAP_LOCATIONS.length, MAP_LOCATION_COUNTS.selected);
  assert.equal(
    new Set(MAP_LOCATIONS.map((location) => location.id)).size,
    MAP_LOCATIONS.length,
  );
  assert.ok(
    MAP_LOCATIONS.filter((location) => location.kind === "street").length >=
      1000,
  );
  assert.ok(
    MAP_LOCATIONS.filter((location) => location.kind === "place").length >= 300,
  );
  for (const location of MAP_LOCATIONS) {
    const worldHotspot: WorldHotspot = location;
    assert.ok(worldHotspot.name.trim());
    assert.ok(Number.isFinite(location.lat) && Number.isFinite(location.lng));
    assert.ok(containsGeo(GEO_BOUNDS, [location.lng, location.lat]));
    assert.equal(location.id, `location:${location.osmType}:${location.osmId}`);
    assert.equal(
      location.sourceUrl,
      `https://www.openstreetmap.org/${location.osmType}/${location.osmId}`,
    );
    if (location.kind === "street") {
      assert.equal(location.positionSource, "mapped-route-focus");
      assert.equal(location.osmType, "way");
      assert.ok(
        location.description.includes("not a specific address or entrance"),
      );
    }
    const maps = new URL(location.mapsUrl);
    assert.equal(maps.origin, "https://www.google.com");
    assert.equal(
      maps.searchParams.get("query"),
      `${location.lat},${location.lng} (${location.name})`,
    );
  }
});

test("typed location search resolves real Lisbon street and district names without accents and keeps same-name regional streets separate", () => {
  const ruaAugusta = searchMapLocations("Rua Augusta");
  assert.equal(ruaAugusta[0].id, "location:way:689384704");
  assert.equal(ruaAugusta[0].name, "Rua Augusta");
  assert.ok(ruaAugusta.some((location) => location.lng < -9.3));
  const liberdade = searchMapLocations("avenida da liberdade");
  assert.equal(liberdade[0].id, "location:way:1010789868");
  for (const [query, expected] of [
    ["cais do sodre", "Cais do Sodré"],
    ["alfama", "Alfama"],
    ["belem", "Belém"],
    ["benfica", "Benfica"],
    ["sintra", "Sintra"],
    ["avenida da india", "Avenida da Índia"],
  ])
    assert.equal(searchMapLocations(query)[0].name, expected);
  const westernRuaAugusta = searchMapLocations(
    "Rua Augusta",
    30,
    [-9.31, 38.727],
  );
  assert.ok(westernRuaAugusta[0].lng < -9.3);
  assert.equal(searchMapLocations("unmapped imaginary location").length, 0);
  assert.equal(searchMapLocations("").length, 0);
  assert.equal(searchMapLocations("Lisboa", 0).length, 0);
});
