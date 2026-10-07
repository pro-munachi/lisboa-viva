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
} from "lucide-react";
import GoogleWorld from "./GoogleWorld";
import InteriorPanel from "./InteriorPanel";
import { INTERIOR_ACTIVITIES, type InteriorVisit } from "../lib/interiors";
import { isGoogleMapsConfigured } from "../lib/google-maps";
import type { WorldFocus, WorldHotspot } from "../lib/world-state";
import type { MultiplayerPeer } from "../lib/multiplayer";
import type { CharacterAppearance } from "../lib/appearance";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
type CityController = {
  ready: Promise<void>;
  setInterior: (visit: InteriorVisit | null) => void;
  selectInteriorZone: (id: string) => void;
  performInteriorAction: (id: string, duration?: number) => void;
  setFocus: (f: WorldFocus, street?: boolean) => void;
  setMarkers: (h: WorldHotspot[]) => void;
  setPeers: (peers: MultiplayerPeer[]) => void;
  overview: () => void;
  characters: () => void;
  people: () => void;
  setMode: (mode: string) => void;
  setMotion: (value: boolean) => void;
  zoom: (multiplier: number) => void;
  rotate: (angle: number) => void;
  dispose: () => void;
};
type LocalPerson = { name: string; label: string };
export default function World({
  focus,
  shirt,
  appearance = DEFAULT_APPEARANCE,
  hotspots,
  onHotspot,
  interior,
  onExitInterior,
  peers = [],
}: {
  focus: WorldFocus;
  shirt: string;
  appearance?: CharacterAppearance;
  hotspots: WorldHotspot[];
  onHotspot: (h: WorldHotspot) => void;
  interior: InteriorVisit | null;
  onExitInterior: () => void;
  peers?: MultiplayerPeer[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<CityController | null>(null);
  const callback = useRef(onHotspot);
  callback.current = onHotspot;
  const latest = useRef({
    focus,
    shirt,
    appearance,
    hotspots,
    interior,
    peers,
  });
  latest.current = { focus, shirt, appearance, hotspots, interior, peers };
  const [status, setStatus] = useState("Loading Lisbon’s streets…");
  const [gesture, setGesture] = useState("orbit");
  const [motion, setMotion] = useState(true);
  const [google, setGoogle] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [person, setPerson] = useState<LocalPerson | null>(null);
  const [peer, setPeer] = useState<MultiplayerPeer | null>(null);
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
    setPerson(null);
    if (google) return;
    let cancelled = false;
    import("../lib/city-scene.js")
      .then(({ createCity }) => {
        if (cancelled || !host.current) return;
        try {
          controller.current = createCity(host.current, {
            ...latest.current,
            onHotspot: (h: WorldHotspot) => {
              setPerson(null);
              callback.current(h);
            },
            onStatus: setStatus,
            onStats: setStats,
            onPerson: (local: LocalPerson) => {
              setPeer(null);
              setGallery(false);
              setPerson(local);
            },
            onPeer: (player: MultiplayerPeer) => {
              setPerson(null);
              setGallery(false);
              setPeer(player);
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
  }, [google, shirt, appearance]);
  useEffect(() => {
    setGallery(false);
    setPerson(null);
    controller.current?.setFocus(focus);
  }, [focus]);
  useEffect(() => {
    controller.current?.setMarkers(hotspots);
  }, [hotspots]);
  useEffect(() => {
    controller.current?.setPeers(peers);
  }, [peers]);
  useEffect(() => {
    setGallery(false);
    setPerson(null);
    setCompleted([]);
    setRoomError("");
    setActivityState("idle");
    setSelectedZone(interior ? INTERIOR_ACTIVITIES[interior.kind][0].id : null);
    if (interior) setGoogle(false);
    controller.current?.setInterior(interior);
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
            ? `${interior.name} original 3D interior. Select a room corner to interact.`
            : "Continuous Lisbon 3D world. Drag to rotate, use Pan to move, or scroll to zoom."
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
      {!google && !gallery && peer && (
        <aside className="local-card peer-card" aria-label="Nearby player">
          <div className="local-card-header">
            <div>
              <span className="local-card-kicker">Player nearby</span>
              <strong>@{peer.handle}</strong>
            </div>
            <button
              className="local-card-close"
              aria-label="Dismiss nearby player"
              onClick={() => setPeer(null)}
            >
              <X size={17} />
            </button>
          </div>
          <span className="local-card-label">
            {peer.userType === "local" ? "Local" : "Tourist"} · {peer.area}
          </span>
          <p>This is another signed-in ROAM player who is online now.</p>
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
