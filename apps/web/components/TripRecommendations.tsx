"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Setup } from "../lib/engine";
import type { PlaceId } from "../lib/content";
import {
  profileRecommendations,
  type RecommendationResult,
} from "../lib/recommendations";
import styles from "./TripRecommendations.module.css";

const chapterGraphics: Record<PlaceId, string> = {
  home: "🏡",
  exchange: "🎨",
  cafe: "☕️",
  viewpoint: "🌅",
  riverside: "🌊",
  music: "🎶",
  cais: "🛍️",
  benfica: "🏘️",
  sintra: "🏰",
};

export default function TripRecommendations({
  setup,
  onChoose,
}: {
  setup: Setup;
  onChoose: (id: PlaceId) => void;
}) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);
    request.current?.abort();
    return () => request.current?.abort();
  }, [setup]);
  const items = result?.items || profileRecommendations(setup);
  async function refresh() {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup }),
        signal: controller.signal,
      });
      const next = await response.json();
      if (!response.ok)
        throw new Error(next.error || "Suggestions are unavailable.");
      if (!controller.signal.aborted) setResult(next);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Your profile-based picks are still ready.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className={styles.recommendations}
      aria-label="Your trip recommendations"
    >
      <header>
        <div>
          <span className={styles.kicker}>A CITY THAT FITS YOU</span>
          <h3>
            {result?.source === "ai"
              ? "AI picks for your chapter"
              : "Your profile-based picks"}
          </h3>
        </div>
        <button type="button" onClick={refresh} disabled={busy}>
          <span className={styles.actionGraphic} aria-hidden="true">
            ✨
          </span>
          {busy ? "Finding your rhythm…" : "Ask AI for suggestions"}
        </button>
      </header>
      <div className={styles.items}>
        {items.map((item) => (
          <button
            type="button"
            key={item.place}
            onClick={() => onChoose(item.place)}
          >
            <span className={styles.itemGraphic} aria-hidden="true">
              {chapterGraphics[item.place]}
            </span>
            <strong>
              {item.title}
              <ArrowUpRight size={15} aria-hidden="true" />
            </strong>
            <span className={styles.itemDetail}>{item.detail}</span>
          </button>
        ))}
      </div>
      <p role="status">
        {error ||
          result?.note ||
          "Matched to your category and interests. AI uses your profile choices and stay length when the server is connected."}
      </p>
    </section>
  );
}
