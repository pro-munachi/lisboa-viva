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

test("chat opens the nearby shared room while keeping a separate private message inbox", () => {
  const html = render(undefined, true);
  assert.ok(html.includes("Nearby"));
  assert.ok(html.includes("Messages"));
  assert.ok(html.includes("Around Cais do Sodré"));
  assert.ok(
    html.includes(
      "Shared with signed-in players currently around Cais do Sodré.",
    ),
  );
  assert.ok(html.includes("Your private conversations and message inbox"));
  assert.ok(
    html.includes('aria-label="Messages in people around Cais do Sodré"'),
  );
  assert.ok(!html.includes("Only you and @ines"));
  assert.ok(!html.includes("Anyone signed in can join this room."));
  assert.ok(!html.includes("Direct conversation"));
  assert.match(html, /<button type="submit" disabled="">Send/);
});

test("unmapped locations do not offer a pretend place room and sending awaits initial history", () => {
  const html = render();
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*title="Select a mapped place first"/,
  );
  assert.match(html, /<button type="submit" disabled="">Send/);
  assert.ok(html.includes('aria-label="Messages in Lisbon"'));
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*title="Join multiplayer to chat nearby"/,
  );
  assert.ok(html.includes("Your private conversations and message inbox"));
});

test("selecting another account opens a private conversation with inbox navigation and no public prompts", () => {
  const html = renderToStaticMarkup(
    createElement(ChatPanel, {
      user,
      cityId: "lisbon",
      initialPeer: {
        id: "49b27cb0-0011-441a-814e-f3f3ebdf7fd3",
        handle: "ines<script>",
        userType: "local",
      },
      openPeerRequest: 1,
      nearbyArea: "Cais do Sodré",
      peers: [peer],
      onClose: () => undefined,
    }),
  );
  assert.ok(html.includes("Your messages"));
  assert.ok(
    html.includes(
      "Only you and @ines&lt;script&gt; can access this conversation.",
    ),
  );
  assert.ok(html.includes('aria-label="Back to message inbox"'));
  assert.ok(html.includes("Message @ines&lt;script&gt;"));
  assert.ok(!html.includes("Anyone signed in can join this room."));
  assert.ok(!html.includes("Ask a local"));
  assert.ok(!html.includes("Shared with signed-in players currently around"));
  assert.ok(!html.includes("Around Cais do Sodré</h2>"));
  assert.ok(!html.includes("<script>"));
  assert.match(html, /<button type="submit" disabled="">Send/);
});

test("the current account cannot accidentally start a conversation with itself", () => {
  const html = renderToStaticMarkup(
    createElement(ChatPanel, {
      user,
      cityId: "lisbon",
      initialPeer: { id: user.id, handle: user.handle, userType: "tourist" },
      onClose: () => undefined,
    }),
  );
  assert.ok(html.includes("Lisbon city chat"));
  assert.ok(!html.includes("Direct conversation"));
});
