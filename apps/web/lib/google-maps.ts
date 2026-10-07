export type Coordinates = { lat: number; lng: number };
export type GoogleHotspot = Coordinates & {
  id: string;
  name: string;
  mapsUrl?: string;
  address?: string;
  /** Google Places content stays in memory; only place IDs may be persisted. */
  googlePlaceId?: string;
  attribution?: { provider: string; url?: string }[];
};
export type GoogleCameraFocus = Coordinates & {
  altitude?: number;
  range?: number;
  label?: string;
};

type MapCamera = {
  center: Coordinates & { altitude: number };
  range: number;
  heading: number;
  tilt: number;
};
export interface GoogleMapElement extends HTMLElement {
  center: MapCamera["center"];
  range: number;
  heading: number;
  tilt: number;
  flyCameraTo(options: { endCamera: MapCamera; durationMillis: number }): void;
  stopCameraAnimation(): void;
}
export type GoogleMaps3DLibrary = {
  Map3DElement: new (
    options: MapCamera & {
      mode: "HYBRID" | "SATELLITE";
      gestureHandling: "GREEDY";
      description: string;
    },
  ) => GoogleMapElement;
  Marker3DInteractiveElement: new (options: {
    position: Coordinates;
    altitudeMode: "CLAMP_TO_GROUND";
    label: string;
    title: string;
    drawsWhenOccluded: boolean;
    sizePreserved: boolean;
  }) => HTMLElement;
};
type PlaceResult = {
  id: string;
  displayName?: string | null;
  location?: { lat(): number; lng(): number } | null;
  formattedAddress?: string;
  googleMapsURI?: string;
  attributions?: { provider?: string; providerURI?: string }[];
};
type GooglePlacesLibrary = {
  Place: {
    searchByText(request: {
      textQuery: string;
      fields: string[];
      locationBias: { center: Coordinates; radius: number };
      language: string;
      region: string;
      maxResultCount: number;
    }): Promise<{ places: PlaceResult[] }>;
  };
};
export interface GoogleMapsRuntime {
  importLibrary(name: "maps3d"): Promise<GoogleMaps3DLibrary>;
  importLibrary(name: "places"): Promise<GooglePlacesLibrary>;
}
declare global {
  interface Window {
    google?: { maps?: GoogleMapsRuntime };
    __roamGoogleMapsReady?: () => void;
  }
}

// This is a browser key by design. Restrict it to the app's origins and APIs.
const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
export const isGoogleMapsConfigured = Boolean(browserKey);
let loadingMaps: Promise<GoogleMapsRuntime> | undefined;

/** Load once, on demand. No Google request is sent without a configured key. */
export function loadGoogleMaps(): Promise<GoogleMapsRuntime> {
  if (!browserKey)
    return Promise.reject(
      new Error("Google 3D needs a configured Maps API key."),
    );
  if (typeof window === "undefined")
    return Promise.reject(new Error("Google Maps runs in the browser."));
  if (window.google?.maps?.importLibrary)
    return Promise.resolve(window.google.maps);
  if (loadingMaps) return loadingMaps;

  loadingMaps = new Promise<GoogleMapsRuntime>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "roam-google-maps";
    script.async = true;
    script.nonce =
      document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || "";
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      // A late script callback must remain harmless after a timeout.
      window.__roamGoogleMapsReady = () => {};
      script.remove();
      loadingMaps = undefined;
      reject(
        new Error(
          "Google Maps could not load. Check the key, enabled APIs and connection.",
        ),
      );
    };
    const timeout = window.setTimeout(fail, 20_000);
    window.__roamGoogleMapsReady = () => {
      if (settled) return;
      const maps = window.google?.maps;
      if (!maps?.importLibrary) return fail();
      settled = true;
      window.clearTimeout(timeout);
      resolve(maps);
    };
    script.onerror = fail;
    const params = new URLSearchParams({
      key: browserKey,
      v: "weekly",
      loading: "async",
      callback: "__roamGoogleMapsReady",
      language: "en",
      region: "PT",
      auth_referrer_policy: "origin",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    document.head.append(script);
  });
  return loadingMaps;
}

export function validCoordinates(value: Coordinates): boolean {
  return (
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

/** Pilot region, including Sintra. This is a search envelope, not city boundaries. */
export function inLisbonRegion(value: Coordinates): boolean {
  return (
    validCoordinates(value) &&
    value.lat >= 38.6 &&
    value.lat <= 38.95 &&
    value.lng >= -9.55 &&
    value.lng <= -9.0
  );
}

/** An explicit search is billable when Google Places is configured. Never prefetch. */
export async function searchGooglePlaces(
  query: string,
  center: Coordinates = { lat: 38.7223, lng: -9.1393 },
): Promise<GoogleHotspot[]> {
  const textQuery = query.trim().replace(/\s+/g, " ");
  if (textQuery.length < 2 || textQuery.length > 120)
    throw new Error("Use a place name between 2 and 120 characters.");
  if (!inLisbonRegion(center))
    throw new Error("Search around Lisbon or Sintra.");
  const maps = await loadGoogleMaps();
  const { Place } = await maps.importLibrary("places");
  const { places } = await Place.searchByText({
    textQuery,
    fields: [
      "id",
      "displayName",
      "location",
      "formattedAddress",
      "googleMapsURI",
    ],
    locationBias: { center, radius: 30_000 },
    language: "en",
    region: "PT",
    maxResultCount: 8,
  });
  return places.flatMap((place) => {
    if (!place.location) return [];
    const coordinates = {
      lat: place.location.lat(),
      lng: place.location.lng(),
    };
    if (!inLisbonRegion(coordinates)) return [];
    return [
      {
        id: `google:${place.id}`,
        googlePlaceId: place.id,
        name: place.displayName || "Google Maps place",
        ...coordinates,
        address: place.formattedAddress,
        mapsUrl:
          place.googleMapsURI ||
          `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}&query_place_id=${encodeURIComponent(place.id)}`,
        attribution: place.attributions?.map((credit) => ({
          provider: credit.provider || "Data provider",
          url: credit.providerURI,
        })),
      },
    ];
  });
}

/**
 * Read coordinates explicitly present in a full Maps URL, without fetching it.
 * Short links and name-only links need an expanded link or an explicit Places search.
 * An @lat,lng URL is a camera location, so its pin is labelled as a map view.
 */
export function parseGoogleMapsLink(input: string): GoogleHotspot | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hosts = [
      "google.com",
      "www.google.com",
      "maps.google.com",
      "google.pt",
      "www.google.pt",
    ];
    if (
      !hosts.includes(url.hostname) ||
      (url.hostname !== "maps.google.com" &&
        !/^\/maps(?:\/|$)/.test(url.pathname))
    )
      return null;
    const text = decodeURIComponent(url.pathname + url.search);
    const destination = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const query = (
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      ""
    ).match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s+\(([^()\r\n]{1,120})\))?\s*$/,
    );
    const view = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const match = destination || query || view;
    if (!match) return null;
    const point = { lat: Number(match[1]), lng: Number(match[2]) };
    if (!inLisbonRegion(point)) return null;
    const placeName = url.pathname.match(/\/place\/([^/]+)/)?.[1];
    return {
      id: `pin:${point.lat.toFixed(6)},${point.lng.toFixed(6)}`,
      name:
        destination && placeName
          ? decodeURIComponent(placeName).replace(/\+/g, " ")
          : query
            ? query[3]?.trim() || "Your map pin"
            : "Google Maps camera view",
      ...point,
      mapsUrl: url.href,
    };
  } catch {
    return null;
  }
}
