"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Coffee,
  Dumbbell,
  MapPin,
  MessageCircle,
  Radio,
  Users,
  X,
} from "lucide-react";
import type { AuthUser } from "../lib/auth";
import type { MultiplayerPeer } from "../lib/multiplayer";
import type { PresenceStatus } from "../lib/presence-client";
import { venuePresencePage } from "../lib/presence-client";
import { nearbyDistance, nearbyPlayers } from "../lib/nearby-players";
import { playerPlace } from "../lib/player-places";
import styles from "./NearbyPlayers.module.css";

export default function NearbyPlayers({
  peers,
  user,
  currentPlaceId,
  enabled = true,
  status,
  onSelect,
  onMessage,
  onJoin,
  onClose,
}: {
  peers: MultiplayerPeer[];
  user?: Pick<AuthUser, "id">;
  currentPlaceId?: string | null;
  enabled?: boolean;
  status?: PresenceStatus;
  onSelect: (peer: MultiplayerPeer) => void;
  onMessage?: (peer: MultiplayerPeer) => void;
  onJoin: (peer: MultiplayerPeer) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  const close = useRef(onClose);
  const [venue, setVenue] = useState<{
    players: MultiplayerPeer[];
    total: number;
    nextCursor: string | null;
  } | null>(null);
  const [venueBusy, setVenueBusy] = useState(false);
  const [venueError, setVenueError] = useState(false);
  const [venueRetry, setVenueRetry] = useState(0);
  const venueController = useRef<AbortController | null>(null);
  const connection = status ?? (enabled ? "online" : "hidden");
  close.current = onClose;
  const nearby = useMemo(
    () =>
      nearbyPlayers(
        peers.filter((peer) => peer.id !== user?.id),
        currentPlaceId,
      ),
    [peers, user?.id, currentPlaceId],
  );
  const displayed = useMemo(() => {
    if (!venue || !currentPlaceId) return nearby;
    const ids = new Set(venue.players.map((peer) => peer.id));
    return [
      ...venue.players,
      ...nearby.filter(
        (peer) => peer.placeId !== currentPlaceId && !ids.has(peer.id),
      ),
    ];
  }, [venue, nearby, currentPlaceId]);

  useEffect(() => {
    setVenue(null);
    setVenueError(false);
    setVenueBusy(false);
    if (!enabled || !currentPlaceId) return;
    const controller = new AbortController();
    venueController.current = controller;
    setVenueBusy(true);
    const query = new URLSearchParams({ placeId: currentPlaceId });
    void fetch(`/api/multiplayer/venue?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("venue_roster");
        const page = venuePresencePage(await response.json(), currentPlaceId);
        if (!page || page.total === null) throw new Error("venue_payload");
        if (!controller.signal.aborted)
          setVenue({ ...page, total: page.total });
      })
      .catch(() => {
        if (!controller.signal.aborted) setVenueError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setVenueBusy(false);
      });
    return () => {
      venueController.current?.abort();
      venueController.current = null;
    };
  }, [currentPlaceId, enabled, venueRetry]);

  async function loadMore() {
    if (!venue?.nextCursor || !currentPlaceId || venueBusy) return;
    const controller = new AbortController();
    venueController.current = controller;
    setVenueBusy(true);
    setVenueError(false);
    const query = new URLSearchParams({
      placeId: currentPlaceId,
      cursor: venue.nextCursor,
    });
    try {
      const response = await fetch(`/api/multiplayer/venue?${query}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("venue_roster");
      const page = venuePresencePage(await response.json(), currentPlaceId);
      if (!page) throw new Error("venue_payload");
      if (!controller.signal.aborted)
        setVenue(
          (current) =>
            current && {
              players: [
                ...current.players,
                ...page.players.filter(
                  (peer) =>
                    !current.players.some(
                      (existing) => existing.id === peer.id,
                    ),
                ),
              ],
              total: page.total ?? current.total,
              nextCursor: page.nextCursor,
            },
        );
    } catch {
      if (!controller.signal.aborted) setVenueError(true);
    } finally {
      if (!controller.signal.aborted) setVenueBusy(false);
    }
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.directory}
      aria-labelledby={title}
      aria-describedby={description}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) close.current();
      }}
    >
      <div className={styles.directoryContent}>
        <header className={styles.header}>
          <div className={styles.headerSymbol}>
            <Users size={25} />
          </div>
          <div>
            <span>A CITY FULL OF PEOPLE</span>
            <h2 id={title}>Around you</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Close nearby players"
            autoFocus
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className={styles.directoryIntro}>
          <strong>
            {enabled && connection !== "online" && !displayed.length ? (
              "Finding nearby players…"
            ) : (
              <>
                {enabled ? (venue ? venue.total : displayed.length) : 0}{" "}
                {enabled && (venue ? venue.total : displayed.length) === 1
                  ? "player"
                  : "players"}{" "}
                {venue ? "in this venue" : "nearby"}
              </>
            )}
          </strong>
          <p id={description}>
            Within 2 km of your current ROAM location, plus people in the same
            public place. See where they are, say hello or join their venue.
          </p>
        </div>
        {enabled && connection !== "online" && nearby.length > 0 && (
          <p className={styles.connectionNotice} role="status">
            <Radio size={14} /> Reconnecting to the city. Showing recently seen
            players.
          </p>
        )}
        <div className={styles.playerList}>
          {displayed.length && enabled ? (
            displayed.map((peer) => {
              const place = peer.placeId ? playerPlace(peer.placeId) : null;
              const samePlace = Boolean(
                currentPlaceId && peer.placeId === currentPlaceId,
              );
              const PlaceIcon =
                place?.kind === "gym"
                  ? Dumbbell
                  : place?.kind === "cafe"
                    ? Coffee
                    : MapPin;
              return (
                <article className={styles.playerCard} key={peer.id}>
                  <div className={styles.playerIdentity}>
                    <button
                      type="button"
                      className={styles.playerAvatar}
                      style={{ background: peer.appearance.topColor }}
                      aria-label={`Player options for @${peer.handle}`}
                      aria-haspopup="dialog"
                      onClick={() => onSelect(peer)}
                    >
                      <span>{peer.handle.slice(0, 1).toUpperCase()}</span>
                    </button>
                    <div>
                      <button
                        type="button"
                        className={styles.playerName}
                        aria-haspopup="dialog"
                        onClick={() => onSelect(peer)}
                      >
                        @{peer.handle}
                      </button>
                      <span>
                        {peer.userType === "local" ? "Local" : "Traveller"} ·{" "}
                        {samePlace
                          ? "Same place as you"
                          : `${nearbyDistance(peer.distanceMetres)} from your ROAM location`}
                      </span>
                    </div>
                  </div>
                  <div className={styles.placeLine}>
                    <PlaceIcon size={16} />
                    <div>
                      <strong>{place?.name ?? peer.area}</strong>
                      <span>
                        {place
                          ? `${place.kind ? "At a public venue" : "Exploring a mapped place"} · ${place.area}`
                          : "Exploring the city"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.playerActions}>
                    <button
                      type="button"
                      className={styles.messageButton}
                      onClick={() => (onMessage ?? onSelect)(peer)}
                    >
                      <MessageCircle size={16} /> Message
                    </button>
                    {place?.kind && (
                      <button
                        type="button"
                        className={styles.joinButton}
                        onClick={() => onJoin(peer)}
                      >
                        <ArrowUpRight size={16} />{" "}
                        {samePlace ? "Enter this venue" : "Join them"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className={styles.empty}>
              <span>
                <Users size={31} />
              </span>
              <strong>
                {enabled
                  ? connection === "connecting"
                    ? "Connecting to the city…"
                    : connection === "reconnecting"
                      ? "Reconnecting to the city…"
                      : "A little quiet around here."
                  : connection === "hidden"
                    ? "You’re hidden from the city."
                    : "Leaving the map…"}
              </strong>
              <p>
                {enabled
                  ? connection === "connecting"
                    ? "We’re checking nearby players. People will appear when the city connection is ready."
                    : connection === "reconnecting"
                      ? "Nearby players could not be refreshed. Keep this panel open while we try again."
                      : "Other signed-in players appear here when their ROAM location is nearby. Explore another neighbourhood or check back later."
                  : connection === "hidden"
                    ? "Close this panel and choose Join multiplayer to share your ROAM location and discover nearby players."
                    : "Your request to hide from the map has not yet been confirmed. We’re retrying the connection."}
              </p>
            </div>
          )}
          {enabled && currentPlaceId && venue?.nextCursor && (
            <button
              type="button"
              className={styles.loadMore}
              disabled={venueBusy}
              onClick={() => void loadMore()}
            >
              {venueBusy
                ? "Loading…"
                : `Show more people (${venue.players.length} of ${venue.total})`}
            </button>
          )}
          {venueBusy && !venue && (
            <p role="status">Loading everyone in this venue…</p>
          )}
          {venueError && (
            <p role="status">
              The full venue list is temporarily unavailable.{" "}
              <button
                type="button"
                onClick={() => setVenueRetry((value) => value + 1)}
              >
                Retry
              </button>
            </p>
          )}
        </div>
        <p className={styles.directoryNote}>
          <MapPin size={13} /> Places show shared in-app visits, not someone’s
          physical GPS location.
        </p>
      </div>
    </dialog>
  );
}
