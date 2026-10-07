import test from "node:test";
import assert from "node:assert/strict";
import { accountStorageKeys } from "../lib/account-storage";
import { STORAGE_KEY, newTrip, serialize, restore } from "../lib/engine";
import { PIN_KEY } from "../lib/world-state";

test("switching accounts cannot read or delete another account's browser progress", () => {
  const a = accountStorageKeys("00000000-0000-4000-8000-000000000001");
  const b = accountStorageKeys("00000000-0000-4000-8000-000000000002");
  const browser = new Map<string, string>();
  const save = serialize(newTrip({days:3,budget:100,base:"Graça",style:"Foodie",shirt:"#ece7df"}, "isolated"));
  browser.set(a.trips, save);
  browser.set(a.pins, "private-a-pin");
  browser.set(STORAGE_KEY, "legacy-trip");
  browser.set(PIN_KEY, "legacy-pins");
  assert.equal(browser.get(b.trips), undefined);
  assert.equal(browser.get(b.pins), undefined);
  browser.delete(b.trips);
  assert.equal(restore(browser.get(a.trips)!)?.id, "isolated");
  assert.equal(browser.get(a.pins), "private-a-pin");
  assert.equal(browser.get(STORAGE_KEY), "legacy-trip");
  assert.equal(browser.get(PIN_KEY), "legacy-pins");
});
test("account namespaces are stable and reject missing identities and unavailable cities", () => {
  const id = "AAAABBBB-CCCC-4000-8000-000000000001";
  assert.deepEqual(accountStorageKeys(id), accountStorageKeys(id.toLowerCase()));
  for (const forged of ["", "guest", "__proto__", "a/b"]) assert.throws(() => accountStorageKeys(forged));
  assert.throws(() => accountStorageKeys(id, "unbundled"));
});
