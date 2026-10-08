import { GEOGRAPHIC_HOTSPOTS } from "./geography";
import { JOURNEY_HUBS } from "./journey";
import { VENUES } from "./venues";
import { interiorForHotspot, type InteriorKind } from "./interiors";
import { fromGeographic, fromVenue, type WorldHotspot } from "./world-state";

export type PlayerPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  area: string;
  kind?: Exclude<InteriorKind, "home">;
  category?: WorldHotspot["category"];
  hotspot: WorldHotspot;
};
const places = new Map<string, PlayerPlace>();
for (const hotspot of [
  ...GEOGRAPHIC_HOTSPOTS.map(fromGeographic),
  ...VENUES.map(fromVenue),
  ...Object.values(JOURNEY_HUBS).map((hub) => ({
    ...hub,
    id: `transit-${hub.id}`,
    area: "Lisbon transport",
  })),
]) {
  const hub = Object.values(JOURNEY_HUBS).find(
    (h) => hotspot.id === `transit-${h.id}`,
  );
  const kind = hub?.kind || interiorForHotspot(hotspot);
  places.set(hotspot.id, {
    id: hotspot.id,
    name: hotspot.name,
    lat: hotspot.lat,
    lng: hotspot.lng,
    area: hotspot.area || "Lisbon region",
    category: hotspot.category,
    ...(kind && kind !== "home" ? { kind } : {}),
    hotspot,
  });
}

/** Only public bundled venues can identify a shared room. Homes and user pins stay private. */
export function playerPlace(id?: string | null): PlayerPlace | undefined {
  return id ? places.get(id) : undefined;
}
