import directory from "../public/data/lisbon-venues.json";
import { projectGeo, type GeoPoint } from "./geography";

export type VenueCategory =
  | "cafe"
  | "gym"
  | "restaurant"
  | "bar"
  | "shop"
  | "culture";

/** An actual named OpenStreetMap feature, not an invented simulated business. */
export interface MappedVenue {
  id: string;
  osmType: "node" | "way";
  osmId: number;
  name: string;
  category: VenueCategory;
  point: GeoPoint;
  /** Way centroids are approximate positions, not surveyed entrances. */
  positionSource: "osm-node" | "way-centroid";
  sourceUrl: string;
  osmCategory: string;
  street?: string;
  city?: string;
  /** HTTPS address tagged in the OSM snapshot; current ownership not verified. */
  website?: string;
}

export type Venue = MappedVenue;

export const VENUES: readonly MappedVenue[] =
  directory.venues as unknown as MappedVenue[];
export const VENUE_SOURCE = directory.source;
export const VENUE_COUNTS = directory.counts;
export const VENUE_LIMITATIONS = directory.limitations;
export const VENUE_CATEGORY_LABELS: Record<VenueCategory, string> = {
  cafe: "Cafés",
  gym: "Gyms & studios",
  restaurant: "Restaurants",
  bar: "Bars & nightlife",
  shop: "Shops",
  culture: "Culture",
};

export function venueMapsUrl(venue: MappedVenue): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.point[1]},${venue.point[0]} (${venue.name})`)}`;
}

/** Metre distance in the same Lisbon projection used by the 3D city. */
export function venueDistanceMetres(
  venue: MappedVenue,
  point: GeoPoint,
): number {
  const a = projectGeo(venue.point);
  const b = projectGeo(point);
  return Math.hypot(a.x - b.x, a.z - b.z);
}

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT");

/** Search actual names/OSM addresses; accents do not prevent a match. */
export function searchVenues(
  query: string,
  category: VenueCategory | "all" = "all",
  limit = 40,
): MappedVenue[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return VENUES.filter((venue) => {
    if (category !== "all" && venue.category !== category) return false;
    const text = normalize(
      [venue.name, venue.street, venue.city].filter(Boolean).join(" "),
    );
    return words.every((word) => text.includes(word));
  }).slice(0, Math.max(0, limit));
}

/** A geographically nearby sample for the active 3D view, sorted by distance. */
export function nearbyVenues(
  point: GeoPoint,
  radiusMetres = 1200,
  limit = 24,
  category: VenueCategory | "all" = "all",
): MappedVenue[] {
  return VENUES.filter(
    (venue) => category === "all" || venue.category === category,
  )
    .map((venue) => ({ venue, distance: venueDistanceMetres(venue, point) }))
    .filter((item) => item.distance <= radiusMetres)
    .sort(
      (a, b) => a.distance - b.distance || a.venue.id.localeCompare(b.venue.id),
    )
    .slice(0, Math.max(0, limit))
    .map((item) => item.venue);
}
