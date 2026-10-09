"use client";

import { useId, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  DoorOpen,
  Footprints,
  Pause,
  Play,
} from "lucide-react";
import {
  INTERIOR_ACTIVITIES,
  INTERIOR_LABELS,
  type InteriorKind,
  type InteriorVisit,
} from "../lib/interiors";
import styles from "./InteriorPanel.module.css";
import ClubMusic from "./ClubMusic";

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

const roomGraphics: Record<InteriorKind, string> = {
  home: "🏡",
  cafe: "☕️",
  gym: "🏋️",
  shop: "🛍️",
  museum: "🎨",
  bar: "🍹",
  airport: "✈️",
  station: "🚆",
  "bus-stop": "🚌",
};

const cornerGraphics: Record<InteriorKind, Record<string, string>> = {
  home: { rest: "🛋️", kitchen: "🥐", plan: "🗺️" },
  cafe: { espresso: "☕️", pastry: "🥐", table: "🪑" },
  gym: { treadmill: "🏃", weights: "🏋️", stretch: "🧘" },
  shop: { browse: "👕", "try-on": "🪞", counter: "🛍️" },
  museum: { gallery: "🖼️", tiles: "🔷", bench: "🪑" },
  bar: { listen: "🎶", counter: "🍹", lounge: "🛋️" },
  airport: { card: "💳", "check-in": "✈️", gate: "🎟️" },
  station: { card: "💳", tickets: "🎟️", platform: "🚆" },
  "bus-stop": { card: "💳", timetable: "🗓️", board: "🚌" },
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
  const [expanded, setExpanded] = useState(false);
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
      data-expanded={expanded}
    >
      <div className={styles.topline}>
        <button
          type="button"
          className={styles.detailsToggle}
          aria-expanded={expanded}
          aria-controls={`${titleId}-corners ${titleId}-room-details`}
          onClick={() => setExpanded((open) => !open)}
        >
          Room activities
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <span className={styles.badge}>
          <DoorOpen size={13} aria-hidden="true" />
          {transit ? "Your next stop" : "Inside Lisbon"}
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
        <span className={styles.venueGraphic} aria-hidden="true">
          {roomGraphics[visit.kind]}
        </span>
        <div className={styles.headerCopy}>
          <h2 id={titleId}>{visit.name}</h2>
          <div className={styles.kind}>
            <span className={styles.kindChip}>
              {INTERIOR_LABELS[visit.kind]}
            </span>
            <span>{transit ? "Plan your journey" : "Explore freely"}</span>
          </div>
        </div>
      </header>

      <div id={`${titleId}-corners`} className={styles.detailControls}>
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
                <span className={styles.zoneTop} aria-hidden="true">
                  <span className={styles.zoneGraphic}>
                    {cornerGraphics[visit.kind][activity.id] ||
                      roomGraphics[visit.kind]}
                  </span>
                  <span className={styles.zoneNumber} data-complete={visited}>
                    {visited ? (
                      <Check size={12} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                </span>
                <span>{activity.label}</span>
              </button>
            );
          })}
        </div>
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

      <div id={`${titleId}-room-details`} className={styles.extraDetails}>
        {visit.kind === "bar" && (
          <div className={styles.activity}>
            <ClubMusic key={visit.id} enabled={motion} compact />
          </div>
        )}

        <footer className={styles.footer}>
          <p>
            {visit.kind === "home"
              ? "Your ROAM home is an original imagined space."
              : transit
                ? "This is an original imagined transit scene. The real facility’s layout and services may differ."
                : visit.kind === "bar"
                  ? "This room and its synthesized club mix are original ROAM creations. The venue’s actual layout and services may differ."
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
      </div>
      <p className={styles.compactNote}>
        {visit.kind === "home"
          ? "An original ROAM space."
          : "An imagined scene. The actual layout may differ."}
      </p>
    </section>
  );
}
