"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowUpRight, MapPin, MessageCircle, X } from "lucide-react";
import type { ChatPeer } from "../lib/direct-client";
import type { MultiplayerPeer } from "../lib/multiplayer";
import styles from "./PlayerMenu.module.css";
import { playerPlace } from "../lib/player-places";

export default function PlayerMenu({
  player,
  presence,
  onMessage,
  onFind,
  onJoin,
  onClose,
}: {
  player: ChatPeer;
  presence?: MultiplayerPeer;
  onMessage: () => void;
  onFind: () => void;
  onJoin?: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const title = useId();
  const description = useId();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.menu}
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
      <div className={styles.content}>
        <header className={styles.header}>
          <span>A FACE IN THE CITY</span>
          <button
            type="button"
            className={styles.close}
            aria-label="Close player menu"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className={styles.profile}>
          <div className={styles.avatar} aria-hidden="true">
            {presence ? (
              <svg viewBox="0 0 64 76" fill="none">
                <path
                  d="M15 76V53c0-10 8-17 17-17s17 7 17 17v23"
                  fill={presence.appearance.topColor}
                />
                <path
                  d="M25 34h14v12c-3 5-11 5-14 0V34Z"
                  fill={presence.appearance.skinTone}
                />
                <ellipse
                  cx="32"
                  cy="26"
                  rx="13"
                  ry="16"
                  fill={presence.appearance.skinTone}
                />
                <path
                  d="M18 25C14 3 47 1 46 24l-8-9-8 4-12 6Z"
                  fill={presence.appearance.hairColor}
                />
                <path
                  d="M15 53l-7 23h10l6-20M49 53l7 23H46l-6-20"
                  fill={presence.appearance.topColor}
                />
              </svg>
            ) : (
              <span>{player.handle.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className={styles.identity}>
            <span className={styles.type}>
              {player.userType === "local"
                ? "Lisbon local"
                : "Fellow traveller"}
            </span>
            <h2 id={title}>@{player.handle}</h2>
            <p className={styles.presence}>
              <i data-visible={Boolean(presence)} />
              {presence
                ? `At ${playerPlace(presence.placeId)?.name || presence.area}`
                : "Not currently visible on the map"}
            </p>
          </div>
        </div>
        <p className={styles.intro} id={description}>
          A city feels smaller when you say hello.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.message} onClick={onMessage}>
            <span className={styles.actionIcon}>
              <MessageCircle size={20} />
            </span>
            <span>
              <strong>Message</strong>
              <small>Start a private conversation</small>
            </span>
            <ArrowUpRight size={19} />
          </button>
          <button
            type="button"
            className={styles.find}
            onClick={onFind}
            disabled={!presence}
          >
            <span className={styles.actionIcon}>
              <MapPin size={20} />
            </span>
            <span>
              <strong>Find on map</strong>
              <small>
                {presence
                  ? "See where they are exploring"
                  : "Available when they join the map"}
              </small>
            </span>
            <ArrowUpRight size={19} />
          </button>
          {onJoin && (
            <button type="button" className={styles.find} onClick={onJoin}>
              <span className={styles.actionIcon}>
                <MapPin size={20} />
              </span>
              <span>
                <strong>Join them</strong>
                <small>Enter {playerPlace(presence?.placeId)?.name}</small>
              </span>
              <ArrowUpRight size={19} />
            </button>
          )}
        </div>
        <p className={styles.note}>Locations show their current ROAM visit.</p>
      </div>
    </dialog>
  );
}
