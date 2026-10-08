"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, ScanFace, PersonStanding } from "lucide-react";
import type { CharacterAppearance } from "../lib/appearance";
import {
  APPEARANCE_BODY_OPTIONS,
  compatibleAppearance,
} from "../lib/appearance";
import styles from "./CharacterPreview.module.css";

type Preview = {
  setAppearance: (appearance: CharacterAppearance) => void;
  rotate: (delta: number) => void;
  front: () => void;
  setView: (view: "full" | "face") => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

export default function CharacterPreview({
  appearance,
  variant = "default",
}: {
  appearance: CharacterAppearance;
  variant?: "default" | "wardrobe";
}) {
  const look = compatibleAppearance(appearance);
  const options = APPEARANCE_BODY_OPTIONS[look.bodyType];
  const outfitLabel = options.outfits.find(
    ([id]) => id === look.outfitStyle,
  )?.[1];
  const hairLabel = options.hairstyles.find(
    ([id]) => id === look.hairStyle,
  )?.[1];
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Preview | null>(null);
  const latest = useRef(look);
  latest.current = look;
  const drag = useRef<{ pointer: number; x: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [view, setView] = useState<"full" | "face">("full");

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let instance: Preview | null = null;
    import("../lib/character-preview.js")
      .then(({ createCharacterPreview }) => {
        if (cancelled || !canvas.current || !host.current) return;
        try {
          instance = createCharacterPreview({
            canvas: canvas.current,
            appearance: latest.current,
          });
          controller.current = instance;
          const resize = () => {
            if (!host.current) return;
            const bounds = host.current.getBoundingClientRect();
            instance?.resize(bounds.width, bounds.height);
          };
          observer = new ResizeObserver(resize);
          observer.observe(host.current);
          resize();
          setStatus("ready");
        } catch {
          instance?.dispose();
          controller.current = null;
          setStatus("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.dispose();
      controller.current = null;
      drag.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.setAppearance(compatibleAppearance(appearance));
  }, [appearance]);

  function show(next: "full" | "face") {
    setView(next);
    controller.current?.setView(next);
  }

  return (
    <div
      className={`${styles.studio}${variant === "wardrobe" ? ` ${styles.wardrobe}` : ""}`}
    >
      <div className={styles.badge}>
        <span /> YOUR ROAM CHARACTER
      </div>
      <div className={styles.framing} role="group" aria-label="Preview framing">
        <button
          type="button"
          aria-pressed={view === "full"}
          disabled={status !== "ready"}
          onClick={() => show("full")}
        >
          <PersonStanding size={16} /> Full body
        </button>
        <button
          type="button"
          aria-pressed={view === "face"}
          disabled={status !== "ready"}
          onClick={() => show("face")}
        >
          <ScanFace size={16} /> Face &amp; hair
        </button>
      </div>
      <div
        ref={host}
        className={styles.viewport}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current || status !== "ready") return;
          drag.current = { pointer: event.pointerId, x: event.clientX };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || event.pointerId !== drag.current.pointer) return;
          controller.current?.rotate((event.clientX - drag.current.x) * 0.012);
          drag.current.x = event.clientX;
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointer !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label={`3D ${look.bodyType} character wearing ${outfitLabel}, with ${hairLabel} hair. Use the preview controls to turn and inspect your look.`}
        />
        {status !== "ready" && (
          <p className={styles.status} role="status">
            {status === "loading"
              ? "Getting your character ready…"
              : "3D preview is unavailable on this device. You can still choose and save your look."}
          </p>
        )}
      </div>
      <div
        className={styles.controls}
        role="group"
        aria-label="Character preview controls"
      >
        <button
          type="button"
          aria-label="Turn character left"
          disabled={status !== "ready"}
          onClick={() => controller.current?.rotate(-Math.PI / 4)}
        >
          <RotateCcw size={18} />
        </button>
        <button
          type="button"
          className={styles.front}
          disabled={status !== "ready"}
          onClick={() => controller.current?.front()}
        >
          Front view
        </button>
        <button
          type="button"
          aria-label="Turn character right"
          disabled={status !== "ready"}
          onClick={() => controller.current?.rotate(Math.PI / 4)}
        >
          <RotateCw size={18} />
        </button>
      </div>
      <p className={styles.hint}>
        Drag to turn · See your look from every side
      </p>
    </div>
  );
}
