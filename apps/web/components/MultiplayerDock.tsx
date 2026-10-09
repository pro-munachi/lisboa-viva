"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, MapPin, Users, X } from "lucide-react";
import { useMultiplayer, type MultiplayerPeer } from "../lib/multiplayer";
import { NearbyArrivalTracker, nearbyPlayers } from "../lib/nearby-players";
import { playerPlace } from "../lib/player-places";
import styles from "./NearbyPlayers.module.css";

export default function MultiplayerDock({
  onFind,
  onSelect,
  currentPlaceId,
  inside = false,
}: {
  onFind: () => void;
  onSelect?: (player: MultiplayerPeer) => void;
  currentPlaceId?: string | null;
  inside?: boolean;
}) {
  const { peers, status, enabled, setEnabled } = useMultiplayer();
  const nearby = useMemo(
    () => nearbyPlayers(peers, currentPlaceId),
    [peers, currentPlaceId],
  );
  const tracker = useRef(new NearbyArrivalTracker());
  const [noticeId, setNoticeId] = useState<string | null>(null);
  const noticeElement = useRef<HTMLDivElement>(null);
  const notice = nearby.find((peer) => peer.id === noticeId);

  useEffect(() => {
    const next = tracker.current.update(
      nearby,
      enabled && status === "online",
      Date.now(),
    );
    if (!enabled || status !== "online") setNoticeId(null);
    else if (next && !document.hidden) setNoticeId(next.id);
  }, [nearby, enabled, status]);

  useEffect(() => {
    if (!noticeId) return;
    let timeout: ReturnType<typeof setTimeout>;
    function expire() {
      // An actionable notice must not disappear beneath a keyboard reader.
      if (noticeElement.current?.contains(document.activeElement))
        timeout = setTimeout(expire, 3000);
      else setNoticeId(null);
    }
    timeout = setTimeout(expire, 12_000);
    return () => clearTimeout(timeout);
  }, [noticeId]);

  const state = enabled
    ? status === "online"
      ? "City presence on"
      : status === "reconnecting"
        ? "Reconnecting…"
        : "Connecting…"
    : status === "hidden"
      ? "Hidden from the map"
      : status === "reconnecting"
        ? "Leaving · retrying…"
        : "Leaving the map…";
  const place = notice?.placeId ? playerPlace(notice.placeId) : null;

  return (
    <aside
      className={styles.dock}
      aria-label="Nearby players"
      data-inside={inside}
    >
      {notice && (
        <div
          ref={noticeElement}
          className={styles.arrival}
          role="status"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setNoticeId(null);
            }
          }}
        >
          <button
            type="button"
            className={styles.arrivalPlayer}
            aria-haspopup="dialog"
            onClick={() => {
              setNoticeId(null);
              if (onSelect) onSelect(notice);
              else onFind();
            }}
          >
            <span className={styles.arrivalIcon}>
              <Users size={19} />
            </span>
            <span>
              <strong>@{notice.handle} is nearby</strong>
              <small>
                <MapPin size={12} /> {place?.name ?? notice.area}
              </small>
            </span>
          </button>
          <button
            type="button"
            className={styles.dismiss}
            aria-label="Dismiss nearby player notification"
            onClick={() => setNoticeId(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className={styles.dockBar}>
        <button
          type="button"
          className={styles.findButton}
          aria-label="Find nearby players"
          title="Find nearby players"
          onClick={() => {
            setNoticeId(null);
            onFind();
          }}
          aria-haspopup="dialog"
        >
          <span className="app-emoji action-emoji" aria-hidden="true">
            🧑‍🤝‍🧑
          </span>
          <span>
            <strong>Find nearby players</strong>
            <small data-status={status}>{state}</small>
          </span>
        </button>
        <button
          type="button"
          className={styles.visibility}
          aria-label={enabled ? "Hide me from multiplayer" : "Join multiplayer"}
          title={enabled ? "Hide me from multiplayer" : "Join multiplayer"}
          aria-pressed={enabled}
          onClick={() => setEnabled(!enabled)}
        >
          {enabled ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
      </div>
    </aside>
  );
}
