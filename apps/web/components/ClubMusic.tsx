"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Music2, Play, Square, Volume2 } from "lucide-react";
import { createClubAudio } from "../lib/club-audio";
import styles from "./ClubMusic.module.css";

export type ClubMusicProps = { enabled?: boolean; compact?: boolean };

export default function ClubMusic({
  enabled = true,
  compact = false,
}: ClubMusicProps) {
  const id = useId();
  const audio = useRef<ReturnType<typeof createClubAudio> | null>(null);
  const mounted = useRef(true);
  const request = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [volume, setVolume] = useState(25);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    if (enabled) return;
    request.current++;
    audio.current?.stop();
    setPlaying(false);
    setStarting(false);
  }, [enabled]);
  async function play() {
    if (!enabled || starting) return;
    const instance =
      audio.current ||
      (audio.current = createClubAudio({ volume: volume / 100 }));
    const token = ++request.current;
    setError(null);
    setStarting(true);
    const ready = await instance.play();
    if (
      !mounted.current ||
      audio.current !== instance ||
      request.current !== token
    )
      return;
    setPlaying(ready);
    setStarting(false);
    setError(ready ? null : instance.error);
  }
  function stop() {
    request.current++;
    audio.current?.stop();
    setPlaying(false);
    setStarting(false);
  }
  function changeVolume(value: number) {
    setVolume(value);
    audio.current?.setVolume(value / 100);
  }
  return (
    <section
      className={`${styles.player} ${compact ? styles.compact : ""}`}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.heading}>
        <Music2 size={16} aria-hidden="true" />
        <div>
          <h3 id={`${id}-title`}>ROAM late set</h3>
          <p>Original generated club mix</p>
        </div>
        <span className={styles.status} aria-live="polite">
          {playing ? "Playing" : starting ? "Starting…" : "Ready"}
        </span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.play}
          onClick={playing || starting ? stop : play}
          disabled={!enabled}
          aria-label={
            playing || starting ? "Stop club music" : "Play club music"
          }
        >
          {playing || starting ? (
            <Square size={14} aria-hidden="true" />
          ) : (
            <Play size={15} aria-hidden="true" />
          )}
          {playing || starting ? "Stop" : "Play"}
        </button>
        <label htmlFor={`${id}-volume`} className={styles.volume}>
          <Volume2 size={16} aria-hidden="true" />
          <span className={styles.screenReader}>Music volume</span>
          <input
            id={`${id}-volume`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
            disabled={!enabled}
            aria-valuetext={`${volume} percent`}
          />
          <span>{volume}%</span>
        </label>
      </div>
      {error && (
        <p className={styles.error} role="status">
          {error}
        </p>
      )}
    </section>
  );
}
