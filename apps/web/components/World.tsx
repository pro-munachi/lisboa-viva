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
import SceneryPopup, { SceneryNotice } from "./SceneryPopup";
import {
  SceneryActionGate,
  definitiveSceneryFailure,
  mergeSceneryState,
  type SceneryAction,
  type SceneryObject,
} from "../lib/scenery-actions";
import {
  loadScenery,
  performSceneryAction,
  settleSceneryFine,
  type SceneryFine,
  type ScenerySnapshot,
} from "../lib/scenery-client";
import type { WalletSnapshot } from "../lib/wallet-client";
export type SocialSceneEvent = {
  id: string;
  venueId: string;
  kind: string;
  actorId: string;
  targetId?: string;
  viewerId: string;
};
type CityController = {
  ready: Promise<boolean>;
  setInterior: (visit: InteriorVisit | null) => void;
  selectInteriorZone: (id: string) => void;
  performInteriorAction: (id: string, duration?: number) => void;
  playSocialEvent: (event: SocialSceneEvent) => boolean;
  setFocus: (f: WorldFocus, street?: boolean) => Promise<boolean | void> | void;
  setMarkers: (h: WorldHotspot[]) => void;
  setPeers: (peers: MultiplayerPeer[]) => void;
  setAppearance: (appearance: CharacterAppearance) => void;
  overview: () => void;
  playerView: () => boolean;
  characters: () => void;
  people: () => void;
  nearbyScenery: () => SceneryObject[];
  performScenery: (object: SceneryObject, action: string) => Promise<boolean>;
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
  thirdPerson = false,
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
  socialEvent,
  sharedOuting = false,
  onLocationReady,
  onSceneryWallet,
  onSceneryState,
  sceneryWalletRequest = 0,
  walletBalanceCents,
}: {
  focus: WorldFocus;
  shirt: string;
  appearance?: CharacterAppearance;
  thirdPerson?: boolean;
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
  socialEvent?: SocialSceneEvent | null;
  sharedOuting?: boolean;
  onLocationReady?: (selectionId: string, framed: boolean) => void;
  onSceneryWallet?: (wallet: WalletSnapshot) => void;
  onSceneryState?: (snapshot: ScenerySnapshot) => void;
  sceneryWalletRequest?: number;
  walletBalanceCents?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<CityController | null>(null);
  const enteredInterior = useRef<{
    instance: CityController;
    visit: InteriorVisit;
  } | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const [scenerySceneStatus, setScenerySceneStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const locationCallback = useRef(onLocationReady);
  locationCallback.current = onLocationReady;
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
    thirdPerson,
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
    thirdPerson,
    peers,
    hotspots,
    interior,
    minute: sceneMinute,
    travelSequence,
  };
  const [status, setStatus] = useState("Loading Lisbon’s streets…");
  const [gesture, setGesture] = useState(thirdPerson ? "walk" : "orbit");
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
  const [sceneryOpen, setSceneryOpen] = useState(false);
  const [sceneryObject, setSceneryObject] = useState<SceneryObject | null>(
    null,
  );
  const [sceneryItems, setSceneryItems] = useState<SceneryObject[]>([]);
  const [sceneryWalletOpen, setSceneryWalletOpen] = useState(false);
  const [sceneryState, setSceneryState] = useState<ScenerySnapshot | null>(
    null,
  );
  const sceneryStateRef = useRef<ScenerySnapshot | null>(null);
  const [sceneryLoading, setSceneryLoading] = useState(false);
  const [sceneryError, setSceneryError] = useState("");
  const [sceneryBusy, setSceneryBusy] = useState(false);
  const [sceneryNotice, setSceneryNotice] = useState("");
  const [sceneryRetry, setSceneryRetry] = useState(false);
  const [sceneryNoticeWallet, setSceneryNoticeWallet] = useState(false);
  const sceneryGate = useRef(new SceneryActionGate());
  const sceneryRetryAction = useRef<{
    object: SceneryObject;
    action: SceneryAction;
  } | null>(null);
  const sceneryRetryFine = useRef<SceneryFine | null>(null);
  const sceneryActive = useRef(true);
  const sceneryWalletCallback = useRef(onSceneryWallet);
  sceneryWalletCallback.current = onSceneryWallet;
  const sceneryStateCallback = useRef(onSceneryState);
  sceneryStateCallback.current = onSceneryState;

  function receiveScenery(snapshot: ScenerySnapshot) {
    if (!sceneryActive.current) return;
    const next = mergeSceneryState(sceneryStateRef.current, snapshot);
    sceneryStateRef.current = next;
    setSceneryState(next);
    sceneryStateCallback.current?.(next);
  }
  async function refreshScenery() {
    setSceneryLoading(true);
    setSceneryError("");
    try {
      receiveScenery(await loadScenery());
    } catch {
      if (sceneryActive.current)
        setSceneryError(
          "Your city moments could not load. Refresh to try again.",
        );
    } finally {
      if (sceneryActive.current) setSceneryLoading(false);
    }
  }
  useEffect(() => {
    sceneryActive.current = true;
    void refreshScenery();
    return () => {
      sceneryActive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!sceneryNotice || sceneryBusy || sceneryRetry) return;
    const timer = setTimeout(() => setSceneryNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [sceneryNotice, sceneryBusy, sceneryRetry]);
  useEffect(() => {
    setSceneryOpen(false);
  }, [focus, travelSequence?.id, interior?.id, googleVisible]);
  useEffect(() => {
    if (!sceneryWalletRequest) return;
    openSceneryWallet();
  }, [sceneryWalletRequest]);
  function openSceneryWallet() {
    setSceneryWalletOpen(true);
    setSceneryOpen(true);
    setViewOptionsOpen(false);
    setPerson(null);
    setPeer(null);
    void refreshScenery();
  }
  async function doSceneryAction(object: SceneryObject, action: SceneryAction) {
    setSceneryOpen(false);
    const attempt = sceneryGate.current.start(object.id, action.id, () =>
      crypto.randomUUID(),
    );
    if (!attempt) {
      if (!sceneryGate.current.busy) {
        setSceneryNotice(
          "Finish saving your previous city moment before choosing another.",
        );
        setSceneryRetry(true);
      }
      return;
    }
    sceneryRetryAction.current = { object, action };
    sceneryRetryFine.current = null;
    setSceneryBusy(true);
    setSceneryRetry(false);
    setSceneryNoticeWallet(false);
    setSceneryOpen(false);
    setViewOptionsOpen(false);
    setPerson(null);
    setPeer(null);
    setGallery(false);
    setSceneryNotice(
      attempt.arrived
        ? "Saving your city moment…"
        : `Walking over to ${object.name}…`,
    );
    let sent = false;
    try {
      if (!attempt.arrived) {
        const reached = await controller.current?.performScenery(
          object,
          action.id,
        );
        if (!reached || !sceneryActive.current) {
          sceneryGate.current.finish(attempt.requestId);
          sceneryRetryAction.current = null;
          if (sceneryActive.current)
            setSceneryNotice(
              "That spot is not reachable right now. Try a closer object or a different path.",
            );
          return;
        }
        sceneryGate.current.arrive(attempt.requestId);
      }
      sent = true;
      const result = await performSceneryAction({
        requestId: attempt.requestId,
        objectId: object.id,
        kind: object.kind,
        actionId: action.id,
      });
      sceneryGate.current.finish(attempt.requestId);
      sceneryRetryAction.current = null;
      if (!sceneryActive.current) return;
      receiveScenery({
        totalPoints: result.totalPoints,
        fines: result.fine ? [result.fine] : [],
      });
      const fine = result.fine && !result.fine.settled;
      setSceneryNotice(
        `${action.label}${result.points ? ` · +${result.points} XP` : " · Already explored today or daily XP limit reached"}.${fine ? ` A simulated €${(result.fine!.amountCents / 100).toFixed(0)} park fine is in your city wallet.` : ""}`,
      );
      setSceneryNoticeWallet(Boolean(fine));
    } catch (reason) {
      const code =
        reason instanceof Error ? reason.message : "scenery_unavailable";
      const ambiguous = sent && !definitiveSceneryFailure(code);
      sceneryGate.current.finish(attempt.requestId, ambiguous);
      if (!ambiguous && code !== "scenery_cooldown")
        sceneryRetryAction.current = null;
      if (!sceneryActive.current) return;
      setSceneryRetry(ambiguous || code === "scenery_cooldown");
      setSceneryNotice(
        code === "scenery_cooldown"
          ? "Give your character 10 seconds between city moments, then try again."
          : code === "scenery_fines_full"
            ? "Settle a pending game fine before choosing another cheeky action."
            : !sent
              ? "Your character could not reach that spot. Try a closer object."
              : ambiguous
                ? "Your city moment may still be saving. Try again to check it without repeating the reward or fine."
                : "This city moment could not be saved. Refresh and try again.",
      );
      setSceneryNoticeWallet(code === "scenery_fines_full");
    } finally {
      if (sceneryActive.current) setSceneryBusy(false);
    }
  }
  async function paySceneryFine(fine: SceneryFine) {
    if (!sceneryGate.current.lockSettlement()) return;
    sceneryRetryFine.current = fine;
    setSceneryBusy(true);
    setSceneryRetry(false);
    setSceneryOpen(false);
    setSceneryNoticeWallet(false);
    setSceneryNotice("Settling your simulated park fine…");
    try {
      const result = await settleSceneryFine(fine.id);
      sceneryRetryFine.current = null;
      if (!sceneryActive.current) return;
      receiveScenery(result);
      sceneryWalletCallback.current?.(result.wallet);
      setSceneryNotice(
        `Simulated €${(fine.amountCents / 100).toFixed(0)} fine settled. Your game wallet is updated.`,
      );
      setSceneryNoticeWallet(true);
    } catch (reason) {
      if (!sceneryActive.current) return;
      const code =
        reason instanceof Error ? reason.message : "scenery_unavailable";
      const retry = ![
        "insufficient_funds",
        "scenery_fine_unavailable",
        "invalid_scenery_action",
        "wallet_conflict",
        "session_expired",
        "forbidden",
      ].includes(code);
      if (!retry) sceneryRetryFine.current = null;
      setSceneryRetry(retry);
      setSceneryNoticeWallet(true);
      setSceneryNotice(
        code === "insufficient_funds"
          ? "Your game euro wallet does not have enough to settle this fine yet."
          : retry
            ? "The payment may still be saving. Try again to check this same fine; it will only be paid once."
            : "That fine could not be settled. Refresh your city wallet to check its status.",
      );
    } finally {
      sceneryGate.current.unlockSettlement();
      if (sceneryActive.current) setSceneryBusy(false);
    }
  }
  function retryScenery() {
    if (sceneryRetryFine.current) void paySceneryFine(sceneryRetryFine.current);
    else if (sceneryRetryAction.current)
      void doSceneryAction(
        sceneryRetryAction.current.object,
        sceneryRetryAction.current.action,
      );
  }

  useEffect(() => {
    if (!socialEvent || travelSequence || socialEvent.venueId !== interior?.id)
      return;
    controller.current?.playSocialEvent(socialEvent);
  }, [socialEvent?.id, interior?.id, travelSequence?.id, status]);
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
    setScenerySceneStatus("loading");
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
            onScenery: (object: SceneryObject) => {
              if (
                latest.current.travelSequence ||
                latest.current.interior ||
                !Number.isFinite(object.x) ||
                !Number.isFinite(object.z)
              )
                return;
              setSceneryWalletOpen(false);
              setSceneryObject(object);
              setSceneryOpen(true);
              setPerson(null);
              setPeer(null);
              setGallery(false);
              setViewOptionsOpen(false);
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
          setSceneUnavailable(false);
          const instance = controller.current;
          void instance.ready
            .then((ready) => {
              if (cancelled || controller.current !== instance) return;
              setScenerySceneStatus(ready ? "ready" : "unavailable");
            })
            .catch(() => {
              if (!cancelled && controller.current === instance)
                setScenerySceneStatus("unavailable");
            });
          controller.current?.setMode(ui.current.gesture);
          controller.current?.setMotion(ui.current.motion);
          setSceneVersion((version) => version + 1);
          if (controller.current) startPendingTravel(controller.current);
        } catch {
          setSceneUnavailable(true);
          setScenerySceneStatus("unavailable");
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
        if (cancelled) return;
        setSceneUnavailable(true);
        setScenerySceneStatus("unavailable");
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
    if (googleVisible) {
      if (focus.selectionId)
        locationCallback.current?.(focus.selectionId, true);
      return;
    }
    const instance = controller.current;
    if (!instance) {
      if (sceneUnavailable && focus.selectionId)
        locationCallback.current?.(focus.selectionId, true);
      return;
    }
    let active = true;
    void instance.ready
      .then(async (ready) => {
        if (!active || controller.current !== instance) return;
        if (interior) {
          if (
            ready &&
            (enteredInterior.current?.instance !== instance ||
              enteredInterior.current.visit !== interior)
          ) {
            instance.setInterior(interior);
            enteredInterior.current = { instance, visit: interior };
            const initialAction = INTERIOR_ACTIVITIES[interior.kind].find(
              (activity) => activity.id === interior.initialZoneId,
            );
            if (initialAction)
              instance.performInteriorAction(
                initialAction.id,
                initialAction.durationMs,
              );
          }
          return;
        }
        enteredInterior.current = null;
        const framed = ready ? await instance.setFocus(focus) : undefined;
        if (!active || controller.current !== instance) return;
        if (focus.selectionId)
          locationCallback.current?.(focus.selectionId, framed !== false);
      })
      .catch(() => {
        if (active && focus.selectionId)
          locationCallback.current?.(focus.selectionId, true);
      });
    return () => {
      active = false;
    };
  }, [
    focus,
    interior,
    travelSequence,
    sceneVersion,
    googleVisible,
    sceneUnavailable,
  ]);
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
    setSelectedZone(
      interior
        ? INTERIOR_ACTIVITIES[interior.kind].find(
            (zone) => zone.id === interior.initialZoneId,
          )?.id || INTERIOR_ACTIVITIES[interior.kind][0].id
        : null,
    );
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
                    data-scenery-browser
                    disabled={scenerySceneStatus !== "ready"}
                    aria-busy={scenerySceneStatus === "loading"}
                    onClick={() => {
                      if (scenerySceneStatus !== "ready" || !controller.current)
                        return;
                      setSceneryItems(controller.current.nearbyScenery());
                      setSceneryObject(null);
                      setSceneryWalletOpen(false);
                      setSceneryOpen(true);
                      setGallery(false);
                      setPerson(null);
                      closeViewOptions();
                    }}
                  >
                    <span aria-hidden="true">🌿</span>{" "}
                    {scenerySceneStatus === "ready"
                      ? "Things around you"
                      : scenerySceneStatus === "loading"
                        ? "Loading city objects…"
                        : "City objects unavailable"}
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
      {sceneryOpen &&
        !travelSequence &&
        (sceneryWalletOpen || (!googleVisible && !interior)) && (
          <SceneryPopup
            object={sceneryWalletOpen ? null : sceneryObject}
            items={sceneryItems}
            walletView={sceneryWalletOpen}
            snapshot={sceneryState}
            balanceCents={walletBalanceCents}
            busy={sceneryBusy}
            loading={sceneryLoading}
            error={sceneryError}
            onPick={setSceneryObject}
            onAction={(object, action) => void doSceneryAction(object, action)}
            onSettle={(fine) => void paySceneryFine(fine)}
            onRefresh={() => void refreshScenery()}
            onWallet={openSceneryWallet}
            onClose={() => setSceneryOpen(false)}
          />
        )}
      {sceneryNotice && !travelSequence && (
        <SceneryNotice
          message={sceneryNotice}
          busy={sceneryBusy}
          onRetry={sceneryRetry ? retryScenery : undefined}
          onWallet={sceneryNoticeWallet ? openSceneryWallet : undefined}
          onClose={() => setSceneryNotice("")}
        />
      )}
      {interior && !travelSequence && !sharedOuting && (
        <InteriorPanel
          key={`${interior.id}:${interior.initialZoneId || "default"}`}
          initiallyCompact={Boolean(interior.initialZoneId)}
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
