import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
const oldCss = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
const { default: SceneryPopup, SceneryNotice } =
  require("../components/SceneryPopup") as typeof import("../components/SceneryPopup");
if (oldCss) require.extensions[".css"] = oldCss;
else delete require.extensions[".css"];

const base = {
  object: {
    id: "tree:1",
    kind: "tree",
    name: "City olive",
    species: "Olive",
    speciesSource: "illustrated",
    x: 0,
    z: 0,
  },
  onPick() {
    throw new Error("rendering cannot select an object");
  },
  onAction() {
    throw new Error("rendering cannot issue a fine or earn XP");
  },
  onClose() {},
};

test("object bubbles announce simulated fine amounts before the user selects a cheeky action", () => {
  const html = renderToStaticMarkup(createElement(SceneryPopup, base));
  assert.match(html, /data-scenery-action="climb"/);
  assert.match(html, /Simulated €5 fine · paid from your game wallet/);
  assert.match(html, /illustrated species/);
  assert.match(html, /walks up first/);
  assert.match(html, /Up to 5 XP/);
  assert.match(html, /Up to 2 XP/);
  assert.match(
    html,
    /One reward per object and action each day, up to 200 new XP daily/,
  );
  assert.ok(
    !html.includes("+5 XP"),
    "revisits and daily caps can award zero XP",
  );
  assert.ok(!html.includes('data-scenery-action="pick-fruit"'));
  const fruit = renderToStaticMarkup(
    createElement(SceneryPopup, {
      ...base,
      object: { ...base.object, id: "fruit-tree:1", fruitBearing: true },
    }),
  );
  assert.match(fruit, /data-scenery-action="pick-fruit"/);
  assert.match(fruit, /Simulated €2 fine/);
});

test("city wallet lists only pending fines, labels game euros, and disables payment while a mutation is underway", () => {
  const html = renderToStaticMarkup(
    createElement(SceneryPopup, {
      ...base,
      object: null,
      walletView: true,
      balanceCents: 29500,
      busy: true,
      snapshot: {
        totalPoints: 17,
        fines: [
          {
            id: "pending",
            amountCents: 500,
            description: "Pending simulated park fine",
            settled: false,
          },
          {
            id: "paid",
            amountCents: 300,
            description: "Already paid old fine",
            settled: true,
          },
        ],
      },
    }),
  );
  assert.match(html, /17 XP/);
  assert.match(html, /Game euros/);
  assert.match(html, /1 to settle/);
  assert.match(html, /Pay €5 fine/);
  assert.match(html, /disabled=""/);
  assert.ok(!html.includes("Already paid old fine"));
  assert.match(html, /No cash value or real payments/);
});

test("arrival and payment notices retain retry and wallet access after the main popup closes", () => {
  const html = renderToStaticMarkup(
    createElement(SceneryNotice, {
      message: "Checking your saved city moment",
      busy: false,
      onRetry() {},
      onWallet() {},
      onClose() {},
    }),
  );
  assert.match(html, /role="status"/);
  assert.match(html, /Try again/);
  assert.match(html, /City wallet/);
  assert.match(html, /Dismiss city moment update/);
  const loading = renderToStaticMarkup(
    createElement(SceneryPopup, {
      ...base,
      object: null,
      walletView: true,
      loading: true,
      snapshot: null,
    }),
  );
  assert.ok(
    !loading.includes("No pending game fines"),
    "loading is not a confirmed empty fine list",
  );
});

test("notice retry, wallet, and dismissal controls have a 44px touch target", () => {
  const css = readFileSync("components/SceneryPopup.module.css", "utf8");
  const actions = css.match(/\.noticeActions button\s*\{([^}]+)\}/)?.[1] || "";
  const dismiss = css.match(/\.dismiss\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(actions, /min-width:\s*44px/);
  assert.match(actions, /min-height:\s*44px/);
  assert.match(dismiss, /width:\s*44px/);
  assert.match(dismiss, /height:\s*44px/);
  assert.match(dismiss, /flex:\s*0 0 44px/);
});
