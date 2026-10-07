import directory from "../public/data/lisbon-locations.json";
import { GEO_ORIGIN, projectGeo, type GeoPoint } from "./geography";

export interface MapLocation {
  id: string;
  name: string;
  kind: "street" | "place";
  lat: number;
  lng: number;
  area?: string;
  sourceUrl: string;
  mapsUrl: string;
  description: string;
  osmType: "node" | "way";
  osmId: number;
  positionSource: "osm-node" | "way-centroid" | "mapped-route-focus";
  placeKind?: string;
  highway?: string;
  wayCount?: number;
}

export const MAP_LOCATIONS: readonly MapLocation[] = directory.locations.map(
  (location) => ({
    ...location,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.lat},${location.lng} (${location.name})`)}`,
  }),
) as MapLocation[];
export const MAP_LOCATION_SOURCE = directory.source;
export const MAP_LOCATION_COUNTS = directory.counts;
export const MAP_LOCATION_LIMITATIONS = directory.limitations;

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT");

/** Find mapped street/locality names offline; this is not an address geocoder. */
export function searchMapLocations(
  query: string,
  limit = 30,
  near: GeoPoint = GEO_ORIGIN,
): MapLocation[] {
  const normalized = normalize(query).trim();
  if (!normalized || limit <= 0) return [];
  const words = normalized.split(/\s+/);
  const origin = projectGeo(near);
  const distance = (location: MapLocation) => {
    const p = projectGeo([location.lng, location.lat]);
    return Math.hypot(p.x - origin.x, p.z - origin.z);
  };
  const score = (location: MapLocation) => {
    const name = normalize(location.name);
    return name === normalized
      ? 0
      : name.startsWith(normalized)
        ? 1
        : location.kind === "place"
          ? 2
          : 3;
  };
  return MAP_LOCATIONS.filter((location) => {
    const text = normalize(`${location.name} ${location.area || ""}`);
    return words.every((word) => text.includes(word));
  })
    .sort(
      (a, b) =>
        score(a) - score(b) ||
        distance(a) - distance(b) ||
        a.name.localeCompare(b.name, "pt-PT") ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
