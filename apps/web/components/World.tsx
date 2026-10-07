"use client";
import { useEffect, useRef, useState } from "react";
import {
  Compass,
  Hand,
  Minus,
  Pause,
  PersonStanding,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Globe2,
  Waves,
  Landmark,
} from "lucide-react";
import GoogleWorld from "./GoogleWorld";
import { isGoogleMapsConfigured } from "../lib/google-maps";
import type { WorldFocus, WorldHotspot } from "../lib/world-state";
type CityController = {
  setFocus: (f: WorldFocus, street?: boolean) => void;
  setMarkers: (h: WorldHotspot[]) => void;
  overview: () => void;
  coast: () => void;
  bridge: () => void;
  characters: () => void;
  setMode: (mode: string) => void;
  setMotion: (value: boolean) => void;
  zoom: (multiplier: number) => void;
  rotate: (angle: number) => void;
  dispose: () => void;
};
export default function World({
  focus,
  shirt,
  hotspots,
  onHotspot,
}: {
  focus: WorldFocus;
  shirt: string;
  hotspots: WorldHotspot[];
  onHotspot: (h: WorldHotspot) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<CityController | null>(null);
  const callback = useRef(onHotspot);
  callback.current = onHotspot;
  const latest = useRef({ focus, shirt, hotspots });
  latest.current = { focus, shirt, hotspots };
  const [status, setStatus] = useState("Loading Lisbon’s streets…");
  const [gesture, setGesture] = useState("orbit");
  const [motion, setMotion] = useState(true);
  const [google, setGoogle] = useState(false);
  const [gallery, setGallery] = useState<"" | "people" | "beach">("");
  const [stats, setStats] = useState<{
    buildings: number;
    roads: number;
    terrain: boolean;
  } | null>(null);
  const ui = useRef({ gesture, motion });
  ui.current = { gesture, motion };
  useEffect(() => {
    if (google) return;
    let cancelled = false;
    import("../lib/city-scene.js")
      .then(({ createCity }) => {
        if (cancelled || !host.current) return;
        try {
          controller.current = createCity(host.current, {
            ...latest.current,
            onHotspot: (h: WorldHotspot) => callback.current(h),
            onStatus: setStatus,
            onStats: setStats,
          });
          controller.current?.setMode(ui.current.gesture);
          controller.current?.setMotion(ui.current.motion);
        } catch {
          setStatus(
            "3D is unavailable on this device. Trip experiences still work.",
          );
        }
      })
      .catch(() => setStatus("The city could not load. Try reloading."));
    return () => {
      cancelled = true;
      controller.current?.dispose();
      controller.current = null;
    };
  }, [google, shirt]);
  useEffect(() => {
    setGallery("");
    controller.current?.setFocus(focus);
  }, [focus]);
  useEffect(() => {
    controller.current?.setMarkers(hotspots);
  }, [hotspots]);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) setMotion(false);
  }, []);
  return (
    <>
      <div
        className="world"
        aria-label="Continuous Lisbon 3D world. Drag to rotate, use Pan to move, or scroll to zoom."
      >
        {google ? (
          <GoogleWorld
            focus={{ ...focus, label: focus.name }}
            hotspots={hotspots}
            onSelect={onHotspot}
            onStatus={setStatus}
          />
        ) : (
          <div ref={host} className="world-canvas" />
        )}
        {status && (
          <p className="world-loading" role="status">
            {status}
          </p>
        )}
      </div>
      {!google && (
        <div className="world-controls" aria-label="3D camera controls">
          <div className="gesture-controls">
            <button
              aria-pressed={gesture === "orbit"}
              onClick={() => {
                setGesture("orbit");
                controller.current?.setMode("orbit");
              }}
            >
              <Compass size={17} />
              <span>Rotate</span>
            </button>
            <button
              aria-pressed={gesture === "pan"}
              onClick={() => {
                setGesture("pan");
                controller.current?.setMode("pan");
              }}
            >
              <Hand size={17} />
              <span>Pan</span>
            </button>
            <button
              disabled={!!gallery}
              aria-pressed={gesture === "walk"}
              onClick={() => {
                setGesture("walk");
                controller.current?.setMode("walk");
              }}
            >
              <PersonStanding size={17} />
              <span>Walk</span>
            </button>
          </div>
          <div className="camera-buttons">
            <button
              aria-label="Zoom in"
              onClick={() => controller.current?.zoom(0.75)}
            >
              <Plus size={17} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => controller.current?.zoom(1.3)}
            >
              <Minus size={17} />
            </button>
            <button
              aria-label="Rotate camera left"
              onClick={() => controller.current?.rotate(-Math.PI / 8)}
            >
              <RotateCcw size={17} />
            </button>
            <button
              aria-label="Rotate camera right"
              onClick={() => controller.current?.rotate(Math.PI / 8)}
            >
              <RotateCw size={17} />
            </button>
          </div>
          <button
            aria-label="Street level"
            onClick={() => {
              setGallery("");
              controller.current?.setFocus(focus, true);
            }}
          >
            <PersonStanding size={17} />
            <span>Street level</span>
          </button>
          <button
            aria-label="People"
            onClick={() => {
              setGallery("people");
              controller.current?.characters();
            }}
          >
            <PersonStanding size={17} />
            <span>People</span>
          </button>
          <button
            aria-label="Lisbon beaches and ocean"
            onClick={() => {
              setGallery("beach");
              controller.current?.coast();
            }}
          >
            <Waves size={17} />
            <span>Beaches</span>
          </button>
          <button
            aria-label="Ponte 25 de Abril Lisbon bridge"
            onClick={() => {
              setGallery("");
              controller.current?.bridge();
            }}
          >
            <Landmark size={17} />
            <span>Lisbon bridge</span>
          </button>
          <button
            aria-label="Whole region"
            onClick={() => {
              setGallery("");
              controller.current?.overview();
            }}
          >
            <Globe2 size={17} />
            <span>Whole region</span>
          </button>
          <button
            aria-label={
              motion ? "Pause ambient movement" : "Resume ambient movement"
            }
            onClick={() => {
              setMotion((v) => !v);
              controller.current?.setMotion(!motion);
            }}
          >
            {motion ? <Pause size={17} /> : <Play size={17} />}
          </button>
        </div>
      )}
      {gallery === "people" && (
        <div className="character-preview-label">
          PEOPLE · ORIGINAL ROAM CHARACTERS
        </div>
      )}
      {gallery === "beach" && (
        <div className="character-preview-label">
          CARCAVELOS BEACH · ATLANTIC OCEAN
        </div>
      )}
      <div className="map-credits">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
        <span>Building heights & façades approximate</span>
        <span title="Produced using Copernicus data and information funded by the European Union — EU-DEM layers">
          Produced using Copernicus data and information funded by the European
          Union — EU-DEM layers
        </span>
        {stats && (
          <span>{stats.buildings.toLocaleString()} footprints loaded</span>
        )}
        {isGoogleMapsConfigured && (
          <button onClick={() => setGoogle((v) => !v)}>
            {google ? "Open-data simulation" : "Google 3D imagery"}
          </button>
        )}
      </div>
    </>
  );
}
