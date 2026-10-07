import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuthUser } from "../lib/auth";
import type { MultiplayerPeer } from "../lib/multiplayer";

const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
const ChatPanel = require("../components/ChatPanel")
  .default as typeof import("../components/ChatPanel").default;
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

const user = {
  id: "test-user",
  handle: "munachi",
  userType: "tourist",
} as AuthUser;
const peer = {
  id: "443262f8-960b-4d3e-995b-b64608c6b1b0",
  handle: "ines",
  userType: "local",
  area: "Cais do Sodré",
} as MultiplayerPeer;
const render = (place?: { id: string; label: string }, multiplayer?: boolean) =>
  renderToStaticMarkup(
    createElement(ChatPanel, {
      user,
      cityId: "lisbon",
      place,
      peers: multiplayer ? [peer] : [],
      nearbyArea: multiplayer ? "Cais do Sodré" : undefined,
      onClose: () => {
        throw new Error("Rendering should not perform an action");
      },
    }),
  );

test("chat exposes real signed-in identity, public-room disclosure and manual draft starters", () => {
  const html = render({ id: "node:123", label: "Café <script>Janis</script>" });
  assert.ok(html.includes('id="roam-chat"'));
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes("Posting as @munachi"));
  assert.ok(html.includes("Anyone signed in can join this room."));
  assert.ok(html.includes("Messages are shared with the room."));
  assert.ok(html.includes("Ask a local"));
  assert.ok(html.includes("Coffee buddy"));
  assert.ok(html.includes("City walk"));
  assert.ok(html.includes("Café &lt;script&gt;Janis&lt;/script&gt;"));
  assert.ok(!html.includes("<script>Janis</script>"));
  assert.ok(!/attendees|people here|[0-9]+ online/i.test(html));
  assert.ok(html.includes("Loading recent messages"));
});

test("chat offers an authorized nearby group and private nearby-player conversation", () => {
  const html = render(undefined, true);
  assert.ok(html.includes("Nearby"));
  assert.ok(html.includes("Private"));
  assert.ok(html.includes("Around Cais do Sodré"));
  assert.ok(
    html.includes(
      "Shared with signed-in players currently around Cais do Sodré.",
    ),
  );
  assert.ok(html.includes("Chat privately with a player you met nearby"));
});

test("unmapped locations do not offer a pretend place room and sending awaits initial history", () => {
  const html = render();
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*title="Select a mapped place first"/,
  );
  assert.match(html, /<button type="submit" disabled="">Send/);
  assert.ok(html.includes('aria-label="Messages in Lisbon"'));
});
