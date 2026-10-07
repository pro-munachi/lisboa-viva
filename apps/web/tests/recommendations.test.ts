import test from "node:test";
import assert from "node:assert/strict";
import { recommendTrip, profileRecommendations } from "../lib/recommendations";
import { POST } from "../app/api/recommendations/route";
import type { Setup } from "../lib/engine";
const setup: Setup = {
  days: 3,
  budget: 300,
  base: "Graça",
  shirt: "#687f73",
  style: "Culture seeker",
  persona: "nomad",
  arrival: "airport",
  accommodation: "coliving",
  interests: ["food", "community"],
  startDate: "2026-10-07",
  endDate: "2026-10-10",
};

test("profile picks work without credentials and preserve interest/category choices", async () => {
  let calls = 0;
  const result = await recommendTrip(setup, {
    fetcher: (async () => {
      calls++;
      throw new Error();
    }) as typeof fetch,
  });
  assert.equal(result.source, "curated");
  assert.equal(calls, 0);
  assert.deepEqual(result.items, profileRecommendations(setup));
  assert.ok(result.items.some((item) => item.place === "cafe"));
  assert.ok(
    result.items.some(
      (item) => item.place === "benfica" || item.place === "exchange",
    ),
  );
  assert.equal(
    new Set(result.items.map((item) => item.place)).size,
    result.items.length,
  );
});
test("AI ranks only allowed chapter IDs and receives no calendar dates, avatar colour, free text or browser history", async () => {
  let payload: Record<string, unknown> = {};
  const result = await recommendTrip(setup, {
    key: "test-only",
    fetcher: (async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      payload = JSON.parse(options?.body as string);
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  places: ["cafe", "benfica", "exchange"],
                }),
              },
            ],
          },
        ],
      });
    }) as typeof fetch,
  });
  assert.equal(result.source, "ai");
  assert.deepEqual(
    result.items.map((item) => item.place),
    ["cafe", "benfica", "exchange"],
  );
  assert.equal(payload.store, false);
  const profile = JSON.parse(payload.input as string).profile;
  assert.equal(profile.accommodation, "coliving");
  assert.equal(profile.days, 3);
  assert.equal(profile.startDate, undefined);
  assert.equal(profile.endDate, undefined);
  assert.equal(profile.shirt, undefined);
});
test("invalid, duplicate, incomplete and unavailable AI output falls back to the original profile", async () => {
  for (const response of [
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"places":["cafe","__proto__","exchange"]}',
            },
          ],
        },
      ],
    },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"places":["cafe","cafe","exchange"]}',
            },
          ],
        },
      ],
    },
  ]) {
    const result = await recommendTrip(setup, {
      key: "test-only",
      fetcher: (async () => Response.json(response)) as typeof fetch,
    });
    assert.equal(result.source, "curated");
    assert.deepEqual(result.items, profileRecommendations(setup));
  }
  const offline = await recommendTrip(setup, {
    key: "test-only",
    fetcher: (async () =>
      new Response("Unavailable", { status: 503 })) as typeof fetch,
  });
  assert.equal(offline.source, "curated");
});
test("slow AI requests abort within the budget and invalid profile never issues a request", async () => {
  let aborted = false;
  const result = await recommendTrip(setup, {
    key: "test-only",
    timeoutMs: 5,
    fetcher: (async (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("Aborted"));
        }),
      )) as typeof fetch,
  });
  assert.equal(aborted, true);
  assert.equal(result.source, "curated");
  await assert.rejects(
    recommendTrip(
      { ...setup, interests: ["unsafe" as never] },
      {
        fetcher: (async () => {
          throw new Error("Must not fetch");
        }) as typeof fetch,
      },
    ),
    /valid trip/,
  );
});
test("recommendation endpoint bounds JSON and rejects cross-origin or forged profiles", async () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://127.0.0.1/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  assert.equal(
    (await POST(request("{}", { Origin: "https://unrelated.example" }))).status,
    403,
  );
  assert.equal(
    (await POST(request("{}", { "Content-Type": "text/plain" }))).status,
    415,
  );
  assert.equal((await POST(request("not json"))).status, 400);
  assert.equal(
    (
      await POST(
        request(JSON.stringify({ setup: { ...setup, persona: "__proto__" } })),
      )
    ).status,
    400,
  );
  assert.equal((await POST(request(" ".repeat(4100)))).status, 413);
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const response = await POST(request(JSON.stringify({ setup })));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).source, "curated");
    const localAlias = await POST(new Request("http://localhost:3021/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3021", Host: "127.0.0.1:3021" },
      body: JSON.stringify({ setup }),
    }));
    assert.equal(localAlias.status, 200);
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});

test("leaving a recommendations request also cancels the upstream AI request", async () => {
  const browser = new AbortController();
  let upstreamAborted = false;
  const pending = recommendTrip(setup, {
    key: "test-only",
    signal: browser.signal,
    fetcher: (async (_url, options) => {
      browser.abort();
      upstreamAborted = options?.signal?.aborted === true;
      throw new Error("Cancelled");
    }) as typeof fetch,
  });
  assert.equal((await pending).source, "curated");
  assert.equal(upstreamAborted, true);
  let calls = 0;
  await recommendTrip(setup, {
    key: "test-only",
    signal: browser.signal,
    fetcher: (async () => { calls++; throw new Error(); }) as typeof fetch,
  });
  assert.equal(calls, 0);
});
