import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
const World = require("../components/World")
  .default as typeof import("../components/World").default;
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

test("the scenery browser waits for the city geography instead of showing a premature empty discovery list", () => {
  const html = renderToStaticMarkup(
    createElement(World, {
      focus: { name: "Baixa", lat: 38.7119, lng: -9.1374 },
      shirt: "#b8775c",
      hotspots: [],
      interior: null,
      onHotspot() {
        throw new Error("rendering cannot select a hotspot");
      },
      onExitInterior() {},
    }),
  );
  const trigger = html.match(/<button[^>]*data-scenery-browser[^>]*>/)?.[0];
  assert.ok(trigger, "scenery remains discoverable under view options");
  assert.match(trigger, /disabled=""/);
  assert.match(trigger, /aria-busy="true"/);
  assert.match(html, /Loading city objects…/);
  assert.ok(!html.includes("Walk closer to a park or a street"));
  assert.ok(!html.includes("Close scenery options"));
});
