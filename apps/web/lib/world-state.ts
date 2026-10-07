import { GEO_BOUNDS, containsGeo, type GeographicHotspot } from "./geography";
import type { PlaceId } from "./content";
import { parseGoogleMapsLink, type GoogleHotspot } from "./google-maps";
import { venueMapsUrl, type MappedVenue, type VenueCategory } from "./venues";
export type WorldHotspot = GoogleHotspot & {
  area?: string;
  sourceUrl?: string;
  custom?: boolean;
  category?: VenueCategory;
  description?: string;
  address?: string;
  mapVenue?: boolean;
  mapLocation?: boolean;
};
export type WorldFocus = {
  lat: number;
  lng: number;
  name: string;
  range?: number;
};
export const areaPlace: Record<string, PlaceId> = {
  Baixa: "cafe",
  "Cais do Sodré": "cais",
  Graça: "viewpoint",
  Alfama: "exchange",
  Belém: "riverside",
  Benfica: "benfica",
  "São Domingos de Benfica": "benfica",
  Sintra: "sintra",
  Santos: "music",
};
export const placeFocus: Record<PlaceId, WorldFocus> = {
  home: { lat: 38.7166, lng: -9.13, name: "Graça", range: 130 },
  exchange: { lat: 38.7111, lng: -9.1301, name: "Alfama", range: 150 },
  cafe: { lat: 38.7119, lng: -9.1374, name: "Baixa", range: 170 },
  viewpoint: {
    lat: 38.7161,
    lng: -9.1312,
    name: "Miradouro da Graça",
    range: 140,
  },
  riverside: {
    lat: 38.6954,
    lng: -9.2073,
    name: "Belém riverfront",
    range: 200,
  },
  music: { lat: 38.7069, lng: -9.1551, name: "Santos", range: 140 },
  cais: { lat: 38.7061, lng: -9.1459, name: "Cais do Sodré", range: 180 },
  benfica: { lat: 38.7496, lng: -9.2026, name: "Benfica", range: 170 },
  sintra: { lat: 38.7968, lng: -9.3906, name: "Sintra", range: 210 },
};
export function focusFor(place: PlaceId, base?: string) {
  if (place === "home" && base === "Baixa")
    return { ...placeFocus.cafe, name: "Your base · Baixa" };
  if (place === "home" && base === "Alfama")
    return { ...placeFocus.exchange, name: "Your base · Alfama" };
  return placeFocus[place];
}
export const PIN_KEY = "roam.lisbon.map-pins.v1";
export function mapLinkPin(url: string, name: string): WorldHotspot | null {
  const h = parseGoogleMapsLink(url);
  if (!h || !containsGeo(GEO_BOUNDS, [h.lng, h.lat])) return null;
  return { ...h, name: name.trim().slice(0, 60) || h.name, custom: true };
}
export function restorePins(raw: string): WorldHotspot[] {
  try {
    if (raw.length > 16000) return [];
    const values = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 16) return [];
    return values.flatMap((h) => {
      if (!h || typeof h.mapsUrl !== "string" || typeof h.name !== "string")
        return [];
      const pin = mapLinkPin(h.mapsUrl, h.name);
      return pin ? [pin] : [];
    });
  } catch {
    return [];
  }
}
export function fromGeographic(h: GeographicHotspot): WorldHotspot {
  return {
    id: h.id,
    name: h.name,
    lat: h.point[1],
    lng: h.point[0],
    area: h.area,
    sourceUrl: h.culturalSource,
    mapsUrl: h.mapsUrl,
  };
}

export function fromVenue(venue: MappedVenue): WorldHotspot {
  return {
    id: venue.id,
    name: venue.name,
    lng: venue.point[0],
    lat: venue.point[1],
    category: venue.category,
    mapVenue: true,
    area: venue.city || "Lisbon region",
    address: venue.street,
    description: `A mapped ${venue.category === "gym" ? "gym or fitness studio" : venue.category} in the Lisbon region. Venue details are from OpenStreetMap; opening status and services have not been verified.`,
    sourceUrl: venue.sourceUrl,
    mapsUrl: venueMapsUrl(venue),
  };
}
