import { test } from "node:test";
import assert from "node:assert/strict";
import { approvedMapLinkURL, resolveGoogleMapsLink } from "../lib/map-link";
import {
  MapLinkError,
  resolveMapLinkOnServer,
  type MapLinkFetch,
} from "../lib/map-link-resolver";
import { POST } from "../app/api/map-link/route";

const SHORT = "https://maps.app.goo.gl/CaisExample";
const FULL =
  "https://www.google.com/maps/place/Cais+do+Sodre/@38.7105,-9.145,15z/data=!3d38.7063!4d-9.1455";
const rejectCode = (code: string) => (error: unknown) =>
  error instanceof MapLinkError && error.code === code;
const neverFetch: MapLinkFetch = async () => {
  throw new Error("A fetch should not occur.");
};

test("link resolver accepts exact HTTPS Maps hosts and rejects arbitrary URLs before fetching", async () => {
  for (const invalid of [
    "http://maps.app.goo.gl/CaisExample",
    "https://www.google.com:8443/maps?query=38.7,-9.14",
    "https://user:secret@www.google.com/maps?query=38.7,-9.14",
    "https://maps.app.goo.gl.example.com/CaisExample",
    "https://www.google.com./maps?query=38.7,-9.14",
    "https://www.google.com/url?url=http://127.0.0.1",
    "https://goo.gl/anything",
    "https://maps.app.goo.gl/CaisExample\r\nX-Header: injected",
    "https://127.0.0.1/maps",
    "file:///maps",
    "https://www.google.com/maps-fake",
    "x".repeat(2049),
  ]) {
    assert.equal(approvedMapLinkURL(invalid), null, invalid);
    await assert.rejects(
      resolveMapLinkOnServer(invalid, { fetcher: neverFetch }),
      rejectCode("invalid_link"),
    );
  }
  assert.ok(approvedMapLinkURL(SHORT));
  assert.ok(approvedMapLinkURL("https://goo.gl/maps/CaisExample"));
});

test("expanded coordinate URLs resolve locally and prioritize the destination over camera coordinates", async () => {
  const server = await resolveMapLinkOnServer(FULL, { fetcher: neverFetch });
  const client = await resolveGoogleMapsLink(FULL, {
    fetcher: neverFetch as typeof fetch,
  });
  assert.deepEqual(client, server);
  assert.equal(server.lat, 38.7063);
  assert.equal(server.lng, -9.1455);
  assert.equal(server.name, "Cais do Sodre");
});

test("short Maps links follow approved redirects manually and return an expanded coordinate URL", async () => {
  const calls: string[] = [];
  const fetcher: MapLinkFetch = async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "omit");
    assert.ok(init.signal);
    if (calls.length === 1)
      return new Response(null, {
        status: 302,
        headers: { location: "https://www.google.pt/maps/place/Next" },
      });
    return new Response(null, {
      status: 301,
      headers: { location: "/maps?query=38.7063%2C-9.1455" },
    });
  };
  const pin = await resolveMapLinkOnServer(SHORT, { fetcher });
  assert.equal(calls.length, 2);
  assert.equal(
    pin.mapsUrl,
    "https://www.google.pt/maps?query=38.7063%2C-9.1455",
  );
  assert.equal(pin.lng, -9.1455);
});

test("redirect validation blocks private addresses, unrelated Google endpoints and credentials", async () => {
  for (const location of [
    "https://127.0.0.1/private",
    "http://169.254.169.254/latest/meta-data",
    "https://www.google.com/url?url=https://example.com",
    "https://user@maps.app.goo.gl/CaisExample",
    "https://evil.example/maps/@38.7,-9.14",
  ]) {
    let calls = 0;
    await assert.rejects(
      resolveMapLinkOnServer(SHORT, {
        fetcher: async () => {
          calls++;
          return new Response(null, { status: 302, headers: { location } });
        },
      }),
      rejectCode("unsafe_redirect"),
    );
    assert.equal(calls, 1, location);
  }
});

test("redirect loops and long chains stop within the fixed request budget", async () => {
  let loopCalls = 0;
  await assert.rejects(
    resolveMapLinkOnServer(SHORT, {
      fetcher: async () => {
        loopCalls++;
        return new Response(null, {
          status: 302,
          headers: { location: SHORT },
        });
      },
    }),
    rejectCode("redirect_loop"),
  );
  assert.equal(loopCalls, 1);
  let chainCalls = 0;
  await assert.rejects(
    resolveMapLinkOnServer(SHORT, {
      fetcher: async () => {
        chainCalls++;
        return new Response(null, {
          status: 302,
          headers: { location: `https://maps.app.goo.gl/Unique${chainCalls}` },
        });
      },
    }),
    rejectCode("redirect_limit"),
  );
  assert.equal(chainCalls, 4);
});

test("slow Google redirects time out and abort the outstanding fetch", async () => {
  let aborted = false;
  await assert.rejects(
    resolveMapLinkOnServer(SHORT, {
      timeoutMs: 10,
      fetcher: async (_, init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    }),
    rejectCode("timeout"),
  );
  assert.equal(aborted, true);
});

test("name-only links and upstream failures return clear errors instead of guessing coordinates from page HTML", async () => {
  await assert.rejects(
    resolveMapLinkOnServer(SHORT, {
      fetcher: async () =>
        new Response("fake page !3d38.7!4d-9.14", { status: 200 }),
    }),
    rejectCode("coordinates_unavailable"),
  );
  await assert.rejects(
    resolveMapLinkOnServer(SHORT, {
      fetcher: async () => new Response(null, { status: 503 }),
    }),
    rejectCode("upstream_error"),
  );
});

test("client posts only the approved URL and rebuilds coordinates from the expanded response link", async () => {
  const pin = await resolveGoogleMapsLink(SHORT, {
    fetcher: (async (input, init) => {
      assert.equal(input, "/api/map-link");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { url: SHORT });
      return Response.json({
        hotspot: { mapsUrl: FULL, name: "forged", lat: 0, lng: 0 },
      });
    }) as typeof fetch,
  });
  assert.equal(pin.lat, 38.7063);
  assert.equal(pin.name, "Cais do Sodre");
  await assert.rejects(
    resolveGoogleMapsLink(SHORT, {
      fetcher: (async () =>
        new Response("upstream unavailable", { status: 502 })) as typeof fetch,
    }),
    /The map link could not be opened/,
  );
  await assert.rejects(
    resolveGoogleMapsLink(SHORT, {
      fetcher: (async () =>
        Response.json(
          { error: "Copy a new location link." },
          { status: 422 },
        )) as typeof fetch,
    }),
    /Copy a new location link/,
  );
  await assert.rejects(
    resolveGoogleMapsLink(SHORT, {
      fetcher: (async () =>
        Response.json({
          hotspot: { mapsUrl: "https://evil.example/maps?query=38.7,-9.14" },
        })) as typeof fetch,
    }),
    /inside the Lisbon/,
  );
});

test("POST route bounds JSON bodies, rejects malformed requests and returns uncached validated pins", async () => {
  for (const [body, type, status] of [
    ["{}", "text/plain", 415],
    ["{bad", "application/json", 400],
    ["[]", "application/json", 400],
    [JSON.stringify({ url: "x".repeat(4096) }), "application/json", 413],
  ] as const) {
    const response = await POST(
      new Request("http://localhost/api/map-link", {
        method: "POST",
        headers: { "Content-Type": type },
        body,
      }),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const response = await POST(
    new Request("http://localhost/api/map-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: FULL }),
    }),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.hotspot.lat, 38.7063);
});
