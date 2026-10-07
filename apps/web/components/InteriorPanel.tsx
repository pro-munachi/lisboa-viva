"use client";

import { useId } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bus,
  Check,
  Coffee,
  DoorOpen,
  Dumbbell,
  Footprints,
  Home,
  Landmark,
  Pause,
  Play,
  PlaneTakeoff,
  ShoppingBag,
  TrainFront,
  Wine,
} from "lucide-react";
import {
  INTERIOR_ACTIVITIES,
  INTERIOR_LABELS,
  type InteriorVisit,
} from "../lib/interiors";
import styles from "./InteriorPanel.module.css";

export type InteriorPanelProps = {
  visit: InteriorVisit;
  selectedZone: string | null;
  onSelectZone: (id: string) => void;
  onPerform: (id: string) => void;
  onExit: () => void;
  activityState: "idle" | "walking" | "active";
  completed: string[];
  motion?: boolean;
};

const roomIcons = {
  home: Home,
  cafe: Coffee,
  gym: Dumbbell,
  shop: ShoppingBag,
  museum: Landmark,
  bar: Wine,
  airport: PlaneTakeoff,
  station: TrainFront,
  "bus-stop": Bus,
};

export default function InteriorPanel({
  visit,
  selectedZone,
  onSelectZone,
  onPerform,
  onExit,
  activityState,
  completed,
  motion = true,
}: InteriorPanelProps) {
  const titleId = useId();
  const activities = INTERIOR_ACTIVITIES[visit.kind];
  const selected =
    activities.find((activity) => activity.id === selectedZone) ||
    activities[0];
  const explored = activities.filter((activity) =>
    completed.includes(activity.id),
  ).length;
  const busy = activityState !== "idle";
  const transit = ["airport", "station", "bus-stop"].includes(visit.kind);
  const done = !busy && completed.includes(selected.id);
  const RoomIcon = roomIcons[visit.kind];
  const status =
    !motion && busy
      ? "Movement is paused. Use the play control to continue exploring."
      : activityState === "walking"
        ? `Your character is walking to ${selected.label.toLowerCase()}.`
        : activityState === "active"
          ? `${selected.actionLabel}…`
          : done
            ? selected.result
            : selected.description;
  const actionLabel = !motion
    ? "Movement paused"
    : activityState === "walking"
      ? "Walking to the corner…"
      : activityState === "active"
        ? `${selected.actionLabel}…`
        : selected.actionLabel;
  let sourceUrl: string | null = null;
  try {
    const source = visit.sourceUrl ? new URL(visit.sourceUrl) : null;
    if (source?.protocol === "https:" && !source.username && !source.password)
      sourceUrl = source.href;
  } catch {}

  return (
    <section
      className={styles.panel}
      aria-labelledby={titleId}
      data-interior-kind={visit.kind}
    >
      <div className={styles.topline}>
        <span className={styles.badge}>
          <DoorOpen size={13} aria-hidden="true" />
          {transit ? "Original ROAM transit scene" : "Original ROAM interior"}
        </span>
        <button
          type="button"
          className={styles.exit}
          onClick={onExit}
          aria-label="Exit to street"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Exit to street
        </button>
      </div>
      <header className={styles.header}>
        <h2 id={titleId}>{visit.name}</h2>
        <span className={styles.kind}>
          <RoomIcon size={14} aria-hidden="true" />
          {INTERIOR_LABELS[visit.kind]}
          <span aria-hidden="true">·</span>
          {transit ? "Plan your journey" : "Explore freely"}
        </span>
      </header>

      <div className={styles.zoneHeading}>
        <span>{transit ? "Choose a travel point" : "Choose a corner"}</span>
        <span
          aria-label={
            transit
              ? `${activities.length} travel points`
              : `${explored} of ${activities.length} corners explored`
          }
        >
          {transit
            ? `${activities.length} travel points`
            : `${explored}/${activities.length} explored`}
        </span>
      </div>
      <div
        className={styles.zones}
        role="group"
        aria-label={transit ? "Travel points" : "Room corners"}
      >
        {activities.map((activity, index) => {
          const visited = completed.includes(activity.id);
          return (
            <button
              type="button"
              key={activity.id}
              className={styles.zone}
              aria-pressed={selected.id === activity.id}
              aria-label={`${activity.label}${visited ? ", explored" : ""}`}
              disabled={busy}
              onClick={() => onSelectZone(activity.id)}
            >
              <span className={styles.zoneNumber} aria-hidden="true">
                {visited ? (
                  <Check size={14} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <span>{activity.label}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.activity}>
        <p
          className={done ? styles.result : styles.description}
          role="status"
          aria-live="polite"
        >
          {done && <Check size={16} aria-hidden="true" />}
          <span>{status}</span>
        </p>
        <button
          type="button"
          className={styles.perform}
          disabled={busy || !motion}
          aria-label={actionLabel}
          onClick={() => onPerform(selected.id)}
        >
          {!motion ? (
            <Pause size={17} aria-hidden="true" />
          ) : activityState === "walking" ? (
            <Footprints size={17} aria-hidden="true" />
          ) : done ? (
            <Check size={17} aria-hidden="true" />
          ) : (
            <Play size={16} aria-hidden="true" />
          )}
          {actionLabel}
          {!busy && motion && (
            <ArrowUpRight
              size={17}
              className={styles.actionArrow}
              aria-hidden="true"
            />
          )}
        </button>
        {!motion && !busy && (
          <span className={styles.pauseHint}>
            Use the play control to resume movement.
          </span>
        )}
      </div>

      <footer className={styles.footer}>
        <p>
          {visit.kind === "home"
            ? "Your ROAM home is an original imagined space."
            : transit
              ? "This is an original imagined transit scene. The real facility’s layout and services may differ."
              : "This is an original imagined room. The venue’s actual layout and services may differ."}
        </p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`View map source for ${visit.name}`}
          >
            Mapped place
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        )}
      </footer>
    </section>
  );
}
