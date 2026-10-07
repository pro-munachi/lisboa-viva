import { GEOGRAPHIC_HOTSPOTS } from "./geography";
import { JOURNEY_HUBS } from "./journey";
import { VENUES } from "./venues";

export type ChatPlace = { id: string; label: string };

/** Shared ROAM rooms for mapped public places. Private homes and custom pins
 * never create shared chat rooms. Selecting a room does not assert presence.
 */
export const CHAT_PLACES: readonly ChatPlace[] = [
  ...GEOGRAPHIC_HOTSPOTS.map(({ id, name }) => ({ id, label: name })),
  ...VENUES.map(({ id, name }) => ({ id, label: name })),
  ...Object.values(JOURNEY_HUBS).map(({ id, name }) => ({
    id: `transit-${id}`,
    label: name,
  })),
];

const placesById = new Map(CHAT_PLACES.map((place) => [place.id, place]));

export function chatPlaceFor(id?: string | null): ChatPlace | undefined {
  return id ? placesById.get(id) : undefined;
}

export const CHAT_ROOM_IDS = [
  "lisbon:city",
  ...CHAT_PLACES.map(({ id }) => `lisbon:hotspot:${id}`),
];
