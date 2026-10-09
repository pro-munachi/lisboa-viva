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

function render(
  kind: InteriorKind,
  motion = true,
  visitState: {
    selectedZone?: string;
    activityState?: "idle" | "walking" | "active";
    completed?: string[];
    initiallyCompact?: boolean;
  } = {},
) {
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
      ...visitState,
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

test("the desktop room disclosure starts expanded and controls existing activity and venue detail regions", () => {
  for (const kind of [
    "home",
    "cafe",
    "gym",
    "shop",
    "museum",
    "bar",
    "airport",
    "station",
    "bus-stop",
  ] as const) {
    const html = render(kind);
    const toggle = html.match(/<button[^>]*class="detailsToggle"[^>]*>/)?.[0];
    assert.ok(toggle?.includes('aria-expanded="true"'), kind);
    const controls = toggle?.match(/aria-controls="([^"]+)"/)?.[1].split(" ");
    assert.equal(controls?.length, 2, kind);
    for (const target of controls || []) {
      assert.ok(html.includes(`id="${target}"`), kind);
    }
    assert.ok(html.includes('data-expanded="true"'), kind);
    assert.ok(html.includes('aria-label="Exit to street"'), kind);
    assert.ok(html.includes('role="status" aria-live="polite"'), kind);
    assert.ok(html.includes('class="compactNote"'), kind);
  }
});

test("an activity chosen before room entry starts compact with its live action and progress available", () => {
  const html = render("cafe", true, {
    initiallyCompact: true,
    selectedZone: "pastry",
    activityState: "walking",
    completed: ["espresso"],
  });
  assert.ok(html.includes('data-expanded="false"'));
  const toggle = html.match(/<button[^>]*class="detailsToggle"[^>]*>/)?.[0];
  assert.ok(toggle?.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-label="Exit to street"'));
  assert.ok(
    html.includes(
      '<div class="compactProgress"><span>Pastry case</span><span>1/3 explored</span></div>',
    ),
  );
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(html.includes("Your character is walking to pastry case."));
  const action = html.match(/<button[^>]*class="perform"[^>]*>/)?.[0];
  assert.ok(action?.includes("disabled"));
  assert.ok(action?.includes('aria-label="Walking to the corner…"'));
});

test("compact details preserve the selected corner action, busy gating, paused instruction and completed progress", () => {
  for (const activityState of ["walking", "active"] as const) {
    const html = render("gym", true, {
      selectedZone: "weights",
      activityState,
    });
    const action = html.match(/<button[^>]*class="perform"[^>]*>/)?.[0];
    assert.ok(action?.includes("disabled"));
    assert.ok(
      action?.includes(
        `aria-label="${activityState === "walking" ? "Walking to the corner…" : "Lift weights…"}"`,
      ),
    );
  }
  const paused = render("gym", false, { selectedZone: "weights" });
  const pausedAction = paused.match(/<button[^>]*class="perform"[^>]*>/)?.[0];
  assert.ok(pausedAction?.includes("disabled"));
  assert.ok(pausedAction?.includes('aria-label="Movement paused"'));
  assert.ok(paused.includes("Use the play control to resume movement"));

  const completed = render("gym", true, {
    selectedZone: "weights",
    completed: ["weights"],
  });
  const readyAction = completed.match(/<button[^>]*class="perform"[^>]*>/)?.[0];
  assert.ok(!readyAction?.includes("disabled"));
  assert.ok(readyAction?.includes('aria-label="Lift weights"'));
  assert.ok(completed.includes('aria-label="Free weights, explored"'));
  assert.ok(completed.includes('aria-label="1 of 3 corners explored"'));
  assert.ok(
    completed.includes(
      '<div class="compactProgress"><span>Free weights</span><span>1/3 explored</span></div>',
    ),
  );
  assert.ok(completed.includes("A few controlled lifts"));
});

test("the paused bar disables Play and volume while preserving the explicit resume instruction", () => {
  const html = render("bar", false),
    play = html.match(/<button[^>]*aria-label="Play club music"[^>]*>/)?.[0],
    volume = html.match(/<input[^>]*type="range"[^>]*>/)?.[0];
  assert.ok(play?.includes("disabled"));
  assert.ok(volume?.includes("disabled"));
  assert.ok(html.includes("Use the play control to resume movement"));
});
