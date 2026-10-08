"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bike,
  Bus,
  CarFront,
  Eye,
  Armchair,
  Users,
  Footprints,
  Plane,
  TrainFront,
} from "lucide-react";
import type { TravelPhase, TravelSequence } from "../lib/travel-sequence";
import styles from "./TravelOverlay.module.css";

export default function TravelOverlay({
  sequence,
  phase,
  error,
  onSkip,
  onView,
}: {
  sequence: TravelSequence;
  phase: TravelPhase | null;
  error?: string;
  onSkip: () => void;
  onView?: (view: "outside" | "cabin" | "seat") => boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<"outside" | "cabin" | "seat">("outside");
  useEffect(() => setView("outside"), [sequence.id]);
  const skipButton = useRef<HTMLButtonElement>(null);
  const heldKey = useRef<string | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted) skipButton.current?.focus();
  }, [mounted]);
  const Icon =
    sequence.mode === "flight"
      ? Plane
      : sequence.mode === "walk"
        ? Footprints
        : sequence.mode === "cycle"
          ? Bike
          : sequence.mode === "taxi"
            ? CarFront
            : ["train", "metro", "tram"].includes(sequence.mode)
              ? TrainFront
              : Bus;
  if (!mounted) return null;
  return createPortal(
    <aside className={styles.panel} aria-label="Simulated transport journey">
      <div className={styles.icon} aria-hidden="true">
        <Icon size={24} />
      </div>
      <div className={styles.copy}>
        <span>
          {sequence.departure
            ? "YOUR DEPARTURE"
            : sequence.arrival
              ? "WELCOME TO LISBON"
              : "ON YOUR WAY"}
        </span>
        <h2>{sequence.departure ? "Leaving Lisbon" : sequence.to.name}</h2>
        <p role="status">
          {error || phase?.label || "Preparing your simulated journey…"}
        </p>
        {sequence.mode === "flight" &&
          onView &&
          phase?.phase !== "arriving" &&
          !error && (
            <div
              className={styles.views}
              role="group"
              aria-label="Flight camera view"
            >
              {(
                [
                  ["outside", "Outside", Eye],
                  ["cabin", "Cabin", Users],
                  ["seat", "My seat", Armchair],
                ] as const
              ).map(([id, label, ViewIcon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  disabled={!phase}
                  onClick={() => {
                    if (onView(id)) setView(id);
                  }}
                >
                  <ViewIcon size={15} /> {label}
                </button>
              ))}
            </div>
          )}
        <small>Simulated journey</small>
      </div>
      <button
        ref={skipButton}
        type="button"
        onClick={onSkip}
        onBlur={() => {
          heldKey.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) heldKey.current = event.key;
        }}
        onKeyUp={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          if (heldKey.current === event.key) {
            heldKey.current = null;
            onSkip();
          }
        }}
      >
        {error ? "Continue" : "Skip journey"} <ArrowRight size={17} />
      </button>
    </aside>,
    document.body,
  );
}
