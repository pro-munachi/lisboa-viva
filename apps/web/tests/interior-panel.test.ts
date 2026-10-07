import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type InteriorKind } from "../lib/interiors";

const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
const InteriorPanel = require("../components/InteriorPanel")
  .default as typeof import("../components/InteriorPanel").default;
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

function render(kind: InteriorKind, motion = true) {
  return renderToStaticMarkup(
    createElement(InteriorPanel, {
      visit: { id: `mapped-${kind}`, name: "Mapped venue", kind },
      selectedZone: null,
      onSelectZone: () => {
        throw new Error("Rendering cannot select a zone");
      },
      onPerform: () => {
        throw new Error("Rendering cannot perform an activity");
      },
      onExit: () => {
        throw new Error("Rendering cannot leave a room");
      },
      activityState: "idle",
      completed: [],
      motion,
    }),
  );
}

test("only the original bar panel offers explicit synthesized music controls and stays silent on render", () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = class {
    constructor() {
      throw new Error("Audio requires an explicit user gesture");
    }
  } as unknown as typeof AudioContext;
  try {
    const html = render("bar");
    assert.ok(html.includes('aria-label="Play club music"'));
    assert.ok(html.includes('type="range"'));
    assert.ok(html.includes('aria-valuetext="25 percent"'));
    assert.ok(
      html.includes("synthesized club mix are original ROAM creations"),
    );
    assert.ok(html.includes("actual layout and services may differ"));
    for (const kind of [
      "home",
      "cafe",
      "gym",
      "shop",
      "museum",
      "airport",
      "station",
      "bus-stop",
    ] as const)
      assert.ok(!render(kind).includes('aria-label="Play club music"'), kind);
  } finally {
    if (previous) globalThis.AudioContext = previous;
    else
      delete (globalThis as { AudioContext?: typeof AudioContext })
        .AudioContext;
  }
});

test("the paused bar disables Play and volume while preserving the explicit resume instruction", () => {
  const html = render("bar", false),
    play = html.match(/<button[^>]*aria-label="Play club music"[^>]*>/)?.[0],
    volume = html.match(/<input[^>]*type="range"[^>]*>/)?.[0];
  assert.ok(play?.includes("disabled"));
  assert.ok(volume?.includes("disabled"));
  assert.ok(html.includes("Use the play control to resume movement"));
});
