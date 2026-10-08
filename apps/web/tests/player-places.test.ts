import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_PLACES } from "../lib/chat-rooms";
import { playerPlace } from "../lib/player-places";
import { VENUES } from "../lib/venues";

test("shared presence resolves the exact public chat roster without private or arbitrary rooms", () => {
  for (const source of CHAT_PLACES) {
    const place = playerPlace(source.id)!;
    assert.equal(place.name, source.label);
    assert.ok(Number.isFinite(place.lat) && Number.isFinite(place.lng));
    assert.equal(place.hotspot.id, source.id);
  }
  for (const id of [
    "home",
    "private-home",
    "unknown",
    "lisbon:city",
    "direct:123",
    "custom-pin",
  ])
    assert.equal(playerPlace(id), undefined);
  assert.equal(playerPlace("transit-airport")?.kind, "airport");
});

test("joinable places use original public venue scenes while beaches stay outdoors", () => {
  for (const venue of VENUES) {
    const place = playerPlace(venue.id)!;
    assert.equal(place.lng, venue.point[0]);
    assert.equal(place.lat, venue.point[1]);
    assert.equal(place.hotspot.sourceUrl, venue.sourceUrl);
    if (venue.category === "beach") assert.equal(place.kind, undefined);
    if (venue.category === "gym") assert.equal(place.kind, "gym");
    if (venue.category === "cafe") assert.equal(place.kind, "cafe");
  }
});
