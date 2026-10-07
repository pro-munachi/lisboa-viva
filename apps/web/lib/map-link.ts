import { parseGoogleMapsLink, type GoogleHotspot } from "./google-maps";
import { containsGeo, GEO_BOUNDS } from "./geography";

export const MAP_LINK_LIMIT = 2048;

/** Exact hosts and Maps-only paths; never an arbitrary URL fetch endpoint. */
export function approvedMapLinkURL(input: string): URL | null {
  try {
    const text = input.trim();
    if (
      !text ||
      text.length > MAP_LINK_LIMIT ||
      /[\u0000-\u001f\u007f]/.test(text)
    )
      return null;
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    const short =
      url.hostname === "maps.app.goo.gl"
        ? /^\/[A-Za-z0-9_-]{4,200}\/?$/.test(url.pathname)
        : url.hostname === "goo.gl"
          ? /^\/maps\/[A-Za-z0-9_-]{4,200}\/?$/.test(url.pathname)
          : false;
    const full =
      ["google.com", "www.google.com", "google.pt", "www.google.pt"].includes(
        url.hostname,
      ) && /^\/maps(?:\/|$)/.test(url.pathname);
    const dedicated =
      url.hostname === "maps.google.com" &&
      (url.pathname === "/" || /^\/maps(?:\/|$)/.test(url.pathname));
    if (!short && !full && !dedicated) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function supportedMapLinkPin(url: URL | string): GoogleHotspot | null {
  const approved = approvedMapLinkURL(String(url));
  if (!approved) return null;
  const pin = parseGoogleMapsLink(approved.href);
  return pin && containsGeo(GEO_BOUNDS, [pin.lng, pin.lat]) ? pin : null;
}

/** Full coordinate URLs work offline; short links use the bounded server resolver.
 * Persist the returned expanded mapsUrl, so pin restoration remains keyless.
 */
export async function resolveGoogleMapsLink(
  input: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<GoogleHotspot> {
  const approved = approvedMapLinkURL(input);
  if (!approved) throw new Error("Paste an HTTPS Google Maps link.");
  const direct = supportedMapLinkPin(approved);
  if (direct) return direct;
  const response = await (options.fetcher || fetch)("/api/map-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: approved.href }),
    signal: options.signal,
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("The map link could not be opened. Try again.");
  }
  if (!result || typeof result !== "object")
    throw new Error("The map link could not be opened. Try again.");
  const data = result as { hotspot?: unknown; error?: unknown };
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "The map link could not be opened. Try again.",
    );
  if (!data.hotspot || typeof data.hotspot !== "object")
    throw new Error("The map link did not return a supported location.");
  const hotspot = data.hotspot as { mapsUrl?: unknown };
  // Rebuild from the approved coordinate URL instead of trusting JSON coordinates.
  const pin =
    typeof hotspot.mapsUrl === "string"
      ? supportedMapLinkPin(hotspot.mapsUrl)
      : null;
  if (!pin) throw new Error("Choose a location inside the Lisbon–Sintra map.");
  return pin;
}
