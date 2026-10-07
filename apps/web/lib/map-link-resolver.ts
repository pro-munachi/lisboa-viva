import { approvedMapLinkURL, supportedMapLinkPin } from "./map-link";
import type { GoogleHotspot } from "./google-maps";

export type MapLinkFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;
export class MapLinkError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REQUESTS = 4;
const TIMEOUT_MS = 6000;
const UNRESOLVED =
  "This link does not reveal coordinates inside our Lisbon–Sintra map. Open it in Google Maps and copy an expanded location link, or search for the place by name.";

/** Read only Google-issued redirects. Never scrape page HTML or guess a location. */
export async function resolveMapLinkOnServer(
  input: string,
  {
    fetcher = (url, init) => fetch(url, init),
    timeoutMs = TIMEOUT_MS,
  }: { fetcher?: MapLinkFetch; timeoutMs?: number } = {},
): Promise<GoogleHotspot> {
  let url = approvedMapLinkURL(input);
  if (!url)
    throw new MapLinkError(
      "Paste an HTTPS Google Maps link.",
      400,
      "invalid_link",
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const visited = new Set<string>();
  try {
    for (let request = 0; request < MAX_REQUESTS; request++) {
      const pin = supportedMapLinkPin(url);
      if (pin) return pin;
      if (visited.has(url.href))
        throw new MapLinkError(
          "The map link redirects in a loop. Copy a new share link from Google Maps.",
          422,
          "redirect_loop",
        );
      visited.add(url.href);
      const response = await fetcher(url.href, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "text/html" },
        signal: controller.signal,
      });
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (response.redirected)
        throw new MapLinkError(
          "The map link could not be safely expanded.",
          502,
          "unexpected_redirect",
        );
      if (!REDIRECT_STATUSES.has(response.status)) {
        if (!response.ok)
          throw new MapLinkError(
            "Google Maps could not open that link. Check it or try again.",
            502,
            "upstream_error",
          );
        throw new MapLinkError(UNRESOLVED, 422, "coordinates_unavailable");
      }
      if (!location)
        throw new MapLinkError(UNRESOLVED, 422, "coordinates_unavailable");
      let next: URL | null = null;
      try {
        next = approvedMapLinkURL(new URL(location, url).href);
      } catch {}
      if (!next)
        throw new MapLinkError(
          "This link redirects outside Google Maps. Copy a location share link from Google Maps.",
          422,
          "unsafe_redirect",
        );
      url = next;
    }
    const pin = supportedMapLinkPin(url);
    if (pin) return pin;
    throw new MapLinkError(
      "The map link has too many redirects. Copy a new location share link from Google Maps.",
      422,
      "redirect_limit",
    );
  } catch (error) {
    if (error instanceof MapLinkError) throw error;
    if (controller.signal.aborted)
      throw new MapLinkError(
        "The map link took too long to open. Try again or paste the expanded link.",
        504,
        "timeout",
      );
    throw new MapLinkError(
      "The map link could not be opened. Check your connection or try an expanded link.",
      502,
      "network_error",
    );
  } finally {
    clearTimeout(timeout);
  }
}
