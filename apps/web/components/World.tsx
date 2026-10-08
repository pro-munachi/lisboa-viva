"use client";
import { useEffect, useId, useRef, useState } from "react";
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
  SlidersHorizontal,
} from "lucide-react";
import GoogleWorld from "./GoogleWorld";
import InteriorPanel from "./InteriorPanel";
import TravelOverlay from "./TravelOverlay";
import { INTERIOR_ACTIVITIES, type InteriorVisit } from "../lib/interiors";
import { isGoogleMapsConfigured } from "../lib/google-maps";
import { CITY, cityMinute } from "../lib/cities";
import type { WorldFocus, WorldHotspot } from "../lib/world-state";
import type { TravelPhase, TravelSequence } from "../lib/travel-sequence";
import type { MultiplayerPeer } from "../lib/multiplayer";
import type { CharacterAppearance } from "../lib/appearance";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
import controlStyles from "./WorldControls.module.css";
type CityController = {
  ready: Promise<boolean>;
  setInterior: (visit: InteriorVisit | null) => void;
  selectInteriorZone: (id: string) => void;
  performInteriorAction: (id: string, duration?: number) => void;
  setFocus: (f: WorldFocus, street?: boolean) => void;
  setMarkers: (h: WorldHotspot[]) => void;
  setPeers: (peers: MultiplayerPeer[]) => void;
  setAppearance: (appearance: CharacterAppearance) => void;
  overview: () => void;
  characters: () => void;
  people: () => void;
  setMode: (mode: string) => void;
  setMotion: (value: boolean) => void;
  setTime: (minute: number) => void;
  zoom: (multiplier: number) => void;
  rotate: (angle: number) => void;
  startTravel: (sequence: TravelSequence) => boolean;
  skipTravel: () => void;
  setTravelView: (view: "outside" | "cabin" | "seat") => boolean;
  cancelTravel: () => void;
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
  onTransitAction,
  minute,
  travelSequence = null,
  onTravelComplete,
  peers = [],
  onPlayer,
}: {
  focus: WorldFocus;
  shirt: string;
  appearance?: CharacterAppearance;
  hotspots: WorldHotspot[];
  onHotspot: (h: WorldHotspot) => void;
  interior: InteriorVisit | null;
  onExitInterior: () => void;
  onTransitAction?: (id: string) => void;
  minute?: number;
  travelSequence?: TravelSequence | null;
  onTravelComplete?: (id: string) => void;
  peers?: MultiplayerPeer[];
  onPlayer?: (player: MultiplayerPeer) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<CityController | null>(null);
  const callback = useRef(onHotspot);
  callback.current = onHotspot;
  const playerCallback = useRef(onPlayer);
  playerCallback.current = onPlayer;
  const travelCallback = useRef(onTravelComplete);
  travelCallback.current = onTravelComplete;
  const startedTravel = useRef<string | null>(null);
  const [travelPhase, setTravelPhase] = useState<TravelPhase | null>(null);
  const [travelError, setTravelError] = useState("");
  const [cityClock, setCityClock] = useState(660);
  const [sceneTime, setSceneTime] = useState("live");
  const sceneMinute =
    sceneTime === "trip"
      ? (minute ?? cityClock)
      : sceneTime === "day"
        ? 720
        : sceneTime === "golden"
          ? 1110
          : sceneTime === "night"
            ? 1260
            : cityClock;
  const latest = useRef({
    focus,
    shirt,
    appearance,
    peers,
    hotspots,
    interior,
    minute: sceneMinute,
    travelSequence,
  });
  latest.current = {
    focus,
    shirt,
    appearance,
    peers,
    hotspots,
    interior,
    minute: sceneMinute,
    travelSequence,
  };
  const [status, setStatus] = useState("Loading Lisbon’s streets…");
  const [gesture, setGesture] = useState("orbit");
  const [motion, setMotion] = useState(true);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const optionsPanel = useRef<HTMLDivElement>(null);
  const optionsTrigger = useRef<HTMLButtonElement>(null);
  const focusOptionsOnOpen = useRef(false);
  const optionsId = useId();
  const [google, setGoogle] = useState(false);
  const googleVisible = google && !travelSequence;
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
  function startPendingTravel(instance: CityController) {
    void instance.ready
      .then((ready) => {
        if (controller.current !== instance) return;
        const sequence = latest.current.travelSequence;
        if (!sequence || startedTravel.current === sequence.id) return;
        if (!ready) {
          setTravelError(
            "The city geography could not load. Continue to your destination.",
          );
          return;
        }
        try {
          instance.setInterior(null);
          if (
            instance.startTravel({
              ...sequence,
              appearance: latest.current.appearance,
            })
          ) {
            startedTravel.current = sequence.id;
          } else {
            startedTravel.current = null;
            setTravelError(
              "This 3D journey could not start. Continue to your destination.",
            );
          }
        } catch {
          startedTravel.current = null;
          setTravelError(
            "This 3D journey could not start. Continue to your destination.",
          );
        }
      })
      .catch(() => {
        if (controller.current === instance && latest.current.travelSequence)
          setTravelError(
            "This 3D journey could not load. Continue to your destination.",
          );
      });
  }
  useEffect(() => {
    const update = () => {
      setCityClock(cityMinute(new Date()));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    controller.current?.setTime(sceneMinute);
  }, [sceneMinute]);
  useEffect(() => {
    setPerson(null);
    if (googleVisible) return;
    let cancelled = false;
    import("../lib/city-scene.js")
      .then(({ createCity }) => {
        if (cancelled || !host.current) return;
        try {
          controller.current = createCity(host.current, {
            ...latest.current,
            city: CITY,
            onHotspot: (h: WorldHotspot) => {
              if (latest.current.travelSequence) return;
              setPerson(null);
              callback.current(h);
            },
            onStatus: setStatus,
            onStats: setStats,
            onPerson: (local: LocalPerson) => {
              if (latest.current.travelSequence) return;
              setPeer(null);
              setGallery(false);
              setPerson(local);
            },
            onPeer: (player: MultiplayerPeer) => {
              if (latest.current.travelSequence) return;
              setPerson(null);
              setGallery(false);
              if (playerCallback.current) {
                setPeer(null);
                playerCallback.current(player);
              } else setPeer(player);
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
            onTravelPhase: (event: TravelPhase) => {
              if (!cancelled && event.id === latest.current.travelSequence?.id)
                setTravelPhase(event);
            },
            onTravelComplete: (event: { id: string; to: WorldFocus }) => {
              if (!cancelled && event.id === latest.current.travelSequence?.id)
                travelCallback.current?.(event.id);
            },
          });
          controller.current?.setMode(ui.current.gesture);
          controller.current?.setMotion(ui.current.motion);
          if (controller.current) startPendingTravel(controller.current);
        } catch {
          setStatus(
            "3D is unavailable on this device. Trip experiences still work.",
          );
          if (latest.current.travelSequence)
            setTravelError(
              "3D is unavailable on this device. Continue to your destination.",
            );
        }
      })
      .catch(() => {
        setStatus("The city could not load. Try reloading.");
        if (latest.current.travelSequence)
          setTravelError(
            "The 3D journey could not load. Continue to your destination.",
          );
      });
    return () => {
      cancelled = true;
      controller.current?.dispose();
      controller.current = null;
      startedTravel.current = null;
    };
  }, [googleVisible]);
  useEffect(() => {
    setTravelPhase(null);
    setTravelError("");
    if (travelSequence) {
      setGoogle(false);
      setGallery(false);
      setPerson(null);
      setPeer(null);
      if (
        startedTravel.current &&
        startedTravel.current !== travelSequence.id
      ) {
        controller.current?.cancelTravel();
        startedTravel.current = null;
      }
      if (controller.current) startPendingTravel(controller.current);
    } else {
      controller.current?.cancelTravel();
      startedTravel.current = null;
    }
  }, [travelSequence?.id]);
  useEffect(() => {
    setGallery(false);
    setPerson(null);
    setPeer(null);
    if (travelSequence) return;
    controller.current?.setFocus(focus);
    // A journey hub can update its map focus after entering a room. Restore
    // the requested interior after the focus command clears the previous view.
    controller.current?.setInterior(interior);
  }, [focus, interior, travelSequence]);
  useEffect(() => {
    controller.current?.setMarkers(hotspots);
  }, [hotspots]);
  useEffect(() => {
    controller.current?.setPeers(peers);
  }, [peers]);
  useEffect(() => {
    controller.current?.setAppearance(appearance);
  }, [appearance]);
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
  function closeViewOptions() {
    setViewOptionsOpen(false);
    optionsTrigger.current?.focus();
  }
  useEffect(() => {
    if (!viewOptionsOpen) return;
    if (focusOptionsOnOpen.current) {
      focusOptionsOnOpen.current = false;
      optionsPanel.current
        ?.querySelector<HTMLButtonElement>("[data-view-action]:not([disabled])")
        ?.focus();
    }
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !controlsRef.current?.contains(event.target)
      )
        setViewOptionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeViewOptions();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [viewOptionsOpen]);
  useEffect(() => {
    setViewOptionsOpen(false);
  }, [googleVisible, travelSequence?.id, interior?.id]);
  return (
    <>
      <div
        className="world"
        aria-label={
          travelSequence
            ? `Simulated ${travelSequence.mode} journey to ${travelSequence.to.name}.`
            : interior
              ? `${interior.name} original 3D interior. Choose a floating activity icon or a room corner to interact.`
              : "Continuous Lisbon 3D world. Select a floating hotspot icon to explore a place. Drag to rotate, use Pan to move, or scroll to zoom."
        }
      >
        {googleVisible ? (
          <GoogleWorld
            focus={{ ...focus, label: focus.name }}
            hotspots={hotspots}
            onSelect={onHotspot}
            onStatus={setStatus}
          />
        ) : (
          <div ref={host} className="world-canvas" />
        )}
        {status && !travelSequence && (
          <p className="world-loading" role="status">
            {status}
          </p>
        )}
      </div>
      {!googleVisible && !travelSequence && (
        <div
          ref={controlsRef}
          className={`${interior ? "world-controls interior-controls" : "world-controls"} ${controlStyles.controls}`}
          data-inside={Boolean(interior)}
          data-expanded={viewOptionsOpen}
          role="group"
          aria-label="3D camera controls"
        >
          <div className={`gesture-controls ${controlStyles.gestures}`}>
            <button
              type="button"
              aria-label="Rotate"
              aria-pressed={gesture === "orbit"}
              onClick={() => {
                setGesture("orbit");
                controller.current?.setMode("orbit");
              }}
            >
              <Compass size={17} aria-hidden="true" />
              <span>Rotate</span>
            </button>
            <button
              type="button"
              aria-label="Pan"
              aria-pressed={gesture === "pan"}
              onClick={() => {
                setGesture("pan");
                controller.current?.setMode("pan");
              }}
            >
              <Hand size={17} aria-hidden="true" />
              <span>Pan</span>
            </button>
            <button
              type="button"
              aria-label="Walk"
              disabled={!!gallery}
              aria-pressed={gesture === "walk"}
              onClick={() => {
                setGesture("walk");
                controller.current?.setMode("walk");
              }}
            >
              <PersonStanding size={17} aria-hidden="true" />
              <span>Walk</span>
            </button>
          </div>
          <div className={`camera-buttons ${controlStyles.zoom}`}>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => controller.current?.zoom(0.75)}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => controller.current?.zoom(1.3)}
            >
              <Minus size={17} aria-hidden="true" />
            </button>
          </div>
          <button
            ref={optionsTrigger}
            type="button"
            className={controlStyles.optionsTrigger}
            aria-label="View options"
            title="View options"
            aria-expanded={viewOptionsOpen}
            aria-controls={optionsId}
            onClick={() => setViewOptionsOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              if (viewOptionsOpen)
                optionsPanel.current
                  ?.querySelector<HTMLButtonElement>(
                    "[data-view-action]:not([disabled])",
                  )
                  ?.focus();
              else {
                focusOptionsOnOpen.current = true;
                setViewOptionsOpen(true);
              }
            }}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            <span>View options</span>
          </button>
          <div
            ref={optionsPanel}
            id={optionsId}
            className={controlStyles.options}
            hidden={!viewOptionsOpen}
            role="region"
            aria-labelledby={`${optionsId}-heading`}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                closeViewOptions();
              }
            }}
          >
            <header className={controlStyles.heading}>
              <strong id={`${optionsId}-heading`}>View options</strong>
              <button
                type="button"
                aria-label="Close view options"
                onClick={closeViewOptions}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className={controlStyles.actions}>
              <button
                type="button"
                data-view-action
                aria-label="Rotate camera left"
                onClick={() => controller.current?.rotate(-Math.PI / 8)}
              >
                <RotateCcw size={18} aria-hidden="true" /> Rotate left
              </button>
              <button
                type="button"
                data-view-action
                aria-label="Rotate camera right"
                onClick={() => controller.current?.rotate(Math.PI / 8)}
              >
                <RotateCw size={18} aria-hidden="true" /> Rotate right
              </button>
              {!interior && (
                <>
                  <button
                    type="button"
                    data-view-action
                    onClick={() => {
                      setGallery(false);
                      setPerson(null);
                      controller.current?.setFocus(focus, true);
                      closeViewOptions();
                    }}
                  >
                    <PersonStanding size={18} aria-hidden="true" /> Street level
                  </button>
                  <button
                    type="button"
                    data-view-action
                    onClick={() => {
                      setGallery(true);
                      setPerson(null);
                      controller.current?.characters();
                      closeViewOptions();
                    }}
                  >
                    <PersonStanding size={18} aria-hidden="true" /> Characters
                  </button>
                  <button
                    type="button"
                    data-view-action
                    aria-label="Show nearby NPCs"
                    onClick={() => {
                      setGallery(false);
                      setPerson(null);
                      controller.current?.people();
                      closeViewOptions();
                    }}
                  >
                    <Users size={18} aria-hidden="true" /> Locals
                  </button>
                  <button
                    type="button"
                    data-view-action
                    onClick={() => {
                      setGallery(false);
                      setPerson(null);
                      controller.current?.overview();
                      closeViewOptions();
                    }}
                  >
                    <Globe2 size={18} aria-hidden="true" /> Whole region
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              className={controlStyles.motion}
              aria-label={
                motion ? "Pause ambient movement" : "Resume ambient movement"
              }
              onClick={() => {
                setMotion((value) => !value);
                controller.current?.setMotion(!motion);
              }}
            >
              {motion ? (
                <Pause size={18} aria-hidden="true" />
              ) : (
                <Play size={18} aria-hidden="true" />
              )}
              <span>{motion ? "Pause movement" : "Resume movement"}</span>
            </button>
            <label className={controlStyles.time}>
              <span className={controlStyles.timeHeading}>
                <Clock3 size={16} aria-hidden="true" /> Scene time
                <span>
                  {String(Math.floor(sceneMinute / 60)).padStart(2, "0")}:
                  {String(sceneMinute % 60).padStart(2, "0")}
                </span>
              </span>
              <select
                aria-label="Scene time"
                value={sceneTime}
                onChange={(event) => setSceneTime(event.target.value)}
              >
                <option value="live">Live city time</option>
                {minute !== undefined && (
                  <option value="trip">Trip time</option>
                )}
                <option value="day">Daylight preview</option>
                <option value="golden">Golden hour preview</option>
                <option value="night">Night preview</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {interior && !travelSequence && (
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
      {interior && roomError && !travelSequence && (
        <p className="interior-error" role="alert">
          {roomError}
        </p>
      )}
      {gallery && !travelSequence && (
        <div className="character-preview-label">
          CHARACTER PREVIEW · ORIGINAL ROAM MODELS
        </div>
      )}
      {!googleVisible && !gallery && person && !travelSequence && (
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
      {!googleVisible && !gallery && !travelSequence && peer && (
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
        {!interior && !travelSequence && (
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
            {isGoogleMapsConfigured && !travelSequence && (
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
      {travelSequence && (
        <TravelOverlay
          sequence={travelSequence}
          phase={travelPhase?.id === travelSequence.id ? travelPhase : null}
          error={travelError}
          onView={(view) => controller.current?.setTravelView(view) ?? false}
          onSkip={() => {
            const instance = controller.current;
            if (
              !travelError &&
              startedTravel.current === travelSequence.id &&
              instance
            )
              instance.skipTravel();
            else travelCallback.current?.(travelSequence.id);
          }}
        />
      )}
    </>
  );
}
