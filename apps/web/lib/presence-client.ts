import {
  normalizeCharacterAppearance,
  type CharacterAppearance,
} from "./appearance";
import { GEO_BOUNDS } from "./geography";
import { playerPlace } from "./player-places";
import { validHandle } from "./handle";

export const PRESENCE_TTL_MS = 45_000;
export type PresenceLocation = {
  latitude: number;
  longitude: number;
  area: string;
  placeId?: string;
};
export type MultiplayerPeer = PresenceLocation & {
  id: string;
  handle: string;
  userType: "tourist" | "local";
  distanceMetres: number;
  lastSeenAt: string;
  appearance: CharacterAppearance;
};
export type PresenceStatus =
  | "connecting"
  | "online"
  | "reconnecting"
  | "hidden";
type Snapshot = { peers: MultiplayerPeer[]; status: PresenceStatus };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function validPresenceLocation(
  value: unknown,
): value is PresenceLocation {
  if (!value || typeof value !== "object") return false;
  const point = value as PresenceLocation;
  return (
    Number.isFinite(point.latitude) &&
    point.latitude >= GEO_BOUNDS[1] &&
    point.latitude <= GEO_BOUNDS[3] &&
    Number.isFinite(point.longitude) &&
    point.longitude >= GEO_BOUNDS[0] &&
    point.longitude <= GEO_BOUNDS[2] &&
    typeof point.area === "string" &&
    point.area.trim().length > 0 &&
    new TextEncoder().encode(point.area).length <= 80 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(point.area) &&
    (point.placeId === undefined ||
      point.placeId === "" ||
      (typeof point.placeId === "string" &&
        Boolean(playerPlace(point.placeId))))
  );
}

export function livePresencePeers(
  peers: MultiplayerPeer[],
  now: number,
): MultiplayerPeer[] {
  return peers.filter(
    (peer) => Date.parse(peer.lastSeenAt) > now - PRESENCE_TTL_MS,
  );
}

/** Validate and copy only the documented public fields; never expose extra data. */
export function nearbyPresencePeers(
  value: unknown,
  now = Date.now(),
): MultiplayerPeer[] | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as { players?: unknown; expiresInSeconds?: unknown };
  if (
    !Array.isArray(payload.players) ||
    payload.players.length > 40 ||
    payload.expiresInSeconds !== 45
  )
    return null;
  const seen = new Set<string>();
  return payload.players.flatMap((item) => {
    if (!item || typeof item !== "object" || !validPresenceLocation(item))
      return [];
    const peer = item as MultiplayerPeer;
    const appearance = normalizeCharacterAppearance(peer.appearance);
    if (
      typeof peer.id !== "string" ||
      !uuid.test(peer.id) ||
      peer.id === "00000000-0000-0000-0000-000000000000" ||
      typeof peer.handle !== "string" ||
      !validHandle(peer.handle) ||
      !["tourist", "local"].includes(peer.userType) ||
      !Number.isInteger(peer.distanceMetres) ||
      peer.distanceMetres < 0 ||
      peer.distanceMetres > 25_000 ||
      typeof peer.lastSeenAt !== "string" ||
      !timestamp.test(peer.lastSeenAt) ||
      !Number.isFinite(Date.parse(peer.lastSeenAt)) ||
      Date.parse(peer.lastSeenAt) > now + 5000 ||
      !appearance
    )
      return [];
    const id = peer.id.toLowerCase();
    if (seen.has(id) || Date.parse(peer.lastSeenAt) <= now - PRESENCE_TTL_MS)
      return [];
    seen.add(id);
    return [
      {
        id,
        handle: peer.handle,
        userType: peer.userType,
        latitude: peer.latitude,
        longitude: peer.longitude,
        area: peer.area,
        ...(peer.placeId ? { placeId: peer.placeId } : {}),
        distanceMetres: peer.distanceMetres,
        lastSeenAt: peer.lastSeenAt,
        appearance,
      },
    ];
  });
}

export function venuePresencePage(
  value: unknown,
  placeId: string,
  now = Date.now(),
) {
  if (!value || typeof value !== "object") return null;
  const payload = value as {
    players?: unknown;
    total?: unknown;
    nextCursor?: unknown;
    expiresInSeconds?: unknown;
  };
  if (
    (payload.total !== null &&
      (!Number.isSafeInteger(payload.total) ||
        (payload.total as number) < 0)) ||
    !Array.isArray(payload.players) ||
    payload.players.length > 25 ||
    (payload.nextCursor !== null &&
      (typeof payload.nextCursor !== "string" ||
        !uuid.test(payload.nextCursor)))
  )
    return null;
  const players = nearbyPresencePeers(payload, now);
  if (
    !players ||
    players.length !== payload.players.length ||
    players.some((peer) => peer.placeId !== placeId)
  )
    return null;
  return {
    players,
    total: payload.total as number | null,
    nextCursor: payload.nextCursor as string | null,
  };
}

/** One request chain per account. Explicit hide waits for its outstanding PUT. */
export function createPresenceClient({
  location,
  enabled = true,
  onUpdate,
  fetcher = fetch,
  now = Date.now,
  timeoutMs = 8000,
}: {
  location: PresenceLocation;
  enabled?: boolean;
  onUpdate: (snapshot: Snapshot) => void;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}) {
  let current = { ...location },
    joined = enabled,
    revision = 0,
    disposed = false,
    pending = false;
  let running: Promise<void> | null = null;
  let requestController: AbortController | null = null,
    requestMethod = "";
  let peers: MultiplayerPeer[] = [],
    status: PresenceStatus = enabled ? "connecting" : "hidden";
  const publish = (next: PresenceStatus) => {
    if (disposed) return;
    status = next;
    onUpdate({ peers, status });
  };
  const relevant = (version: number) => !disposed && revision === version;
  async function request(method: string, url: string, body?: PresenceLocation) {
    const controller = new AbortController();
    requestController = controller;
    requestMethod = method;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          controller.abort();
          reject(new Error("presence_timeout"));
        },
        Math.max(1, timeoutMs),
      );
    });
    try {
      const operation = fetcher(url, {
        method,
        signal: controller.signal,
        cache: "no-store",
        ...(body
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      }).then(async (response) => {
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: false, payload: null };
        }
        const payload =
          method === "GET"
            ? await response.json()
            : (await response.arrayBuffer(), null);
        return { ok: true, payload };
      });
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
      if (requestController === controller) {
        requestController = null;
        requestMethod = "";
      }
    }
  }
  async function poll() {
    const version = revision,
      point = { ...current },
      shouldJoin = joined;
    try {
      if (!shouldJoin) {
        const response = await request("DELETE", "/api/multiplayer/presence");
        if (!response.ok) throw new Error("presence_hide");
        if (relevant(version)) publish("hidden");
        return;
      }
      const presence = await request("PUT", "/api/multiplayer/presence", point);
      if (!presence.ok) throw new Error("presence_heartbeat");
      if (!relevant(version)) return;
      const query = new URLSearchParams({
        latitude: String(point.latitude),
        longitude: String(point.longitude),
        radius: "25000",
      });
      const response = await request("GET", `/api/multiplayer/nearby?${query}`);
      if (!response.ok) throw new Error("presence_nearby");
      const result = nearbyPresencePeers(response.payload, now());
      if (!result) throw new Error("presence_payload");
      if (relevant(version)) {
        peers = result;
        publish("online");
      }
    } catch {
      if (relevant(version)) {
        peers = livePresencePeers(peers, now());
        publish("reconnecting");
      }
    }
  }
  function begin() {
    if (disposed) return Promise.resolve();
    if (running) return running;
    const work = (async () => {
      while (pending && !disposed) {
        pending = false;
        await poll();
      }
    })();
    running = work;
    void work.finally(() => {
      if (running === work) {
        running = null;
        if (pending && !disposed) void begin();
      }
    });
    return work;
  }
  function changed() {
    revision++;
    pending = true;
    if (requestMethod === "GET") requestController?.abort();
    return begin();
  }
  return {
    sync() {
      if (!disposed && !running) pending = true;
      return begin();
    },
    setLocation(next: PresenceLocation) {
      if (
        disposed ||
        !validPresenceLocation(next) ||
        (current.latitude === next.latitude &&
          current.longitude === next.longitude &&
          current.area === next.area &&
          current.placeId === next.placeId)
      )
        return;
      current = { ...next };
      if (joined) publish("connecting");
      void changed();
    },
    setEnabled(next: boolean) {
      if (disposed || joined === next) return;
      joined = next;
      peers = [];
      publish("connecting");
      void changed();
    },
    expire() {
      if (disposed) return;
      const live = livePresencePeers(peers, now());
      if (live.length !== peers.length) {
        peers = live;
        publish(status);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      pending = false;
      requestController?.abort();
      peers = [];
    },
  };
}
