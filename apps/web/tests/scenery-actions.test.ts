import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SceneryActionGate,
  definitiveSceneryFailure,
  mergeSceneryState,
  sceneryActions,
  sceneryDescription,
  sceneryFineSummary,
  SCENERY_GRAPHICS,
} from "../lib/scenery-actions";

const base = { id: "tree:1", kind: "tree", name: "City tree", x: 0, z: 0 };
test("wallet summaries distinguish an unknown snapshot from confirmed empty or pending fines", () => {
  assert.equal(sceneryFineSummary(null), "Check city wallet");
  assert.equal(sceneryFineSummary(null, true), "Check city wallet");
  const empty = { totalPoints: 0, fines: [] };
  assert.equal(sceneryFineSummary(empty), "No pending game fines");
  assert.equal(sceneryFineSummary(empty, true), "All clear");
  const pending = {
    totalPoints: 5,
    fines: [
      {
        id: "pending",
        amountCents: 500,
        description: "Simulated fine",
        settled: false,
      },
      {
        id: "paid",
        amountCents: 300,
        description: "Settled fine",
        settled: true,
      },
    ],
  };
  assert.equal(sceneryFineSummary(pending), "1 simulated fine to settle");
  assert.equal(sceneryFineSummary(pending, true), "1 to settle");
});
test("scenery categories distinguish known map species and illustrated planting; fruit choices require fruit trees", () => {
  assert.ok(!sceneryActions(base).some((action) => action.id === "pick-fruit"));
  const fruit = sceneryActions({
    ...base,
    id: "fruit-tree:1",
    fruitBearing: true,
  });
  assert.equal(
    fruit.find((action) => action.id === "pick-fruit")?.fineCents,
    200,
  );
  assert.equal(fruit.find((action) => action.id === "climb")?.fineCents, 500);
  assert.match(sceneryDescription(base), /does not identify/);
  assert.match(
    sceneryDescription({
      ...base,
      species: "Olive",
      speciesSource: "illustrated",
    }),
    /illustrated species/,
  );
  assert.match(
    sceneryDescription({ ...base, species: "Olive", speciesSource: "mapped" }),
    /recorded in the map/,
  );
  assert.equal(
    sceneryActions({ ...base, kind: "street_sign" })[0].id,
    "read-sign",
  );
  assert.equal(SCENERY_GRAPHICS.street_sign, "🪧");
  assert.deepEqual(sceneryActions({ ...base, kind: "untrusted-kind" }), []);
});

test("a synchronous action gate prevents double clicks, retains the arrival and UUID through ambiguous retries, and isolates settlement", () => {
  const gate = new SceneryActionGate();
  let tokens = 0;
  const token = () => `request-${++tokens}`;
  const first = gate.start("bench:1", "sit", token)!;
  assert.ok(first && gate.busy);
  assert.equal(gate.start("bench:1", "sit", token), null);
  assert.equal(gate.lockSettlement(), false);
  assert.equal(tokens, 1);
  gate.arrive(first.requestId);
  gate.finish(first.requestId, true);
  assert.equal(gate.busy, false);
  assert.equal(gate.start("tree:2", "climb", token), null);
  assert.equal(
    gate.lockSettlement(),
    true,
    "a previously saved fine remains payable while the action awaits a retry",
  );
  assert.equal(gate.start("bench:1", "sit", token), null);
  gate.unlockSettlement();
  const retry = gate.start("bench:1", "sit", token)!;
  assert.equal(retry, first);
  assert.equal(retry.arrived, true);
  assert.equal(tokens, 1);
  gate.finish("old-unrelated-request");
  assert.equal(
    gate.busy,
    true,
    "a stale completion cannot unlock a current mutation",
  );
  gate.finish(retry.requestId);
  assert.equal(gate.pending, null);
  const next = gate.start("tree:2", "identify", token)!;
  assert.equal(next.requestId, "request-2");
  gate.finish(next.requestId);
  assert.equal(gate.busy, false);
});

test("unreachable actions and definite rejections discard unused retries while network failures preserve them", () => {
  const gate = new SceneryActionGate();
  const first = gate.start("bench:1", "sit", () => "request-1")!;
  assert.equal(first.arrived, false);
  gate.finish(first.requestId);
  assert.equal(gate.pending, null);
  for (const code of [
    "scenery_cooldown",
    "invalid_scenery_action",
    "scenery_conflict",
    "session_expired",
  ])
    assert.equal(definitiveSceneryFailure(code), true);
  for (const code of [
    "Failed to fetch",
    "service_unavailable",
    "server_error",
    "scenery_invalid",
  ])
    assert.equal(definitiveSceneryFailure(code), false);
});

test("a delayed refresh cannot undo earned XP or make a paid fine pending again", () => {
  const fine = {
    id: "fine-1",
    amountCents: 500,
    description: "Simulated park fine",
    settled: true,
  };
  const current = { totalPoints: 17, fines: [fine] };
  const incoming = {
    totalPoints: 12,
    fines: [
      { ...fine, settled: false },
      { ...fine, id: "fine-2", settled: false },
    ],
  };
  const merged = mergeSceneryState(current, incoming);
  assert.equal(merged.totalPoints, 17);
  assert.equal(
    merged.fines.find((item) => item.id === "fine-1")?.settled,
    true,
  );
  assert.equal(merged.fines[0].id, "fine-2");
  assert.equal(
    current.fines[0],
    fine,
    "merging leaves the saved receipt intact",
  );
});
