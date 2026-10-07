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
  Users,
  X,
  Clock3,
} from "lucide-react";
import GoogleWorld from "./GoogleWorld";
import InteriorPanel from "./InteriorPanel";
import { INTERIOR_ACTIVITIES, type InteriorVisit } from "../lib/interiors";
import { isGoogleMapsConfigured } from "../lib/google-maps";
import { CITY, cityMinute } from "../lib/cities";
import type { WorldFocus, WorldHotspot } from "../lib/world-state";
type CityController = {
  ready: Promise<void>;
  setInterior: (visit: InteriorVisit | null) => void;
  selectInteriorZone: (id: string) => void;
  performInteriorAction: (id: string, duration?: number) => void;
  setFocus: (f: WorldFocus, street?: boolean) => void;
  setMarkers: (h: WorldHotspot[]) => void;
  overview: () => void;
  characters: () => void;
  people: () => void;
  setMode: (mode: string) => void;
  setMotion: (value: boolean) => void;
  setTime: (minute: number) => void;
  zoom: (multiplier: number) => void;
  rotate: (angle: number) => void;
  dispose: () => void;
};
type LocalPerson = { name: string; label: string };
export default function World({
  focus,
  shirt,
  hotspots,
  onHotspot,
  interior,
  onExitInterior,
  onTransitAction,
  minute,
}: {
  focus: WorldFocus;
  shirt: string;
  hotspots: WorldHotspot[];
  onHotspot: (h: WorldHotspot) => void;
  interior: InteriorVisit | null;
  onExitInterior: () => void;
  onTransitAction?: (id: string) => void;
  minute?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<CityController | null>(null);
  const callback = useRef(onHotspot);
  callback.current = onHotspot;
  const [cityClock, setCityClock] = useState(660);
  const [sceneTime, setSceneTime] = useState("live");
  const sceneMinute = sceneTime === "trip" ? minute ?? cityClock :
    sceneTime === "day" ? 720 : sceneTime === "golden" ? 1110 :
    sceneTime === "night" ? 1260 : cityClock;
  const latest = useRef({ focus, shirt, hotspots, interior, minute: sceneMinute });
  latest.current = { focus, shirt, hotspots, interior, minute: sceneMinute };
  const [status, setStatus] = useState("Loading Lisbon’s streets…");
  const [gesture, setGesture] = useState("orbit");
  const [motion, setMotion] = useState(true);
  const [google, setGoogle] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [person, setPerson] = useState<LocalPerson | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [activityState, setActivityState] = useState<
    "idle" | "walking" | "active"
  >("idle");
  const [completed, setCompleted] = useState<string[]>([]);
  const [roomError, setRoomError] = useState("");
  const [stats, setStats] = useState<{
    buildings: number;
    roads: number;
    terrain: boolean;
    people?: number;
  } | null>(null);
  const ui = useRef({ gesture, motion });
  ui.current = { gesture, motion };
  useEffect(() => {
    const update = () => {
      setCityClock(cityMinute(new Date()));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { controller.current?.setTime(sceneMinute); }, [sceneMinute]);
  useEffect(() => {
    setPerson(null);
    if (google) return;
    let cancelled = false;
    import("../lib/city-scene.js")
      .then(({ createCity }) => {
        if (cancelled || !host.current) return;
        try {
          controller.current = createCity(host.current, {
            ...latest.current,
            city: CITY,
            onHotspot: (h: WorldHotspot) => {
              setPerson(null);
              callback.current(h);
            },
            onStatus: setStatus,
            onStats: setStats,
            onPerson: (local: LocalPerson) => {
              setGallery(false);
              setPerson(local);
            },
            onInteriorZone: (id: string) => {
              setSelectedZone(id);
              setRoomError("");
            },
            onInteriorActivity: (event: {
              state: "idle" | "walking" | "active" | "complete";
              zoneId?: string;
              error?: string;
            }) => {
              setActivityState(
                event.state === "complete" ? "idle" : event.state,
              );
              if (event.error) setRoomError(event.error);
              if (event.state === "complete" && event.zoneId)
                setCompleted((list) =>
                  list.includes(event.zoneId!)
                    ? list
                    : [...list, event.zoneId!],
                );
            },
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
    setGallery(false);
    setPerson(null);
    controller.current?.setFocus(focus);
    // A journey hub can update its map focus after entering a room. Restore
    // the requested interior after the focus command clears the previous view.
    controller.current?.setInterior(interior);
  }, [focus, interior]);
  useEffect(() => {
    controller.current?.setMarkers(hotspots);
  }, [hotspots]);
  useEffect(() => {
    setGallery(false);
    setPerson(null);
    setCompleted([]);
    setRoomError("");
    setActivityState("idle");
    setSelectedZone(interior ? INTERIOR_ACTIVITIES[interior.kind][0].id : null);
    if (interior) setGoogle(false);
  }, [interior]);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) setMotion(false);
  }, []);
  return (
    <>
      <div
        className="world"
        aria-label={
          interior
            ? `${interior.name} original 3D interior. Choose a floating activity icon or a room corner to interact.`
            : "Continuous Lisbon 3D world. Select a floating hotspot icon to explore a place. Drag to rotate, use Pan to move, or scroll to zoom."
        }
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
        <label className="world-time">
          <Clock3 size={15} />
          <select aria-label="Scene time" value={sceneTime} onChange={(e) => setSceneTime(e.target.value)}>
            <option value="live">Live city time</option>
            {minute !== undefined && <option value="trip">Trip time</option>}
            <option value="day">Daylight preview</option>
            <option value="golden">Golden hour preview</option>
            <option value="night">Night preview</option>
          </select>
          <span>{String(Math.floor(sceneMinute / 60)).padStart(2, "0")}:{String(sceneMinute % 60).padStart(2, "0")}</span>
        </label>
      )}
      {!google && (
        <div
          className={
            interior ? "world-controls interior-controls" : "world-controls"
          }
          aria-label="3D camera controls"
        >
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
          {!interior && (
            <>
              <button
                aria-label="Street level"
                onClick={() => {
                  setGallery(false);
                  setPerson(null);
                  controller.current?.setFocus(focus, true);
                }}
              >
                <PersonStanding size={17} />
                <span>Street level</span>
              </button>
              <button
                aria-label="Characters"
                onClick={() => {
                  setGallery(true);
                  setPerson(null);
                  controller.current?.characters();
                }}
              >
                <PersonStanding size={17} />
                <span>Characters</span>
              </button>
              <button
                aria-label="Show nearby NPCs"
                onClick={() => {
                  setGallery(false);
                  setPerson(null);
                  controller.current?.people();
                }}
              >
                <Users size={17} />
                <span>Locals</span>
              </button>
              <button
                aria-label="Whole region"
                onClick={() => {
                  setGallery(false);
                  setPerson(null);
                  controller.current?.overview();
                }}
              >
                <Globe2 size={17} />
                <span>Whole region</span>
              </button>
            </>
          )}
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
      {interior && (
        <InteriorPanel
          visit={interior}
          selectedZone={selectedZone}
          activityState={activityState}
          completed={completed}
          motion={motion}
          onSelectZone={(id) => controller.current?.selectInteriorZone(id)}
          onPerform={(id) => {
            setRoomError("");
            if (
              ["airport", "station", "bus-stop"].includes(interior.kind) &&
              onTransitAction
            ) {
              onTransitAction(id);
              return;
            }
            controller.current?.performInteriorAction(
              id,
              INTERIOR_ACTIVITIES[interior.kind].find((a) => a.id === id)
                ?.durationMs,
            );
          }}
          onExit={onExitInterior}
        />
      )}
      {interior && roomError && (
        <p className="interior-error" role="alert">
          {roomError}
        </p>
      )}
      {gallery && (
        <div className="character-preview-label">
          CHARACTER PREVIEW · ORIGINAL ROAM MODELS
        </div>
      )}
      {!google && !gallery && person && (
        <aside className="local-card" aria-label="Simulated local conversation">
          <div className="local-card-header">
            <div>
              <span className="local-card-kicker">Simulated local</span>
              <strong>{person.name}</strong>
            </div>
            <button
              className="local-card-close"
              aria-label="Dismiss local conversation"
              onClick={() => setPerson(null)}
            >
              <X size={17} />
            </button>
          </div>
          <span className="local-card-label">{person.label}</span>
          <p>
            Olá! I’m out for a walk. Take your time and explore the streets
            around you.
          </p>
        </aside>
      )}
      <div
        className={interior ? "map-credits interior-credits" : "map-credits"}
      >
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
        {!interior && (
          <>
            <span>Building heights & façades approximate</span>
            <span title="Produced using Copernicus data and information funded by the European Union — EU-DEM layers">
              Produced using Copernicus data and information funded by the
              European Union — EU-DEM layers
            </span>
            {stats && (
              <span>{stats.buildings.toLocaleString()} footprints loaded</span>
            )}
            {!google && stats?.people !== undefined && (
              <span>{stats.people} simulated locals</span>
            )}
            {isGoogleMapsConfigured && (
              <button
                onClick={() => {
                  setPerson(null);
                  setGallery(false);
                  setGoogle((v) => !v);
                }}
              >
                {google ? "Open-data simulation" : "Google 3D imagery"}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
