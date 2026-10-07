import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuthUser } from "../lib/auth";

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
const render = (place?: { id: string; label: string }) =>
  renderToStaticMarkup(
    createElement(ChatPanel, {
      user,
      cityId: "lisbon",
      place,
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
  assert.ok(!/online|attendees|people here/i.test(html));
  assert.ok(html.includes("Loading recent messages"));
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
