import type { Command, Trip } from "./engine";
import type { CharacterAppearance } from "./appearance";
import { JOURNEY_HUBS, JOURNEY_ROUTES } from "./journey";
import { focusFor, type WorldFocus } from "./world-state";

export type TravelMode =
  | "flight"
  | "metro"
  | "train"
  | "bus"
  | "tram"
  | "taxi"
  | "walk"
  | "cycle";
export type TravelSequence = {
  id: string;
  mode: TravelMode;
  from: WorldFocus;
  to: WorldFocus;
  shirt?: string;
  appearance?: CharacterAppearance;
  arrival?: boolean;
  departure?: boolean;
};
export type TravelPhase = {
  id: string;
  phase: "boarding" | "travelling" | "arriving";
  label: string;
};
export type TravelCompletion = {
  sequence: TravelSequence;
  tripId: string;
  revision: number;
  panel: "journey" | "recap" | null;
  outcome: string;
};

export function tripFocus(trip: Trip): WorldFocus {
  const hub =
    trip.journey.phase === "departed"
      ? JOURNEY_HUBS.airport
      : trip.journey.hub && JOURNEY_HUBS[trip.journey.hub];
  return hub
    ? { lat: hub.lat, lng: hub.lng, name: hub.name, range: 140 }
    : { ...focusFor(trip.place, trip.setup.base) };
}

/** Created only by the new-trip action; restoring a trip never calls this. */
export function arrivalTravel(trip: Trip): TravelSequence | null {
  if (trip.journey.phase !== "arriving" || !trip.journey.hub) return null;
  const hub = JOURNEY_HUBS[trip.journey.hub];
  const mode: TravelMode =
    hub.kind === "airport"
      ? "flight"
      : hub.kind === "station"
        ? "train"
        : "bus";
  const focus = tripFocus(trip);
  return {
    id: `arrival:${trip.id}`,
    mode,
    from: { ...focus },
    to: { ...focus },
    shirt: trip.setup.shirt,
    arrival: true,
  };
}

/** Accepts an already-applied command; it never changes the trip ledger. */
export function commandTravel(
  before: Trip,
  after: Trip,
  command: Command,
): TravelSequence | null {
  const applied = after.history.at(-1)?.command;
  if (
    before.id !== after.id ||
    after.revision !== before.revision + 1 ||
    applied?.key !== command.key ||
    applied.revision !== before.revision
  )
    return null;
  if (command.kind === "travel") {
    return {
      id: command.key,
      mode: command.mode,
      from: tripFocus(before),
      to: tripFocus(after),
      shirt: after.setup.shirt,
    };
  }
  if (command.kind !== "journey" || command.action !== "board") return null;
  const route = JOURNEY_ROUTES.find(
    (candidate) => candidate.id === before.journey.ticket?.routeId,
  );
  if (!route) return null;
  const from = tripFocus(before);
  return {
    id: command.key,
    mode: route.mode,
    from,
    // A departure has no authored outside destination. Keep the mapped airport
    // anchor rather than rendering the ledger's home placeholder as a landing.
    to: route.departure ? { ...from } : tripFocus(after),
    shirt: after.setup.shirt,
    departure: Boolean(route.departure),
  };
}

/** Prevents old, replaced, cancelled or duplicate camera completions from acting. */
export class TravelCompletionGate {
  pending: TravelCompletion | null = null;

  start(completion: TravelCompletion) {
    this.pending = completion;
  }
  matches(trip: Trip | null) {
    return Boolean(
      this.pending &&
        trip &&
        this.pending.tripId === trip.id &&
        this.pending.revision === trip.revision,
    );
  }
  take(id: string, trip: Trip | null): TravelCompletion | null {
    if (this.pending?.sequence.id !== id || !this.matches(trip)) return null;
    const result = this.pending;
    this.pending = null;
    return result;
  }
  cancel() {
    this.pending = null;
  }
}
