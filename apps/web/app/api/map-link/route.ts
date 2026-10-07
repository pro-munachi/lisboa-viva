import {
  MapLinkError,
  resolveMapLinkOnServer,
} from "../../../lib/map-link-resolver";

const BODY_LIMIT = 4096;

async function smallBody(request: Request): Promise<unknown> {
  if (!request.body)
    throw new MapLinkError("Paste a Google Maps link.", 400, "missing_link");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BODY_LIMIT) {
        await reader.cancel();
        throw new MapLinkError("The map link is too long.", 413, "body_limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.parse(text);
    } catch {
      throw new MapLinkError(
        "Send a Google Maps link as JSON.",
        400,
        "invalid_json",
      );
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers.get("content-type") || "",
      )
    )
      throw new MapLinkError(
        "Send a Google Maps link as JSON.",
        415,
        "content_type",
      );
    const body = await smallBody(request);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as { url?: unknown }).url !== "string"
    )
      throw new MapLinkError("Paste a Google Maps link.", 400, "missing_link");
    const hotspot = await resolveMapLinkOnServer((body as { url: string }).url);
    return Response.json({ hotspot }, { headers });
  } catch (error) {
    const failure =
      error instanceof MapLinkError
        ? error
        : new MapLinkError(
            "The map link could not be opened. Try again.",
            502,
            "network_error",
          );
    return Response.json(
      { error: failure.message, code: failure.code },
      { status: failure.status, headers },
    );
  }
}
