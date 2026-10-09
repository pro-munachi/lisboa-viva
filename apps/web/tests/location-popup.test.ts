import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INTERIOR_ACTIVITIES } from "../lib/interiors";
import { JOURNEY_HUBS } from "../lib/journey";
import type { WorldHotspot } from "../lib/world-state";
import type { LocationPopupProps } from "../components/LocationPopup";

const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
const LocationPopup = require("../components/LocationPopup")
  .default as typeof import("../components/LocationPopup").default;
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

const cafe: WorldHotspot = {
  id: "mapped-cafe",
  name: "A mapped café",
  area: "Baixa",
  lat: 38.7119,
  lng: -9.1374,
  category: "cafe",
  mapVenue: true,
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Lisbon",
  sourceUrl: "https://www.openstreetmap.org/node/123",
};
const noAction = () => {
  throw new Error("Rendering does not start travel or room activities");
};
function render(overrides: Partial<LocationPopupProps> = {}) {
  return renderToStaticMarkup(
    createElement(LocationPopup, {
      hotspot: cafe,
      onClose: noAction,
      onLookAround: noAction,
      onEnterActivity: noAction,
      ...overrides,
    }),
  );
}

test("the plan stage exposes supplied transport choices and 360 preview before any interior activity", () => {
  const html = render({
    stage: "plan",
    onPreview: noAction,
    transportOptions: [
      {
        id: "walk",
        emoji: "🚶",
        label: "Walk",
        detail: "12 min · €0",
        onSelect: noAction,
      },
      {
        id: "taxi",
        emoji: "🚕",
        label: "Taxi",
        detail: "4 min · €12",
        disabled: true,
        onSelect: noAction,
      },
    ],
  });
  assert.ok(html.includes('data-stage="plan"'));
  assert.ok(html.includes("Choose how to get there"));
  assert.ok(html.includes("360° preview"));
  assert.ok(html.includes('data-transport="walk"'));
  const taxi = html.match(/<button[^>]*data-transport="taxi"[^>]*>/)?.[0];
  assert.ok(taxi?.includes("disabled"));
  assert.ok(!html.includes("data-activity="));
  assert.ok(!html.includes("Enter the café"));
  assert.ok(html.includes("Nothing is booked with a real operator"));

  const busy = render({ stage: "plan", busy: true });
  assert.ok(busy.includes('aria-busy="true"'));
  assert.ok(busy.includes('role="status"'));
  assert.ok(busy.includes("Preparing your arrival"));
});

test("arrival options preserve the shared room IDs and native modal labelling", () => {
  for (const category of ["cafe", "gym", "shop", "culture", "bar"] as const) {
    const html = render({ hotspot: { ...cafe, category } });
    const kind = category === "culture" ? "museum" : category;
    assert.ok(html.startsWith("<dialog"));
    assert.ok(html.includes('aria-modal="true"'));
    const title = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    const description = html.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(title && html.includes(`id="${title}"`));
    assert.ok(description && html.includes(`id="${description}"`));
    for (const activity of INTERIOR_ACTIVITIES[kind]) {
      assert.ok(
        html.includes(`data-activity="${activity.id}"`),
        `${kind}: ${activity.id}`,
      );
      assert.ok(html.includes(activity.actionLabel));
    }
    assert.ok(html.includes("Original ROAM scenes and simulated activities"));
    assert.ok(html.includes("actual layout and services may differ"));
  }
});

test("custom pins and beaches retain only actual scenery and map actions", () => {
  for (const hotspot of [
    { ...cafe, custom: true },
    { ...cafe, mapLocation: true },
    { ...cafe, category: "beach" as const },
  ]) {
    const html = render({ hotspot });
    assert.ok(html.includes("Look around in 3D"));
    assert.ok(html.includes("Open in Google Maps"));
    assert.ok(!html.includes("data-activity="));
    assert.ok(!html.includes("Enter the"));
    assert.ok(
      html.includes("does not represent a surveyed entrance or interior"),
    );
  }
  assert.ok(
    render({
      hotspot: { ...cafe, custom: true },
      onRemovePin: noAction,
    }).includes("Remove this pin"),
  );
  assert.ok(!render({ onRemovePin: noAction }).includes("Remove this pin"));
});

test("transport gating and source links preserve current access rules", () => {
  for (const hub of Object.values(JOURNEY_HUBS)) {
    const html = render({
      hotspot: { ...hub, id: `transit-${hub.id}` },
      onTransit: noAction,
      transitDisabled: true,
      transitHint: "Finish your current journey first.",
    });
    const action = html.match(/<button[^>]*class="primary"[^>]*>/)?.[0];
    assert.ok(action?.includes("disabled"));
    const hint = action?.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(hint && html.includes(`id="${hint}"`));
    assert.ok(html.includes("Finish your current journey first"));
    for (const activity of INTERIOR_ACTIVITIES[hub.kind]) {
      assert.ok(html.includes(activity.label));
    }
    assert.ok(!html.includes("data-activity="));
  }
  const unsafe = render({
    hotspot: {
      ...cafe,
      mapsUrl: "javascript:alert(1)",
      sourceUrl: "https://secret:password@example.com/source",
    },
  });
  assert.ok(!unsafe.includes("javascript:"));
  assert.ok(!unsafe.includes("secret:password"));
  assert.ok(!unsafe.includes("Open in Google Maps"));
  assert.ok(!unsafe.includes("View map source"));
});
