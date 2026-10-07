import { validSetup, type Setup } from "../../../lib/engine";
import { recommendTrip } from "../../../lib/recommendations";

const headers = { "Cache-Control": "no-store" };
const attempts = new Map<string, { count: number; reset: number }>();
let active = 0;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  let sameOrigin = !origin || origin === target.origin;
  // Next's internal URL can use localhost while the browser uses 127.0.0.1.
  // Match the actual request authority as well, without allowing unrelated origins.
  if (origin && !sameOrigin) {
    try {
      const source = new URL(origin);
      sameOrigin = source.origin === origin && source.protocol === target.protocol &&
        source.host === request.headers.get("host");
    } catch { sameOrigin = false; }
  }
  if (!sameOrigin)
    return Response.json(
      { error: "Use ROAM to request suggestions." },
      { status: 403, headers },
    );
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") || "",
    )
  )
    return Response.json(
      { error: "Send a trip profile as JSON." },
      { status: 415, headers },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { error: "Choose a trip profile first." },
      { status: 400, headers },
    );
  let raw = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return Response.json(
          { error: "The profile is too large." },
          { status: 413, headers },
        );
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let setup: Setup;
  try {
    const input = JSON.parse(raw)?.setup;
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error();
    // Accept only the profile fields; free text and calendar dates never enter the AI prompt.
    setup = {
      days: input.days,
      budget: input.budget,
      style: input.style,
      base: input.base,
      shirt: input.shirt,
      persona: input.persona,
      arrival: input.arrival,
      interests: input.interests,
      accommodation: input.accommodation,
      startDate: input.startDate,
      endDate: input.endDate,
    };
    if (!validSetup(setup)) throw new Error();
  } catch {
    return Response.json(
      { error: "Choose a valid trip profile first." },
      { status: 400, headers },
    );
  }
  if (process.env.OPENAI_API_KEY) {
    const now = Date.now();
    for (const [id, bucket] of attempts)
      if (bucket.reset <= now) attempts.delete(id);
    const address = (request.headers.get("x-forwarded-for") || "local")
      .split(",")[0]
      .slice(0, 80);
    const bucket = attempts.get(address) || { count: 0, reset: now + 60000 };
    if (active >= 2 || bucket.count >= 3 || attempts.size >= 1000)
      return Response.json(
        { error: "Give your suggestions a moment, then try again." },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    bucket.count++;
    attempts.set(address, bucket);
  }
  active++;
  try {
    return Response.json(
      await recommendTrip(setup, {
        key: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        signal: request.signal,
      }),
      { headers },
    );
  } finally {
    active--;
  }
}
