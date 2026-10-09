"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, X } from "lucide-react";
import { GEOGRAPHIC_HOTSPOTS } from "../lib/geography";
import { INTERIOR_ACTIVITIES, interiorForHotspot } from "../lib/interiors";
import { JOURNEY_HUBS } from "../lib/journey";
import type { WorldHotspot } from "../lib/world-state";
import styles from "./LocationPopup.module.css";

export type LocationPopupProps = {
  hotspot: WorldHotspot;
  stage?: "plan" | "arrival";
  onClose: () => void;
  onLookAround: () => void;
  onPreview?: () => void;
  transportOptions?: readonly {
    id: string;
    emoji: string;
    label: string;
    detail: string;
    disabled?: boolean;
    onSelect: () => void;
  }[];
  busy?: boolean;
  onEnterActivity?: (activityId?: string) => void;
  onTransit?: () => void;
  transitDisabled?: boolean;
  transitHint?: string;
  onTravel?: () => void;
  onRemovePin?: () => void;
};

const placeGraphics: Record<string, string> = {
  cafe: "☕️",
  restaurant: "🍽️",
  gym: "🏋️",
  shop: "🛍️",
  museum: "🏛️",
  culture: "🎭",
  bar: "🍹",
  beach: "🏖️",
  viewpoint: "🌄",
  landmark: "🏰",
  market: "🧺",
  street: "🚶",
  transport: "🚆",
};

const activityGraphics: Record<string, string> = {
  espresso: "☕️",
  pastry: "🥐",
  table: "🪑",
  treadmill: "🏃",
  weights: "🏋️",
  stretch: "🧘",
  browse: "👕",
  "try-on": "🪞",
  counter: "🛎️",
  gallery: "🖼️",
  tiles: "🎨",
  bench: "🪑",
  listen: "🎶",
  lounge: "🛋️",
  card: "💳",
  "check-in": "✈️",
  gate: "🚪",
  tickets: "🎟️",
  platform: "🚉",
  timetable: "🗓️",
  board: "🚌",
};

function safeSource(value?: string) {
  try {
    const url = value ? new URL(value) : null;
    return url?.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** The street stays visible behind this native modal. Venue options are the
 * existing simulated room activities; a map pin never invents an interior. */
export default function LocationPopup({
  hotspot,
  stage = "arrival",
  onClose,
  onLookAround,
  onPreview,
  transportOptions = [],
  busy = false,
  onEnterActivity,
  onTransit,
  transitDisabled = false,
  transitHint,
  onTravel,
  onRemovePin,
}: LocationPopupProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  const descriptionId = `${titleId}-description`;
  const kind = interiorForHotspot(hotspot);
  const hub = Object.values(JOURNEY_HUBS).find(
    (candidate) => hotspot.id === `transit-${candidate.id}`,
  );
  const enterable = !!kind && !!onEnterActivity;
  const transit = !!hub && !!onTransit;
  const graphic = hotspot.custom
    ? "📍"
    : hub?.kind === "airport"
      ? "✈️"
      : hub?.kind === "bus-stop"
        ? "🚌"
        : placeGraphics[hotspot.category || ""] || "📍";
  const description = hotspot.custom
    ? "A location you picked from a Maps link. Explore the scenery around your pin."
    : hotspot.description ||
      GEOGRAPHIC_HOTSPOTS.find((place) => place.id === hotspot.id)
        ?.description ||
      "Take a closer look at this mapped place in Lisbon.";
  const mapsUrl = safeSource(hotspot.mapsUrl);
  const sourceUrl = safeSource(hotspot.sourceUrl);
  const enterLabel =
    kind === "cafe"
      ? "Enter the café"
      : kind === "museum"
        ? "Enter the gallery"
        : `Enter the ${kind}`;

  useEffect(() => {
    const element = dialog.current;
    const previouslyFocused = document.activeElement;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      data-location-popup
      data-stage={stage}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close.current();
      }}
    >
      <div className={styles.content}>
        <div className={styles.topline}>
          <span>
            {hotspot.custom ? "Your map pin" : hotspot.area || "Lisbon"}
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close location options"
            autoFocus
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <header className={styles.heading}>
          <span
            className={styles.hero}
            data-tone={hub?.kind || hotspot.category || "pin"}
            aria-hidden="true"
          >
            {graphic}
          </span>
          <div>
            <span className={styles.eyebrow}>A little stop. A new story.</span>
            <h2 id={titleId}>{hotspot.name}</h2>
          </div>
        </header>
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>

        {stage === "plan" && (
          <>
            <section
              className={styles.options}
              aria-label="Choose how to get there"
            >
              <h3>Choose how to get there</h3>
              {transportOptions.map((option) => (
                <button
                  type="button"
                  className={styles.option}
                  key={option.id}
                  onClick={option.onSelect}
                  disabled={busy || option.disabled}
                  data-transport={option.id}
                >
                  <span className={styles.optionEmoji} aria-hidden="true">
                    {option.emoji}
                  </span>
                  <span className={styles.optionCopy}>
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </section>
            <button
              type="button"
              className={`${styles.primary} ${styles.preview}`}
              onClick={onPreview || onLookAround}
              disabled={busy}
            >
              <span>
                <span aria-hidden="true">🧭</span> 360° preview
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <p className={styles.hint} role={busy ? "status" : undefined}>
              {busy
                ? "Preparing your arrival…"
                : "Take a look around first, or travel there to explore the location."}
            </p>
          </>
        )}

        {stage === "arrival" && enterable && (
          <>
            <button
              type="button"
              className={styles.primary}
              onClick={() => onEnterActivity()}
              disabled={busy}
            >
              {enterLabel}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <section className={styles.options} aria-label="Things to do here">
              <h3>What would you like to do?</h3>
              {INTERIOR_ACTIVITIES[kind].map((activity) => (
                <button
                  type="button"
                  className={styles.option}
                  key={activity.id}
                  onClick={() => onEnterActivity(activity.id)}
                  disabled={busy}
                  data-activity={activity.id}
                >
                  <span className={styles.optionEmoji} aria-hidden="true">
                    {activityGraphics[activity.id] || graphic}
                  </span>
                  <span className={styles.optionCopy}>
                    <strong>{activity.actionLabel}</strong>
                    <span>{activity.label} · in the ROAM scene</span>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </section>
          </>
        )}

        {stage === "arrival" && transit && (
          <>
            <button
              type="button"
              className={styles.primary}
              onClick={onTransit}
              disabled={busy || transitDisabled}
              aria-describedby={
                transitHint ? `${titleId}-transit-hint` : undefined
              }
            >
              {hub.kind === "bus-stop"
                ? "Stand at the bus stop"
                : hub.kind === "station"
                  ? "Enter the train station"
                  : "Enter the airport"}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            {transitHint && (
              <p className={styles.hint} id={`${titleId}-transit-hint`}>
                {transitHint}
              </p>
            )}
            <div
              className={styles.transitOptions}
              aria-label="Inside this scene"
            >
              {INTERIOR_ACTIVITIES[hub.kind].map((activity) => (
                <span key={activity.id}>
                  <span aria-hidden="true">
                    {activityGraphics[activity.id]}
                  </span>
                  {activity.label}
                </span>
              ))}
            </div>
          </>
        )}

        {stage === "arrival" && (
          <div className={styles.streetActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={onLookAround}
              disabled={busy}
            >
              <span aria-hidden="true">🧭</span>
              Look around in 3D
            </button>
            {onTravel && (
              <button
                type="button"
                className={styles.secondary}
                onClick={onTravel}
                disabled={busy}
              >
                <span aria-hidden="true">🧳</span>
                Travel here in your trip
              </button>
            )}
          </div>
        )}

        <p className={styles.note}>
          {stage === "plan"
            ? "Travel is simulated with your ROAM trip budget. Nothing is booked with a real operator."
            : enterable || transit
              ? "Original ROAM scenes and simulated activities. The actual layout and services may differ. Nothing is booked."
              : "Mapped scenery is approximate. This pin does not represent a surveyed entrance or interior."}
        </p>
        <details className={styles.details}>
          <summary>
            Map details <ChevronDown size={14} aria-hidden="true" />
          </summary>
          {hotspot.address && <p>{hotspot.address}</p>}
          <p className={styles.coordinates}>
            {hotspot.lat.toFixed(5)}, {hotspot.lng.toFixed(5)}
          </p>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer">
              Open in Google Maps <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              {hotspot.mapVenue || hotspot.mapLocation
                ? "View map source"
                : "Place context"}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          {hotspot.custom && onRemovePin && (
            <button
              type="button"
              className={styles.remove}
              onClick={onRemovePin}
            >
              Remove this pin
            </button>
          )}
        </details>
      </div>
    </dialog>
  );
}
