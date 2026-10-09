import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scenerySnapshot,
  sceneryActionResult,
  loadScenery,
  performSceneryAction,
  settleSceneryFine,
} from "../lib/scenery-client";

const id = "7a2bf800-0000-4000-9000-000000000001";
const fine = {
  id,
  amountCents: 500,
  description: "Simulated park fine: climbing a public tree",
  settled: false,
};
const input = {
  requestId: id,
  objectId: "tree:lisbon:1",
  kind: "tree",
  actionId: "climb",
};
const wallet = { currency: "EUR", balanceCents: 29500, entries: [] };
async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("scenery snapshots reject invalid XP and unknown fine prices before displaying game consequences", () => {
  assert.deepEqual(scenerySnapshot({ totalPoints: 5, fines: [fine] }), {
    totalPoints: 5,
    fines: [fine],
  });
  assert.equal(scenerySnapshot({ totalPoints: -1, fines: [] }), null);
  assert.equal(scenerySnapshot({ totalPoints: 0.5, fines: [] }), null);
  assert.equal(
    scenerySnapshot({
      totalPoints: 5,
      fines: [{ ...fine, amountCents: 500000 }],
    }),
    null,
  );
  assert.equal(
    scenerySnapshot({ totalPoints: 5, fines: [{ ...fine, id: "wrong" }] }),
    null,
  );
  assert.equal(sceneryActionResult({ totalPoints: 5, points: 500 }), null);
  assert.equal(
    sceneryActionResult({
      totalPoints: 5,
      points: 2,
      fine: { ...fine, settled: "no" },
    }),
    null,
  );
});

test("actions preserve the caller's request token across retries and settlement uses the saved fine identity", async () => {
  let sends = 0;
  await withFetch(
    (async (url, options) => {
      if (options?.method === "POST" && String(url) === "/api/player/scenery") {
        sends++;
        assert.deepEqual(JSON.parse(String(options.body)), input);
        return Response.json({ points: 2, totalPoints: 7, fine });
      }
      if (options?.method === "POST") {
        assert.equal(String(url), `/api/player/scenery/fines/${id}/settle`);
        assert.equal(
          options.body,
          undefined,
          "the client cannot supply a settlement price",
        );
        return Response.json({
          totalPoints: 7,
          fines: [{ ...fine, settled: true }],
          wallet,
        });
      }
      assert.equal(options?.cache, "no-store");
      return Response.json({ totalPoints: 7, fines: [fine] });
    }) as typeof fetch,
    async () => {
      assert.equal((await loadScenery()).totalPoints, 7);
      assert.equal((await performSceneryAction(input)).fine?.id, id);
      assert.equal((await performSceneryAction(input)).totalPoints, 7);
      assert.equal(sends, 2);
      const paid = await settleSceneryFine(id);
      assert.equal(paid.wallet.balanceCents, 29500);
      assert.equal(paid.fines[0].settled, true);
    },
  );
});

test("backend errors retain cooldown, insufficient balance and authorization meaning", async () => {
  for (const error of [
    "scenery_cooldown",
    "insufficient_funds",
    "session_expired",
    "scenery_conflict",
  ]) {
    await withFetch(
      (async () => Response.json({ error }, { status: 409 })) as typeof fetch,
      async () => {
        await assert.rejects(performSceneryAction(input), new RegExp(error));
        await assert.rejects(settleSceneryFine(id), new RegExp(error));
      },
    );
  }
  await withFetch(
    (async () =>
      Response.json({
        totalPoints: 7,
        fines: [],
        wallet: { ...wallet, balanceCents: -1 },
      })) as typeof fetch,
    async () => {
      await assert.rejects(settleSceneryFine(id), /scenery_invalid/);
    },
  );
  await assert.rejects(
    settleSceneryFine("../another-fine"),
    /invalid_scenery_action/,
  );
});
