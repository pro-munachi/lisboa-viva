"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bike,
  Bus,
  CarFront,
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
}: {
  sequence: TravelSequence;
  phase: TravelPhase | null;
  error?: string;
  onSkip: () => void;
}) {
  const [mounted, setMounted] = useState(false);
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
        <small>
          Original vehicle scene · Simulated journey · Nothing is booked
        </small>
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
