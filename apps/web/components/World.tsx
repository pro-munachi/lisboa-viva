"use client";
import { useEffect, useRef, useState } from "react";
import type { PlaceId } from "../lib/content";
export default function World({
  place,
  shirt,
  onSelect,
}: {
  place: PlaceId;
  shirt: string;
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [status, setStatus] = useState("Building your little world…");
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    setStatus("Building your little world…");
    import("../lib/scene.js")
      .then(({ createWorld }) => {
        if (cancelled || !host.current) return;
        try {
          dispose = createWorld(host.current, place, shirt, (id: string) =>
            callback.current(id),
          );
          setStatus("");
        } catch {
          setStatus(
            "3D is unavailable on this device. All experiences are playable with the buttons.",
          );
        }
      })
      .catch(() => {
        if (!cancelled)
          setStatus(
            "The scene could not load. Use the experience buttons to keep playing.",
          );
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [place, shirt]);
  return (
    <div
      className="world"
      aria-label="Lisbon 3D scene. Select an object or use the experience buttons."
    >
      <div ref={host} className="world-canvas" />
      {status && (
        <p className="world-loading" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
