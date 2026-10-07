// Run with node --import ./apps/web/node_modules/tsx/dist/loader.mjs
// scripts/chat-rooms-build.cjs after changing the mapped room directory.
const fs = require("node:fs");
const path = require("node:path");
const { CHAT_ROOM_IDS } = require("../apps/web/lib/chat-rooms.ts");

fs.writeFileSync(
  path.join(__dirname, "../services/game/chat_rooms.json"),
  JSON.stringify(CHAT_ROOM_IDS, null, 2) + "\n",
);
console.log(`Generated ${CHAT_ROOM_IDS.length} canonical ROAM chat rooms.`);
