import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHAT_PLACES, CHAT_ROOM_IDS, chatPlaceFor } from "../lib/chat-rooms";
import { VENUES } from "../lib/venues";

test("Go and the mapped chat directory agree on every allowed room", () => {
  const serverRooms = JSON.parse(
    readFileSync(new URL("../../../services/game/chat_rooms.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(serverRooms, CHAT_ROOM_IDS);
  assert.equal(new Set(CHAT_ROOM_IDS).size, CHAT_ROOM_IDS.length);
  assert.ok(CHAT_ROOM_IDS.every((room) => room.length <= 160));
  assert.equal(CHAT_ROOM_IDS[0], "lisbon:city");
});

test("mapped landmarks, venues and transport hubs have shared rooms; private homes and arbitrary pins do not", () => {
  assert.equal(chatPlaceFor("comercio")?.label, "Praça do Comércio");
  assert.ok(chatPlaceFor("transit-airport")?.label.includes("Airport"));
  const venue = VENUES[0];
  assert.equal(chatPlaceFor(venue.id)?.label, venue.name);
  assert.ok(CHAT_PLACES.length >= VENUES.length);
  for (const id of [undefined, null, "", "home", "google-custom-pin", "lisbon:city", "__proto__"]) {
    assert.equal(chatPlaceFor(id), undefined);
  }
});
