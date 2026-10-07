"use client";

import { Eye, EyeOff, Radio, Users } from "lucide-react";
import { useMultiplayer, type MultiplayerPeer } from "../lib/multiplayer";

export default function MultiplayerDock({
  onSelect,
}: {
  onSelect: (player: MultiplayerPeer) => void;
}) {
  const { peers, status, enabled, setEnabled } = useMultiplayer();
  return (
    <aside className="multiplayer-dock" aria-label="Nearby players">
      <div className="multiplayer-heading">
        <span className={`multiplayer-signal ${status}`}>
          <Radio size={13} />{" "}
          {status === "online" ? "LIVE" : status.toUpperCase()}
        </span>
        <button
          onClick={() => setEnabled(!enabled)}
          aria-label={enabled ? "Hide me from multiplayer" : "Join multiplayer"}
          title={enabled ? "Hide me from multiplayer" : "Join multiplayer"}
        >
          {enabled ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>
      {enabled ? (
        <>
          <strong>
            <Users size={15} /> {peers.length} nearby
          </strong>
          {peers.length ? (
            <div className="multiplayer-list">
              {peers.slice(0, 5).map((peer) => (
                <button key={peer.id} onClick={() => onSelect(peer)}>
                  <span className="online-dot" />
                  <span>
                    <b>@{peer.handle}</b>
                    <small>{peer.area}</small>
                  </span>
                  <em>
                    {peer.distanceMetres < 1000
                      ? `${peer.distanceMetres} m`
                      : `${(peer.distanceMetres / 1000).toFixed(1)} km`}
                  </em>
                </button>
              ))}
            </div>
          ) : (
            <p>
              {status === "online"
                ? "You’re online. Other players will appear here."
                : "Connecting to the city…"}
            </p>
          )}
        </>
      ) : (
        <p>
          {status === "hidden"
            ? "You are hidden. Join again whenever you want."
            : status === "reconnecting"
              ? "Could not confirm you are hidden. Retrying…"
              : "Leaving multiplayer…"}
        </p>
      )}
    </aside>
  );
}
