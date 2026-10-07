import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERIOR_ACTIVITIES,
  INTERIOR_LABELS,
  interiorForHotspot,
  type InteriorKind,
} from "../lib/interiors";
import { createInteriorScene } from "../lib/city-interiors.js";
import { GEOGRAPHIC_HOTSPOTS } from "../lib/geography";
import { VENUES, type VenueCategory } from "../lib/venues";
import {
  fromGeographic,
  fromVenue,
  mapLinkPin,
  type WorldHotspot,
} from "../lib/world-state";

type OriginalInteriorKind = Exclude<
  InteriorKind,
  "airport" | "station" | "bus-stop"
>;
const expectedZones: Record<OriginalInteriorKind, readonly string[]> = {
  home: ["rest", "kitchen", "plan"],
  cafe: ["espresso", "pastry", "table"],
  gym: ["treadmill", "weights", "stretch"],
  shop: ["browse", "try-on", "counter"],
  museum: ["gallery", "tiles", "bench"],
  bar: ["listen", "counter", "lounge"],
};
const kinds = Object.keys(expectedZones) as OriginalInteriorKind[];

function disposeRoom(group: any) {
  const geometries = new Set<any>();
  const materials = new Set<any>();
  const textures = new Set<any>();
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

test("all eighteen catalog actions resolve to actual clickable room zones", () => {
  assert.deepEqual(
    Object.keys(INTERIOR_ACTIVITIES).filter((kind) => kind in expectedZones),
    kinds,
  );
  assert.equal(kinds.flatMap((kind) => INTERIOR_ACTIVITIES[kind]).length, 18);
  for (const kind of kinds) {
    const activities = INTERIOR_ACTIVITIES[kind];
    assert.deepEqual(
      activities.map((activity) => activity.id),
      expectedZones[kind],
    );
    const room = createInteriorScene(kind);
    try {
      assert.deepEqual(
        room.zones.map((zone: any) => zone.id),
        activities.map((activity) => activity.id),
        `${kind} UI and room IDs must agree`,
      );
      const clickable = new Set<string>();
      room.group.traverse((node: any) => {
        if (node.isMesh && node.userData.zone)
          clickable.add(node.userData.zone);
      });
      assert.deepEqual(
        [...clickable].sort(),
        activities.map((activity) => activity.id).sort(),
        `${kind} actions require a visible selectable prop`,
      );
    } finally {
      disposeRoom(room.group);
    }
  }
});

test("room actions have distinct concrete CTAs, descriptions, results and short scene durations", () => {
  for (const kind of kinds) {
    const activities = INTERIOR_ACTIVITIES[kind];
    assert.ok(INTERIOR_LABELS[kind].trim());
    for (const field of [
      "id",
      "label",
      "actionLabel",
      "description",
      "result",
    ] as const)
      assert.equal(
        new Set(activities.map((activity) => activity[field])).size,
        activities.length,
        `${kind} ${field} should distinguish the three activities`,
      );
    for (const activity of activities) {
      const reference = `${kind}/${activity.id}`;
      assert.ok(activity.actionLabel.trim().length >= 7, reference);
      assert.ok(activity.actionLabel.length <= 30, reference);
      assert.doesNotMatch(
        activity.actionLabel,
        /^(begin|explore)|purchase|checkout|book|pay|€|\$/i,
        `${reference} should name the scene action without a transaction`,
      );
      assert.notEqual(activity.actionLabel, activity.label, reference);
      assert.ok(activity.description.trim().length > 25, reference);
      assert.ok(activity.result.trim().length > 25, reference);
      assert.notEqual(activity.description, activity.result, reference);
      assert.notEqual(activity.result, activity.label, reference);
      assert.ok(
        typeof activity.durationMs === "number" &&
          Number.isFinite(activity.durationMs) &&
          activity.durationMs >= 2000 &&
          activity.durationMs <= 8000,
        `${reference} should finish in a bounded scene interval`,
      );
    }
  }
});

test("actual mapped OSM venue categories select their corresponding original rooms while beaches stay outdoors", () => {
  const expected: Record<VenueCategory, InteriorKind | null> = {
    cafe: "cafe",
    restaurant: "cafe",
    gym: "gym",
    shop: "shop",
    culture: "museum",
    bar: "bar",
    beach: null,
  };
  for (const [category, kind] of Object.entries(expected)) {
    const venue = VENUES.find((item) => item.category === category);
    assert.ok(venue, `a real mapped ${category} is present`);
    const hotspot = fromVenue(venue);
    assert.equal(hotspot.mapVenue, true);
    assert.equal(interiorForHotspot(hotspot), kind, venue.name);
  }
});

test("the authored MAAT landmark opens a gallery while ordinary city landmarks do not imply interiors", () => {
  const maat = GEOGRAPHIC_HOTSPOTS.find((hotspot) => hotspot.id === "maat");
  assert.ok(maat);
  assert.equal(interiorForHotspot(fromGeographic(maat)), "museum");
  for (const landmark of GEOGRAPHIC_HOTSPOTS) {
    if (landmark.category === "museum") continue;
    assert.equal(
      interiorForHotspot(fromGeographic(landmark)),
      null,
      landmark.name,
    );
  }
  assert.equal(
    interiorForHotspot({ ...fromGeographic(maat), custom: true }),
    null,
  );
});

test("custom map links, geocoded locations and unknown Google places never infer a room from a name or category", () => {
  const pin = mapLinkPin(
    "https://www.google.com/maps?query=38.7063,-9.1455",
    "A café name entered by a visitor",
  );
  assert.ok(pin);
  const venue = fromVenue(VENUES.find((item) => item.category === "cafe")!);
  const cases: WorldHotspot[] = [
    { ...pin, category: "cafe" },
    { ...venue, mapLocation: true },
    { ...venue, googlePlaceId: "google-place-without-mapped-room" },
    { ...venue, custom: true },
    { ...venue, mapVenue: false },
    { ...venue, id: "unmapped-name-only", mapVenue: undefined },
    { ...pin, custom: false, category: "culture", mapLocation: true },
    { ...pin, custom: false, category: undefined },
  ];
  for (const hotspot of cases)
    assert.equal(interiorForHotspot(hotspot), null, hotspot.id);
});
