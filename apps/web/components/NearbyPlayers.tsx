"use client";

import { useEffect, useId, useMemo, useRef } from "react";
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
            {enabled && connection !== "online" && !nearby.length ? (
              "Finding nearby players…"
            ) : (
              <>
                {enabled ? nearby.length : 0}{" "}
                {enabled && nearby.length === 1 ? "player" : "players"} nearby
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
          {nearby.length && enabled ? (
            nearby.map((peer) => {
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
        </div>
        <p className={styles.directoryNote}>
          <MapPin size={13} /> Places show shared in-app visits, not someone’s
          physical GPS location.
        </p>
      </div>
    </dialog>
  );
}
