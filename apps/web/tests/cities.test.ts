import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { test } from "node:test";
import { CITY, CITY_BUNDLES, getCity, cityMinute } from "../lib/cities";
import { CONTENT_VERSION } from "../lib/content";
import { GEO_BOUNDS, GEO_ORIGIN, containsGeo } from "../lib/geography";
import { placeFocus } from "../lib/world-state";

test("the registry exposes only the actual Lisbon pilot and rejects unbundled IDs", () => {
  assert.deepEqual(Object.keys(CITY_BUNDLES), ["lisbon"]);
  assert.equal(getCity("lisbon"), CITY);
  assert.equal(CITY.status, "available-pilot");
  assert.equal(CITY.timeZone, "Europe/Lisbon");
  assert.equal(CITY.currency, "EUR");
  for (const id of ["london", "porto", "Lisbon", "", "__proto__", null, 1])
    assert.throws(() => getCity(id), RangeError);
  assert.equal(CITY.content.version, CONTENT_VERSION);
  assert.equal(CITY.features.googleMaps, "api-key-required");
  assert.equal(CITY.features.aiRecommendations, "server-key-required");
});

test("all exported city fields are deeply immutable without freezing geography's shared arrays", () => {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) visit(child);
  };
  visit(CITY_BUNDLES);
  assert.notEqual(CITY.bounds, GEO_BOUNDS);
  assert.notEqual(CITY.origin, GEO_ORIGIN);
  assert.equal(Reflect.set(CITY.focus.point, "0", 0), false);
});

test("bundle paths and coordinates match the real compressed map headers and current default view", () => {
  assert.deepEqual(CITY.bounds, GEO_BOUNDS);
  assert.deepEqual(CITY.origin, GEO_ORIGIN);
  assert.deepEqual(CITY.focus.point, [
    placeFocus.cais.lng,
    placeFocus.cais.lat,
  ]);
  assert.equal(CITY.focus.name, placeFocus.cais.name);
  assert.equal(CITY.focus.range, placeFocus.cais.range);
  assert.ok(containsGeo(CITY.bounds, CITY.focus.point));
  for (const key of ["manifest", "terrain", "overview"] as const) {
    const data = JSON.parse(
      gunzipSync(
        readFileSync(resolve("public", CITY.data[key].slice(1))),
      ).toString(),
    );
    assert.deepEqual(data.bounds, CITY.bounds);
    if (key !== "terrain") assert.deepEqual(data.origin, CITY.origin);
    else assert.equal(data.elevations.length, data.width * data.height);
    if (key === "manifest") {
      assert.equal(data.version, 1);
      assert.ok(data.chunks.length > 0);
      for (const chunk of data.chunks)
        assert.ok(existsSync(resolve("public", chunk.url.slice(1))));
    }
  }
  for (const key of ["venues", "locations"] as const)
    assert.ok(existsSync(resolve("public", CITY.data[key].slice(1))));
});

test("city minutes follow Lisbon's summer and winter zone without relying on the device zone", () => {
  assert.equal(cityMinute(new Date("2026-01-15T12:34:00Z")), 12 * 60 + 34);
  assert.equal(cityMinute(new Date("2026-07-15T12:34:00Z")), 13 * 60 + 34);
  assert.equal(cityMinute(new Date("2026-01-15T00:00:00Z")), 0);
  assert.equal(cityMinute(new Date("2026-07-15T23:45:00Z")), 45);
  assert.equal(
    cityMinute(new Date("2026-07-15T12:34:00Z"), "UTC"),
    12 * 60 + 34,
  );
  assert.equal(
    cityMinute(new Date("2026-07-15T12:34:00Z"), "Asia/Kathmandu"),
    18 * 60 + 19,
  );
});

test("spring clock skips and autumn repeated hours use the actual IANA rules", () => {
  assert.equal(cityMinute(new Date("2026-03-29T00:59:00Z")), 59);
  assert.equal(cityMinute(new Date("2026-03-29T01:00:00Z")), 120);
  assert.equal(cityMinute(new Date("2026-10-25T00:30:00Z")), 90);
  assert.equal(cityMinute(new Date("2026-10-25T01:30:00Z")), 90);
  assert.throws(() => cityMinute(new Date("invalid")), RangeError);
  assert.throws(() => cityMinute(new Date(), "Not/A_Zone"), RangeError);
});
