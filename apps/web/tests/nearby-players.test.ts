import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NearbyArrivalTracker,
  nearbyDistance,
  nearbyPlayers,
} from "../lib/nearby-players";

const peer = (id: string, distanceMetres = 100, placeId?: string) => ({
  id,
  distanceMetres,
  placeId,
});

test("nearby discovery uses 2 km of the current ROAM location, always includes same-place peers, and sorts them first", () => {
  const original = [
    peer("far", 2001),
    peer("border", 2000),
    peer("close", 20),
    peer("same", 8000, "cafe-123"),
    peer("same", 8000, "cafe-123"),
    peer("invalid", NaN),
    peer("negative", -1),
  ];
  assert.deepEqual(
    nearbyPlayers(original, "cafe-123").map((item) => item.id),
    ["same", "close", "border"],
  );
  assert.deepEqual(
    nearbyPlayers(original).map((item) => item.id),
    ["close", "border"],
  );
  assert.equal(
    original[0].id,
    "far",
    "discovery must not reorder the provider roster",
  );
});

test("the first successful roster is silent and polling or metadata changes do not repeat notices", () => {
  const tracker = new NearbyArrivalTracker();
  assert.equal(tracker.update([], false, 0), null);
  assert.equal(tracker.update([peer("a")], true, 1000), null);
  assert.equal(
    tracker.update(
      [{ ...peer("a"), handle: "new-name", distanceMetres: 1 }],
      true,
      2000,
    ),
    null,
  );
  assert.equal(tracker.update([peer("a"), peer("b")], true, 3000)?.id, "b");
  assert.equal(tracker.update([peer("b"), peer("a")], true, 4000), null);
});

test("nearby notice bursts are throttled, without queueing suppressed arrivals for later", () => {
  const tracker = new NearbyArrivalTracker();
  tracker.update([], true, 0);
  assert.equal(tracker.update([peer("a")], true, 1000)?.id, "a");
  assert.equal(
    tracker.update([peer("a"), peer("b"), peer("c")], true, 2000),
    null,
  );
  assert.equal(
    tracker.update([peer("a"), peer("b"), peer("c")], true, 32_000),
    null,
  );
  assert.equal(
    tracker.update([peer("a"), peer("b"), peer("c"), peer("d")], true, 33_000)
      ?.id,
    "d",
  );
});

test("leaving and returning nearby does not repeat a notice; hidden/reconnected rosters seed silently", () => {
  const tracker = new NearbyArrivalTracker();
  tracker.update([], true, 0);
  assert.equal(tracker.update([peer("a")], true, 1000)?.id, "a");
  tracker.update([], true, 40_000);
  assert.equal(tracker.update([peer("a")], true, 50_000), null);
  tracker.update([], false, 60_000);
  assert.equal(tracker.update([peer("a"), peer("b")], true, 70_000), null);
  assert.equal(
    tracker.update([peer("a"), peer("b"), peer("c")], true, 80_000)?.id,
    "c",
  );
});

test("nearby notifications forget long-absent identities without retriggering active peers", () => {
  const tracker = new NearbyArrivalTracker();
  tracker.update([peer("a")], true, 0);
  tracker.update([peer("a")], true, 3_590_000);
  assert.equal(tracker.update([peer("a")], true, 3_610_000), null);
  tracker.update([], true, 3_620_000);
  assert.equal(tracker.update([peer("a")], true, 7_230_000)?.id, "a");
});

test("nearby distance labels keep metre precision below one kilometre", () => {
  assert.equal(nearbyDistance(3.8), "4 m");
  assert.equal(nearbyDistance(999), "999 m");
  assert.equal(nearbyDistance(1400), "1.4 km");
});
