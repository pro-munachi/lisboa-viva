import { CONTENT_VERSION } from "./content";
import {
  GEO_BOUNDS,
  GEO_ORIGIN,
  type GeographicBounds,
  type GeoPoint,
} from "./geography";

/** A city is playable only when its geography and authored content are bundled.
 * Identity, coordinates and capabilities stay independent of visual branding.
 */
export type CityBundle = Readonly<{
  schemaVersion: 1;
  id: string;
  name: string;
  country: Readonly<{ code: string; name: string }>;
  status: "available-pilot" | "unavailable";
  timeZone: string;
  currency: string;
  bounds: GeographicBounds;
  origin: GeoPoint;
  focus: Readonly<{ point: GeoPoint; name: string; range: number }>;
  geography: Readonly<{
    coordinateSystem: "WGS84";
    coordinateOrder: "longitude-latitude";
    sceneUnits: "metres";
    sceneAxes: "east-south";
  }>;
  data: Readonly<{
    format: "osm-geography-v1";
    manifest: string;
    terrain: string;
    overview: string;
    venues: string;
    locations: string;
    /** Exact nearby footprint chunks are listed by the manifest. */
    chunkSource: "manifest";
  }>;
  content: Readonly<{ id: string; version: string }>;
  features: Readonly<{
    mappedBuildings: boolean;
    terrain: boolean;
    mappedPlaces: boolean;
    authoredInteriors: boolean;
    simulatedTransport: boolean;
    authoredEncounters: boolean;
    dayNightLighting: boolean;
    googleMaps: "api-key-required" | "unavailable";
    aiRecommendations: "server-key-required" | "unavailable";
  }>;
}>;

const lisbon: CityBundle = Object.freeze({
  schemaVersion: 1,
  id: "lisbon",
  name: "Lisbon",
  country: Object.freeze({ code: "PT", name: "Portugal" }),
  status: "available-pilot",
  timeZone: "Europe/Lisbon",
  currency: "EUR",
  bounds: Object.freeze([...GEO_BOUNDS]) as GeographicBounds,
  origin: Object.freeze([...GEO_ORIGIN]) as GeoPoint,
  focus: Object.freeze({
    point: Object.freeze([-9.1459, 38.7061]) as GeoPoint,
    name: "Cais do Sodré",
    range: 180,
  }),
  geography: Object.freeze({
    coordinateSystem: "WGS84",
    coordinateOrder: "longitude-latitude",
    sceneUnits: "metres",
    sceneAxes: "east-south",
  }),
  data: Object.freeze({
    format: "osm-geography-v1",
    manifest: "/data/lisbon-manifest.json.gz",
    terrain: "/data/lisbon-terrain.json.gz",
    overview: "/data/lisbon-overview.json.gz",
    venues: "/data/lisbon-venues.json",
    locations: "/data/lisbon-locations.json",
    chunkSource: "manifest",
  }),
  content: Object.freeze({ id: "lisbon", version: CONTENT_VERSION }),
  features: Object.freeze({
    mappedBuildings: true,
    terrain: true,
    mappedPlaces: true,
    authoredInteriors: true,
    simulatedTransport: true,
    authoredEncounters: true,
    dayNightLighting: true,
    googleMaps: "api-key-required",
    aiRecommendations: "server-key-required",
  }),
});

/** Adding a playable city requires a real data/content bundle, not a label. */
export const CITY_BUNDLES: Readonly<Record<string, CityBundle>> = Object.freeze(
  {
    lisbon,
  },
);
export const ACTIVE_CITY_ID = "lisbon";
export function getCity(id: unknown): CityBundle {
  if (typeof id !== "string" || !Object.hasOwn(CITY_BUNDLES, id))
    throw new RangeError("This city is not available.");
  const city = CITY_BUNDLES[id];
  if (city.status !== "available-pilot")
    throw new RangeError("This city is not available.");
  return city;
}
export const CITY = getCity(ACTIVE_CITY_ID);

/** Local wall-clock minutes, including the IANA zone's daylight-saving rules.
 * Do not derive city time from the viewer's device zone or a fixed UTC offset.
 */
export function cityMinute(date: Date, timeZone = CITY.timeZone): number {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    throw new RangeError("Provide a valid date for city time.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute))
    throw new RangeError("City time could not be calculated.");
  return hour * 60 + minute;
}
