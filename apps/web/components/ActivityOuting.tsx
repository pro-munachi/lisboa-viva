"use client";

import { MapPin, MessageCircle, Users, LogOut } from "lucide-react";
import type { ActivityRoom } from "../lib/activities";
import styles from "./ActivityOuting.module.css";

export default function ActivityOuting({
  activity,
  venueName,
  presentCount,
  atVenue,
  onOpen,
  onVisit,
  onExit,
}: {
  activity: ActivityRoom;
  venueName: string;
  presentCount: number;
  atVenue: boolean;
  onOpen: () => void;
  onVisit: () => void;
  onExit: () => void;
}) {
  const latest = activity.events.at(-1);
  return (
    <aside className={styles.panel} aria-label="Your shared activity">
      <div className={styles.topline}>
        <span>
          <Users size={14} /> SHARED OUTING
        </span>
        <span>
          {activity.memberCount}/{activity.capacity} joined
        </span>
      </div>
      <h2>{activity.title}</h2>
      <p className={styles.venue}>
        <MapPin size={14} /> {venueName}
      </p>
      <p className={styles.presence}>
        {atVenue
          ? `${presentCount} ${presentCount === 1 ? "player" : "players"} here with you`
          : "Your group is meeting here. Join when you’re ready."}
      </p>
      {latest && (
        <p className={styles.event} aria-live="polite">
          {latest.label}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onOpen}>
          <MessageCircle size={16} />{" "}
          {atVenue ? "Chat & activities" : "Open room"}
        </button>
        <button type="button" onClick={atVenue ? onExit : onVisit}>
          {atVenue ? <LogOut size={16} /> : <MapPin size={16} />}
          {atVenue ? "Exit venue" : "Go together"}
        </button>
      </div>
    </aside>
  );
}
