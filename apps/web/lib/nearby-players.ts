export const NEARBY_DISTANCE_METRES = 2000;
export const NEARBY_NOTICE_COOLDOWN_MS = 30_000;

type NearbyIdentity = {
  id: string;
  distanceMetres: number;
  placeId?: string | null;
};

/** Distance is relative to the player's shared ROAM visit, never the map camera or device GPS. */
export function nearbyPlayers<T extends NearbyIdentity>(
  peers: T[],
  currentPlaceId?: string | null,
): T[] {
  const seen = new Set<string>();
  return peers
    .filter((peer) => {
      const samePlace = Boolean(
        currentPlaceId && peer.placeId === currentPlaceId,
      );
      if (
        !peer.id ||
        seen.has(peer.id) ||
        !Number.isFinite(peer.distanceMetres) ||
        peer.distanceMetres < 0 ||
        (!samePlace && peer.distanceMetres > NEARBY_DISTANCE_METRES)
      )
        return false;
      seen.add(peer.id);
      return true;
    })
    .sort((a, b) => {
      const sameA = Boolean(currentPlaceId && a.placeId === currentPlaceId);
      const sameB = Boolean(currentPlaceId && b.placeId === currentPlaceId);
      return (
        Number(sameB) - Number(sameA) ||
        a.distanceMetres - b.distanceMetres ||
        a.id.localeCompare(b.id)
      );
    });
}

/** Silence the initial roster, deduplicate refreshes and suppress notice bursts. */
export class NearbyArrivalTracker {
  private seeded = false;
  private seen = new Map<string, number>();
  private lastNotice = -Infinity;

  update<T extends NearbyIdentity>(
    peers: T[],
    active: boolean,
    now: number,
  ): T | null {
    if (!active) {
      this.seeded = false;
      return null;
    }
    for (const [id, visited] of this.seen) {
      if (visited < now - 60 * 60_000) this.seen.delete(id);
    }
    const fresh = peers.filter((peer) => !this.seen.has(peer.id));
    for (const peer of peers) {
      this.seen.delete(peer.id);
      this.seen.set(peer.id, now);
    }
    while (this.seen.size > 512) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    if (!this.seeded) {
      this.seeded = true;
      return null;
    }
    if (!fresh.length || now - this.lastNotice < NEARBY_NOTICE_COOLDOWN_MS)
      return null;
    this.lastNotice = now;
    return fresh[0];
  }
}

export function nearbyDistance(metres: number) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
