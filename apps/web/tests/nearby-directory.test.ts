import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
import type { AuthUser } from "../lib/auth";
import { MultiplayerProvider, type MultiplayerPeer } from "../lib/multiplayer";
import { VENUES } from "../lib/venues";
import { playerPlace } from "../lib/player-places";

const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
const NearbyPlayers = require("../components/NearbyPlayers")
  .default as typeof import("../components/NearbyPlayers").default;
const MultiplayerDock = require("../components/MultiplayerDock")
  .default as typeof import("../components/MultiplayerDock").default;
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

const user = {
  id: "ec00c1d2-7703-46b6-9800-6a516fa2bb95",
  handle: "muna",
  userType: "tourist",
  appearance: DEFAULT_APPEARANCE,
} as AuthUser;
const cafe = VENUES.find((venue) => playerPlace(venue.id)?.kind === "cafe")!;
const peer = (
  id = "49b27cb0-0011-441a-814e-f3f3ebdf7fd3",
  placeId?: string,
): MultiplayerPeer => ({
  id,
  handle: "ines",
  userType: "local",
  latitude: 38.7061,
  longitude: -9.1459,
  area: "Cais do Sodré",
  distanceMetres: 250,
  placeId,
  lastSeenAt: "2026-10-07T15:00:00Z",
  appearance: DEFAULT_APPEARANCE,
});
const noAction = () => {
  throw new Error("Rendering must not select, message or move anyone");
};
const render = (
  peers: MultiplayerPeer[],
  options: {
    currentPlaceId?: string;
    enabled?: boolean;
    status?: "connecting" | "online" | "reconnecting" | "hidden";
  } = {},
) =>
  renderToStaticMarkup(
    createElement(NearbyPlayers, {
      peers,
      user,
      onSelect: noAction,
      onMessage: noAction,
      onJoin: noAction,
      onClose: noAction,
      ...options,
    }),
  );

test("nearby dock keeps a discovery button and privacy control, without the permanent player roster", () => {
  const html = renderToStaticMarkup(
    createElement(MultiplayerProvider, {
      user,
      children: createElement(MultiplayerDock, {
        onFind: noAction,
        onSelect: noAction,
        inside: true,
      }),
    }),
  );
  assert.ok(html.includes("Find nearby players"));
  assert.ok(html.includes('data-inside="true"'));
  assert.ok(html.includes('aria-label="Hide me from multiplayer"'));
  assert.ok(html.includes('aria-haspopup="dialog"'));
  assert.ok(!html.includes("multiplayer-list"));
  assert.ok(!html.includes("Other players will appear here"));
});

test("connection failures are distinct from a quiet location and leaving is only confirmed after acknowledgement", () => {
  const reconnecting = render([], { status: "reconnecting" });
  assert.ok(reconnecting.includes("Reconnecting to the city"));
  assert.ok(reconnecting.includes("Finding nearby players"));
  assert.ok(!reconnecting.includes("A little quiet around here"));
  assert.ok(!reconnecting.includes("0 players nearby"));
  const recent = render([peer()], { status: "reconnecting" });
  assert.ok(recent.includes("Showing recently seen players"));
  assert.ok(recent.includes("@ines"));
  const leaving = render([], { enabled: false, status: "reconnecting" });
  assert.ok(leaving.includes("Leaving the map"));
  assert.ok(leaving.includes("has not yet been confirmed"));
  assert.ok(!leaving.includes("You’re hidden from the city"));
  const confirmed = render([], { enabled: false, status: "hidden" });
  assert.ok(confirmed.includes("You’re hidden from the city"));
});

test("nearby directory exposes real venue and identity actions, with an explicit in-app location boundary", () => {
  const html = render([peer(undefined, cafe.id), peer(user.id, cafe.id)]);
  assert.ok(html.includes("1 player nearby"));
  assert.ok(html.includes("@ines"));
  const escapedName = renderToStaticMarkup(
    createElement("span", null, cafe.name),
  ).slice(6, -7);
  assert.ok(html.includes(escapedName));
  assert.ok(html.includes("Message"));
  assert.ok(html.includes("Join them"));
  assert.ok(html.includes("250 m from your ROAM location"));
  assert.ok(html.includes("not someone’s physical GPS location"));
  assert.ok(!html.includes("@muna"));
});

test("unmapped and unavailable places never offer a false join action; only nearby peers render", () => {
  const html = render([
    peer(undefined, "custom-home-secret"),
    {
      ...peer("9684aa03-c50a-4131-85a1-87ee9b0717cd", cafe.id),
      handle: "far-away",
      distanceMetres: 2001,
    },
  ]);
  assert.ok(html.includes("Cais do Sodré"));
  assert.ok(!html.includes("Join them"));
  assert.ok(!html.includes("custom-home-secret"));
  assert.ok(!html.includes("far-away"));
  assert.ok(!html.includes("At a public venue"));
});

test("same-place participants remain discoverable and hidden mode never exposes a stale roster", () => {
  const distant = { ...peer(undefined, cafe.id), distanceMetres: 7000 };
  const html = render([distant], { currentPlaceId: cafe.id });
  assert.ok(html.includes("Same place as you"));
  assert.ok(html.includes("Enter this venue"));
  const hidden = render([distant], { currentPlaceId: cafe.id, enabled: false });
  assert.ok(hidden.includes("0 players nearby"));
  assert.ok(hidden.includes("You’re hidden from the city"));
  assert.ok(!hidden.includes("@ines"));
  assert.ok(!hidden.includes("Message"));
});
