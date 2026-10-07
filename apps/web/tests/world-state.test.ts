import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaPlace,
  focusFor,
  fromGeographic,
  fromVenue,
  mapLinkPin,
  placeFocus,
  restorePins,
} from "../lib/world-state";
import { containsGeo, GEOGRAPHIC_HOTSPOTS, GEO_BOUNDS } from "../lib/geography";
import { places } from "../lib/content";
import { VENUES, type VenueCategory } from "../lib/venues";

const CAIS_URL =
  "https://www.google.com/maps/place/Cais+do+Sodre/@38.7105,-9.145,15z/data=!3d38.7063!4d-9.1455";

test("custom pins use the destination coordinates before the map camera and bound the chosen name", () => {
  const pin = mapLinkPin(CAIS_URL, "  My station stop  ");
  assert.ok(pin);
  assert.equal(pin.lat, 38.7063);
  assert.equal(pin.lng, -9.1455);
  assert.equal(pin.name, "My station stop");
  assert.equal(pin.custom, true);
  assert.equal(pin.mapsUrl, CAIS_URL);
  assert.equal(mapLinkPin(CAIS_URL, "")?.name, "Cais do Sodre");
  assert.equal(mapLinkPin(CAIS_URL, "x".repeat(80))?.name.length, 60);
});

test("full coordinate queries and map views can pin Sintra and Lisbon without an API key", () => {
  const sintra = mapLinkPin(
    "https://maps.google.com/?q=38.7975,-9.390556",
    "Sintra stop",
  );
  assert.ok(sintra);
  assert.equal(sintra.lat, 38.7975);
  assert.equal(sintra.lng, -9.390556);
  assert.equal(
    mapLinkPin("https://www.google.pt/maps?query=38.7063%2C-9.1455", "")?.name,
    "Your map pin",
  );
  assert.equal(
    mapLinkPin("https://www.google.com/maps/@38.7063,-9.1455,18z", "")?.name,
    "Google Maps camera view",
  );
});

test("bundled coordinate links accept only an optional parenthesized label after the numeric pair", () => {
  for (const hotspot of GEOGRAPHIC_HOTSPOTS) {
    const pin = mapLinkPin(hotspot.mapsUrl, "");
    assert.ok(pin, hotspot.name);
    assert.equal(pin.lat, hotspot.point[1]);
    assert.equal(pin.lng, hotspot.point[0]);
    assert.equal(pin.name, hotspot.name);
  }
  for (const query of [
    "coffee near 38.7063,-9.1455",
    "38.7063,-9.1455 coffee",
    "38.7063,-9.1455 (coffee) trailing",
    "38.7063,-9.1455 ((coffee))",
    "38.7063,-9.1455 ()",
    "38.7063,-9.1455 (line\nbreak)",
    "38.7063,-9.1455 (" + "x".repeat(121) + ")",
  ]) {
    assert.equal(
      mapLinkPin(
        `https://www.google.com/maps?query=${encodeURIComponent(query)}`,
        "",
      ),
      null,
      query,
    );
  }
});

test("pins reject unsafe URLs, unresolved links and coordinates outside the bundled world", () => {
  const invalid = [
    "javascript:alert(1)",
    "file:///maps/@38.7063,-9.1455,18z",
    "https://maps.example.com/maps/@38.7063,-9.1455,18z",
    "https://www.google.com.example.com/maps/@38.7063,-9.1455,18z",
    "https://www.google.com/not-maps?query=38.7063,-9.1455",
    "https://www.google.com/maps-fake?query=38.7063,-9.1455",
    "https://maps.app.goo.gl/unresolved",
    "https://www.google.com/maps/place/Sintra",
    "https://www.google.com/maps?query=NaN,-9.14",
    "https://www.google.com/maps?query=40,-9.14",
    // Inside the broad Lisbon search envelope but beyond the geometry coverage.
    "https://www.google.com/maps?query=38.9,-9.39",
    "https://www.google.com/maps?query=38.7,-9.5",
    "https://www.google.com/maps/%invalid",
    "not a URL",
  ];
  for (const url of invalid) assert.equal(mapLinkPin(url, "bad"), null, url);
});

test("restoring pins revalidates URLs instead of trusting stored coordinates or API-derived fields", () => {
  const forged = {
    id: "google:forged",
    name: "  My station stop  ",
    mapsUrl: CAIS_URL,
    lat: 0,
    lng: 0,
    googlePlaceId: "not-user-authored",
    address: "A forged address",
    attribution: [{ provider: "Forged data" }],
    sourceUrl: "javascript:alert(1)",
  };
  assert.deepEqual(restorePins(JSON.stringify([forged])), [
    mapLinkPin(CAIS_URL, forged.name),
  ]);
  const saved = restorePins(JSON.stringify([forged]))[0];
  assert.equal(saved.googlePlaceId, undefined);
  assert.equal(saved.address, undefined);
  assert.equal(saved.sourceUrl, undefined);
  assert.equal(saved.lat, 38.7063);
});

test("corrupt and oversized pin storage is bounded while valid records survive mixed input", () => {
  const good = { mapsUrl: CAIS_URL, name: "My station stop" };
  for (const raw of [
    "{broken",
    "null",
    "{}",
    '"text"',
    " ".repeat(16001),
    JSON.stringify(Array(17).fill(good)),
  ]) {
    assert.deepEqual(restorePins(raw), []);
  }
  assert.equal(restorePins(JSON.stringify(Array(16).fill(good))).length, 16);
  const mixed = [
    null,
    false,
    {},
    { mapsUrl: CAIS_URL, name: {} },
    { mapsUrl: "javascript:alert(1)", name: "bad" },
    good,
  ];
  assert.deepEqual(restorePins(JSON.stringify(mixed)), [
    mapLinkPin(CAIS_URL, good.name),
  ]);
});

test("all gameplay destinations and authored hotspots use covered geographic positions", () => {
  assert.deepEqual(Object.keys(placeFocus).sort(), Object.keys(places).sort());
  for (const focus of Object.values(placeFocus)) {
    assert.ok(containsGeo(GEO_BOUNDS, [focus.lng, focus.lat]), focus.name);
    assert.ok(Number.isFinite(focus.range) && focus.range! > 0, focus.name);
  }
  for (const hotspot of GEOGRAPHIC_HOTSPOTS) {
    const pin = fromGeographic(hotspot);
    assert.ok(containsGeo(GEO_BOUNDS, [pin.lng, pin.lat]), hotspot.name);
    assert.equal(pin.googlePlaceId, undefined);
    assert.match(pin.sourceUrl || "", /^https:\/\//);
    assert.ok(areaPlace[hotspot.area], hotspot.area);
  }
  assert.equal(areaPlace["Cais do Sodré"], "cais");
  assert.equal(areaPlace.Benfica, "benfica");
  assert.equal(areaPlace.Sintra, "sintra");
  assert.ok(placeFocus.sintra.lat > placeFocus.cais.lat);
  assert.ok(placeFocus.sintra.lng < placeFocus.benfica.lng);
});

test("curated place categories reach world markers without implying a mapped business", () => {
  const expected = {
    comercio: "landmark",
    "graca-lookout": "viewpoint",
    "ribeira-market": "market",
    "cais-station": "transport",
    "pink-street": "street",
    maat: "museum",
  };
  for (const [id, category] of Object.entries(expected)) {
    const source = GEOGRAPHIC_HOTSPOTS.find((hotspot) => hotspot.id === id);
    assert.ok(source, id);
    const marker = fromGeographic(source);
    assert.equal(marker.category, category, source.name);
    assert.equal(marker.mapVenue, undefined);
    assert.equal(marker.custom, undefined);
    assert.equal(marker.sourceUrl, source.culturalSource);
  }
  for (const source of GEOGRAPHIC_HOTSPOTS)
    assert.equal(fromGeographic(source).category, source.category, source.name);
});

test("mapped business categories remain available alongside curated landmark categories", () => {
  const categories: VenueCategory[] = [
    "cafe",
    "gym",
    "restaurant",
    "bar",
    "shop",
    "culture",
  ];
  for (const category of categories) {
    const source = VENUES.find((venue) => venue.category === category);
    assert.ok(source, category);
    const marker = fromVenue(source);
    assert.equal(marker.category, category);
    assert.equal(marker.mapVenue, true);
    assert.equal(marker.sourceUrl, source.sourceUrl);
    assert.equal(marker.id, source.id);
  }
});

test("coordinate pins do not infer a business category from a user-chosen name", () => {
  for (const name of ["My café", "A gym", "Museum stop"]) {
    const pin = mapLinkPin(CAIS_URL, name);
    assert.ok(pin);
    assert.equal(pin.category, undefined);
    assert.equal(pin.mapVenue, undefined);
    const restored = restorePins(
      JSON.stringify([{ ...pin, category: "gym", mapVenue: true }]),
    );
    assert.deepEqual(restored, [pin]);
  }
});

test("the selected home neighbourhood controls its map focus without changing other destinations", () => {
  assert.equal(focusFor("home", "Graça").name, "Graça");
  const baixa = focusFor("home", "Baixa");
  assert.equal(baixa.lat, placeFocus.cafe.lat);
  assert.equal(baixa.lng, placeFocus.cafe.lng);
  assert.equal(baixa.name, "Your base · Baixa");
  const alfama = focusFor("home", "Alfama");
  assert.equal(alfama.lat, placeFocus.exchange.lat);
  assert.equal(alfama.lng, placeFocus.exchange.lng);
  assert.equal(alfama.name, "Your base · Alfama");
  assert.equal(focusFor("sintra", "Baixa"), placeFocus.sintra);
});
