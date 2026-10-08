import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GET as getActivities,
  POST as postActivities,
} from "../app/api/activities/[[...path]]/route";
import { GET as getWallet } from "../app/api/wallet/route";
import { MAX_BACKEND_BODY_BYTES } from "../lib/backend";

const id = "9e08d134-4e91-4b4a-9c8b-0a4c1c49c405";
const context = (path?: string[]) => ({ params: Promise.resolve({ path }) });
async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
function request(path: string, body?: BodyInit, origin = "https://roam.test") {
  return new Request(`https://roam.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "roam.test",
      origin,
      "content-type": "application/json",
      cookie: "lv_session=opaque",
    },
    ...(body === undefined ? {} : { body }),
  });
}

test("activity feed/room and wallet proxy reads preserve sessions, queries and no-store without leaking internal headers", async () => {
  const urls: string[] = [];
  await withFetch(
    (async (input, options) => {
      const url = new URL(String(input));
      urls.push(url.pathname + url.search);
      assert.equal(options?.method, "GET");
      assert.equal(options?.cache, "no-store");
      assert.equal(options?.redirect, "manual");
      assert.equal(
        new Headers(options?.headers).get("cookie"),
        "lv_session=opaque",
      );
      assert.equal(options?.body, undefined);
      return Response.json(
        { activities: [], wallet: { balance: 200, currency: "ROAM credits" } },
        { headers: { "x-internal-host": "do-not-forward" } },
      );
    }) as typeof fetch,
    async () => {
      for (const response of [
        await getActivities(request("/api/activities?limit=20"), context()),
        await getActivities(request(`/api/activities/${id}`), context([id])),
        await getWallet(request("/api/wallet")),
      ]) {
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.has("x-internal-host"), false);
        assert.equal((await response.json()).wallet.balance, 200);
      }
      assert.deepEqual(urls, [
        "/v1/activities?limit=20",
        `/v1/activities/${id}`,
        "/v1/wallet",
      ]);
    },
  );
});

test("activity write proxy forwards exact bounded JSON for all concrete room operations", async () => {
  const paths: string[] = [];
  const body = JSON.stringify({ clientId: id, body: "Meet at the entrance?" });
  await withFetch(
    (async (input, options) => {
      paths.push(new URL(String(input)).pathname);
      assert.equal(options?.method, "POST");
      assert.equal(
        new TextDecoder().decode(options?.body as ArrayBuffer),
        body,
      );
      return Response.json({ error: "activity_full" }, { status: 409 });
    }) as typeof fetch,
    async () => {
      for (const operation of [
        undefined,
        "join",
        "leave",
        "messages",
        "actions",
      ]) {
        const path = operation ? [id, operation] : [];
        const response = await postActivities(
          request(`/api/activities/${path.join("/")}`, body),
          context(path),
        );
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: "activity_full" });
      }
      assert.deepEqual(paths, [
        "/v1/activities",
        ...["join", "leave", "messages", "actions"].map(
          (operation) => `/v1/activities/${id}/${operation}`,
        ),
      ]);
    },
  );
});

test("invalid activity paths, cross-origin writes and oversized bodies never reach the backend", async () => {
  let calls = 0;
  await withFetch(
    (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch,
    async () => {
      for (const path of [
        [".."],
        [id, "messages", "extra"],
        ["x?admin=true"],
        ["%2Fadmin"],
        [""],
      ]) {
        const response = await getActivities(
          request("/api/activities"),
          context(path),
        );
        assert.equal(response.status, 400);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
      assert.equal(
        (
          await postActivities(
            request(
              `/api/activities/${id}/join`,
              "{}",
              "https://attacker.test",
            ),
            context([id, "join"]),
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await postActivities(
            request(
              "/api/activities",
              new Uint8Array(MAX_BACKEND_BODY_BYTES + 1),
            ),
            context(),
          )
        ).status,
        413,
      );
      assert.equal(calls, 0);
    },
  );
});
