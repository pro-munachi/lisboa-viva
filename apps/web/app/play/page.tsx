"use client";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plane,
  Ticket,
  Armchair,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Coffee,
  Compass,
  Download,
  Hammer,
  Heart,
  Home,
  Map,
  MapPin,
  MessageCircle,
  Search,
  Eye,
  EyeOff,
  Moon,
  Music,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Smartphone,
  UserRound,
  Users,
  Wallet,
  Waves,
  Zap,
} from "lucide-react";
import World from "../../components/World";
import AuthBoundary from "../../components/AuthBoundary";
import Phone, { type PhoneApp } from "../../components/Phone";
import ProfileMenu from "../../components/ProfileMenu";
import ActivitiesPanel from "../../components/ActivitiesPanel";
import ActivityOuting from "../../components/ActivityOuting";
import SimulationWallet from "../../components/SimulationWallet";
import {
  getActivity,
  type ActivityRoom,
  type ActivityEvent,
  type ActivityWallet,
} from "../../lib/activities";
import type { SocialSceneEvent } from "../../components/World";
import { useProfileActions } from "../../components/ProfileActions";
import type { AuthUser } from "../../lib/auth";
import { accountStorageKeys } from "../../lib/account-storage";
import { TRAVELLER_COLOURS } from "../../lib/traveller-colours";
import MultiplayerDock from "../../components/MultiplayerDock";
import { interiorForHotspot, type InteriorVisit } from "../../lib/interiors";
import Dialog from "../../components/Dialog";
import JourneyPanel from "../../components/JourneyPanel";
import TripCalendar from "../../components/TripCalendar";
import TripRecommendations from "../../components/TripRecommendations";
import ChatPanel from "../../components/ChatPanel";
import PlayerMenu from "../../components/PlayerMenu";
import NearbyPlayers from "../../components/NearbyPlayers";
import { playerPlace } from "../../lib/player-places";
import type {
  PresenceLocation,
  MultiplayerPeer,
} from "../../lib/presence-client";
import type { ChatPeer } from "../../lib/direct-client";
import { ChatRequestError, type ChatDraft } from "../../lib/chat-client";
import { chatPlaceFor } from "../../lib/chat-rooms";
import {
  TravelCompletionGate,
  arrivalTravel,
  commandTravel,
  tripFocus,
  type TravelSequence,
} from "../../lib/travel-sequence";
import {
  JOURNEY_HUBS,
  JOURNEY_PERSONAS,
  type Arrival,
  type HubId,
  type JourneyAction,
  type Persona,
} from "../../lib/journey";
import { searchMapLocations } from "../../lib/map-locations";
import { resolveGoogleMapsLink } from "../../lib/map-link";
import { GEOGRAPHIC_HOTSPOTS } from "../../lib/geography";
import {
  VENUES,
  VENUE_CATEGORY_LABELS,
  type VenueCategory,
} from "../../lib/venues";
import {
  focusFor,
  placeFocus,
  fromGeographic,
  fromVenue,
  mapLinkPin,
  restorePins,
  areaPlace,
  type WorldFocus,
  type WorldHotspot,
} from "../../lib/world-state";
import {
  places,
  scenarios,
  routeFor,
  stageAt,
  transport,
  REVIEWED,
  type PlaceId,
  type Style,
  type Mode,
  type Choice,
} from "../../lib/content";
import {
  apply,
  availableScenarios,
  blocked,
  challenges,
  euro,
  itinerary,
  memories,
  newTrip,
  previewJourney,
  restore,
  serialize,
  time,
  type Trip,
  type Setup,
  type Command,
  type Interest,
  type Accommodation,
} from "../../lib/engine";
import { useMultiplayer } from "../../lib/multiplayer";
import {
  loadWallet,
  spendWallet,
  type WalletSnapshot,
} from "../../lib/wallet-client";
import {
  areaTransport,
  distanceMetres,
  WALKABLE_METRES,
} from "../../lib/area-transport";
const colors = TRAVELLER_COLOURS.map((colour) => colour.value);
const interests: { id: Interest; name: string }[] = [
  { id: "food", name: "Food & cafés" },
  { id: "culture", name: "Art & culture" },
  { id: "nature", name: "Nature & views" },
  { id: "nightlife", name: "Music & nightlife" },
  { id: "wellness", name: "Wellness" },
  { id: "community", name: "Local life" },
];
const accommodations: { id: Accommodation; name: string; detail: string }[] = [
  { id: "hotel", name: "Hotel", detail: "A comfortable landing" },
  { id: "hostel", name: "Hostel", detail: "A social starting point" },
  { id: "apartment", name: "Apartment", detail: "Your own everyday rhythm" },
  {
    id: "coliving",
    name: "Coliving",
    detail: "A shared base for a longer stay",
  },
];
const styles: Style[] = ["Budget explorer", "Foodie", "Culture seeker"];
const initial: Setup = {
  days: 3,
  budget: 300,
  style: "Culture seeker",
  base: "Graça",
  shirt: colors[0],
  persona: "tourist",
  arrival: "airport",
  interests: ["culture", "food"],
  accommodation: "apartment",
};
type Panel =
  | "hotspot"
  | "map-search"
  | "setup"
  | "travel"
  | "journey"
  | "journal"
  | "pocket"
  | "recap"
  | "finish"
  | "new"
  | "clear"
  | "area-transport"
  | null;
type AreaEntry = {
  focus: WorldFocus;
  visit: InteriorVisit;
  hubId?: HubId;
  message?: string;
};
const iconFor = (id: PlaceId) =>
  ({
    home: Home,
    exchange: Hammer,
    cafe: Coffee,
    viewpoint: Camera,
    riverside: Waves,
    music: Music,
    cais: Waves,
    benfica: Home,
    sintra: Camera,
  })[id];
const transitHotspots = () =>
  Object.values(JOURNEY_HUBS).map((hub) => ({
    id: `transit-${hub.id}`,
    name: hub.name,
    lat: hub.lat,
    lng: hub.lng,
    area: "Lisbon transport",
    category: "transport" as const,
    description: hub.description,
    mapsUrl: hub.mapsUrl,
    sourceUrl: hub.sourceUrl,
  }));
const transitHubFor = (hotspot: WorldHotspot | null) =>
  Object.values(JOURNEY_HUBS).find(
    (hub) => hotspot?.id === `transit-${hub.id}`,
  );
function RoamExperience({ user }: { user: AuthUser }) {
  const storage = accountStorageKeys(user.id);
  const {
    peers,
    setLocation,
    appearance,
    location,
    enabled,
    status: presenceStatus,
  } = useMultiplayer();
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [cityNow, setCityNow] = useState<Date | null>(null);
  const phoneTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setCityNow(new Date());
    const timer = setInterval(() => setCityNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [visitedLocation, setVisitedLocation] = useState<PresenceLocation>({
    latitude:
      user.userType === "local" ? placeFocus.home.lat : placeFocus.cais.lat,
    longitude:
      user.userType === "local" ? placeFocus.home.lng : placeFocus.cais.lng,
    area:
      user.userType === "local" ? placeFocus.home.name : placeFocus.cais.name,
  });

  const [mapFocus, setMapFocus] = useState<WorldFocus>(
    user.userType === "local" ? focusFor("home", "Graça") : placeFocus.cais,
  );
  const [mapHotspot, setMapHotspot] = useState<WorldHotspot | null>(null);
  const [pins, setPins] = useState<WorldHotspot[]>([]);
  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState<
    VenueCategory | "all" | "landmarks"
  >("all");
  const [locationEntry, setLocationEntry] = useState<"search" | "link">(
    "search",
  );
  const [pinUrl, setPinUrl] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinName, setPinName] = useState("");
  const [clean, setClean] = useState(false);
  const [phoneStart, setPhoneStart] = useState<
    "messages" | "activities" | undefined
  >();
  const [chatDrafts, setChatDrafts] = useState<Record<string, ChatDraft>>({});
  const rememberChatDraft = useCallback((key: string, draft: ChatDraft) => {
    setChatDrafts((all) => ({ ...all, [key]: draft }));
  }, []);
  const [selectedPlayer, setSelectedPlayer] = useState<ChatPeer | null>(null);
  const [selectedDirectoryPeer, setSelectedDirectoryPeer] =
    useState<MultiplayerPeer | null>(null);
  const [chatPeer, setChatPeer] = useState<ChatPeer | null>(null);
  const [openPeerRequest, setOpenPeerRequest] = useState(0);
  const chatTrigger = useRef<HTMLButtonElement>(null);
  const [interior, setInterior] = useState<InteriorVisit | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [activityRoom, setActivityRoom] = useState<ActivityRoom | null>(null);
  const [activityWallet, setActivityWallet] = useState<ActivityWallet | null>(
    null,
  );
  const [socialEvent, setSocialEvent] = useState<SocialSceneEvent | null>(null);
  const activityEventsSeen = useRef<{
    roomId: string;
    ids: Set<string>;
  } | null>(null);
  const selectActivity = useCallback((id: string | null) => {
    setActivityId(id);
    setActivityRoom((current) => (current?.id === id ? current : null));
    setSocialEvent(null);
    if (!id || activityEventsSeen.current?.roomId !== id)
      activityEventsSeen.current = null;
  }, []);
  const receiveActivityAction = useCallback(
    (event: ActivityEvent, venueId?: string) => {
      const room = activityEventsSeen.current;
      if (room) room.ids.add(event.id);
      if (!venueId) return;
      setSocialEvent({
        id: event.id,
        venueId,
        kind: event.kind,
        actorId: event.actor.id,
        targetId: event.target?.id,
        viewerId: user.id,
      });
    },
    [user.id],
  );
  const receiveActivityRoom = useCallback(
    (room: ActivityRoom | null) => {
      setActivityRoom(room);
      if (!room) return;
      const previous = activityEventsSeen.current;
      if (previous?.roomId === room.id) {
        for (const event of room.events) {
          if (
            !previous.ids.has(event.id) &&
            Date.now() - Date.parse(event.createdAt) < 15_000
          )
            receiveActivityAction(event, room.venueId);
          previous.ids.add(event.id);
        }
        // The server retains thirty recent events. Keep the deduplication set bounded too.
        if (previous.ids.size > 150)
          previous.ids = new Set(room.events.map((event) => event.id));
      } else
        activityEventsSeen.current = {
          roomId: room.id,
          ids: new Set(room.events.map((event) => event.id)),
        };
    },
    [receiveActivityAction],
  );
  useEffect(() => {
    if (!activityId || phoneOpen) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function updateRoom() {
      try {
        const result = await getActivity(
          activityId!,
          controller.signal,
          user.id,
        );
        if (controller.signal.aborted) return;
        receiveActivityRoom(result.activity);
        setActivityWallet(result.wallet);
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (
          reason instanceof ChatRequestError &&
          [403, 404, 410].includes(reason.status)
        ) {
          selectActivity(null);
          return;
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(updateRoom, 3_000);
    }
    void updateRoom();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activityId, phoneOpen, user.id, receiveActivityRoom, selectActivity]);
  const beforeInterior = useRef(false);
  const worldHotspots = useMemo<WorldHotspot[]>(
    () => [
      ...GEOGRAPHIC_HOTSPOTS.map(fromGeographic),
      ...transitHotspots(),
      ...VENUES.map(fromVenue),
      ...pins,
      ...(mapHotspot?.mapLocation ? [mapHotspot] : []),
    ],
    [pins, mapHotspot?.mapLocation ? mapHotspot.id : null],
  );
  const matches = useMemo(() => {
    const normalize = (s: string) =>
      s
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const words = normalize(search).trim().split(/\s+/).filter(Boolean);
    const distance = (h: WorldHotspot) =>
      Math.hypot((h.lng - mapFocus.lng) * 0.78, h.lat - mapFocus.lat);
    const found = worldHotspots.filter(
      (h) =>
        (venueFilter === "all" ||
          (venueFilter === "landmarks"
            ? !h.mapVenue && !h.mapLocation
            : h.category === venueFilter)) &&
        words.every((word) =>
          normalize(`${h.name} ${h.area || ""} ${h.address || ""}`).includes(
            word,
          ),
        ),
    );
    if (venueFilter === "all") {
      for (const h of searchMapLocations(search, 60, [
        mapFocus.lng,
        mapFocus.lat,
      ])) {
        if (!found.some((v) => v.id === h.id))
          found.push({
            ...h,
            mapLocation: true,
            area: areaPlace[h.name] ? h.name : h.area,
          });
      }
    }
    const exact = (h: WorldHotspot) =>
      normalize(h.name) === normalize(search).trim()
        ? 0
        : normalize(h.name).includes(normalize(search).trim())
          ? 1
          : 2;
    return found.sort(
      (a, b) => exact(a) - exact(b) || distance(a) - distance(b),
    );
  }, [worldHotspots, venueFilter, search, mapFocus]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelSequence, setTravelSequence] = useState<TravelSequence | null>(
    null,
  );
  const [areaEntry, setAreaEntry] = useState<AreaEntry | null>(null);
  const pendingAreaTravel = useRef<{
    sequence: TravelSequence;
    entry: AreaEntry;
  } | null>(null);
  const [areaTravelBusy, setAreaTravelBusy] = useState(false);
  const travelGate = useRef(new TravelCompletionGate());
  const tripRef = useRef<Trip | null>(null);
  tripRef.current = trip;
  const [loaded, setLoaded] = useState(false);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const walletRef = useRef<WalletSnapshot | null>(null);
  const walletBusy = useRef(false);
  const pendingWalletAttempt = useRef<{ key: string; id: string } | null>(null);
  const commandBusy = useRef(false);
  const [walletError, setWalletError] = useState(false);
  const [homeError, setHomeError] = useState(false);
  const [archive, setArchive] = useState<Trip[]>([]);
  const [setup, setSetup] = useState<Setup>({
    ...initial,
    shirt: user.appearance.topColor,
  });
  const travellerAppearance = appearance;
  const [calendarValid, setCalendarValid] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [destination, setDestination] = useState<PlaceId | null>(null);
  const [mode, setMode] = useState<Mode>("walk");
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<Choice | null>(null);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    let active = true;
    void loadWallet()
      .then((snapshot) => {
        if (!active) return;
        walletRef.current = snapshot;
        setWallet(snapshot);
        setWalletError(false);
      })
      .catch(() => {
        if (active) setWalletError(true);
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storage.pins);
      if (raw) setPins(restorePins(raw));
    } catch {}
  }, []);
  useEffect(() => {
    if (!trip || travelSequence) return;
    const focus = tripFocus(trip);
    setMapFocus(focus);
    if (!interior)
      setVisitedLocation({
        latitude: focus.lat,
        longitude: focus.lng,
        area: focus.presenceArea || focus.name,
      });
  }, [trip?.place, trip?.setup.base, trip?.journey.hub]);
  useEffect(() => {
    if (travelGate.current.pending && !travelGate.current.matches(trip))
      cancelTravelPreview();
  }, [trip?.id, trip?.revision]);
  useEffect(() => () => travelGate.current.cancel(), [user.id]);
  function cancelTravelPreview() {
    travelGate.current.cancel();
    pendingAreaTravel.current = null;
    setTravelSequence(null);
  }
  function startTravelPreview(
    sequence: TravelSequence,
    next: Trip,
    afterPanel: "journey" | "recap" | null,
    outcome: string,
  ) {
    travelGate.current.start({
      sequence,
      tripId: next.id,
      revision: next.revision,
      panel: afterPanel,
      outcome,
    });
    setTravelSequence(sequence);
    setPhoneOpen(false);
    setActivitiesOpen(false);
    setPanel(null);
    setNearbyOpen(false);
    setSelectedPlayer(null);
    setMapHotspot(null);
    setNotice("");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    leaveRoom();
    setClean(false);
  }
  function completeTravelPreview(id: string) {
    const areaTravel = pendingAreaTravel.current;
    if (areaTravel?.sequence.id === id) {
      pendingAreaTravel.current = null;
      setTravelSequence(null);
      void finishAreaEntry(areaTravel.entry);
      return;
    }
    const completion = travelGate.current.take(id, tripRef.current);
    if (!completion) return;
    setTravelSequence(null);
    setMapFocus(completion.sequence.to);
    setVisitedLocation({
      latitude: completion.sequence.to.lat,
      longitude: completion.sequence.to.lng,
      area: completion.sequence.to.presenceArea || completion.sequence.to.name,
    });
    setPanel(completion.panel);
    notify(completion.outcome);
  }
  useEffect(() => {
    if (travelSequence) return;
    setLocation(visitedLocation);
  }, [visitedLocation, travelSequence?.id, setLocation]);
  function pickHotspot(h: WorldHotspot) {
    if (travelGate.current.pending) return;
    if (interior) leaveRoom();
    setMapHotspot(h);
    setMapFocus({ ...h, range: 140 });
    setPanel("hotspot");
  }
  function enterRoom(visit: InteriorVisit) {
    const place = playerPlace(visit.id);
    if (place?.kind)
      setVisitedLocation({
        latitude: place.lat,
        longitude: place.lng,
        area: place.area,
        placeId: place.id,
      });
    if (!interior) beforeInterior.current = clean;
    setInterior(visit);
    setClean(true);
    setPanel(null);
  }
  async function finishAreaEntry(entry: AreaEntry) {
    if (entry.hubId) {
      const currentTrip = tripRef.current;
      if (
        currentTrip?.journey.hub !== entry.hubId &&
        !(await command({
          kind: "journey",
          action: "visit-hub",
          hub: entry.hubId,
        }))
      )
        return;
    }
    setMapFocus(entry.focus);
    setVisitedLocation({
      latitude: entry.focus.lat,
      longitude: entry.focus.lng,
      area: entry.focus.presenceArea || entry.focus.name,
    });
    enterRoom(entry.visit);
    if (entry.message) notify(entry.message);
  }
  function requestAreaEntry(entry: AreaEntry) {
    if (travelSequence || areaTravelBusy || walletBusy.current) return;
    if (
      entry.hubId &&
      tripRef.current &&
      tripRef.current.journey.hub !== entry.hubId &&
      previewJourney(tripRef.current, { action: "visit-hub", hub: entry.hubId })
        .reason
    ) {
      notify("Finish your current journey before visiting another hub.");
      return;
    }
    const metres = distanceMetres(
      { lat: visitedLocation.latitude, lng: visitedLocation.longitude },
      entry.focus,
    );
    if (metres <= WALKABLE_METRES) {
      void finishAreaEntry(entry);
      return;
    }
    setAreaEntry(entry);
    setPanel("area-transport");
  }
  async function takeAreaTransport(option: (typeof areaTransport)[number]) {
    if (!areaEntry || areaTravelBusy || travelSequence) return;
    setAreaTravelBusy(true);
    try {
      const charged = await chargeWallet(
        option.costCents,
        "travel",
        `${option.label} to ${areaEntry.focus.name}`,
        JSON.stringify({
          kind: "area-travel",
          from: [visitedLocation.latitude, visitedLocation.longitude],
          to: [areaEntry.focus.lat, areaEntry.focus.lng],
          mode: option.mode,
        }),
      );
      if (!charged) return;
      const sequence: TravelSequence = {
        id: crypto.randomUUID(),
        mode: option.mode,
        from: {
          lat: visitedLocation.latitude,
          lng: visitedLocation.longitude,
          name: visitedLocation.area,
        },
        to: areaEntry.focus,
        appearance: travellerAppearance,
      };
      pendingAreaTravel.current = { sequence, entry: areaEntry };
      setAreaEntry(null);
      setPanel(null);
      setTravelSequence(sequence);
      setPhoneOpen(false);
      setActivitiesOpen(false);
      setNearbyOpen(false);
      leaveRoom();
      setClean(false);
    } finally {
      setAreaTravelBusy(false);
    }
  }
  function leaveRoom() {
    setSocialEvent(null);
    setInterior(null);
    setVisitedLocation(({ placeId: _placeId, ...location }) => location);
    setClean(beforeInterior.current);
  }
  function enterHome() {
    const focus = focusFor("home", trip?.setup.base || setup.base);
    requestAreaEntry({
      focus,
      visit: {
        id: "home",
        kind: "home",
        name: `Your ${trip?.setup.accommodation || setup.accommodation || "apartment"} · ${trip?.setup.base || setup.base}`,
      },
    });
  }
  function enterTransitHub(id: HubId) {
    const hub = JOURNEY_HUBS[id];
    requestAreaEntry({
      focus: { ...hub, range: 140 },
      hubId: id,
      visit: {
        id: `transit-${id}`,
        kind: hub.kind,
        name: hub.name,
        sourceUrl: hub.sourceUrl,
      },
    });
  }
  function visitTransitHub(id: HubId) {
    enterTransitHub(id);
  }
  async function addPin() {
    if (pinBusy) return;
    setPinError("");
    setPinBusy(true);
    try {
      const resolved = await resolveGoogleMapsLink(pinUrl);
      const pin = mapLinkPin(resolved.mapsUrl!, pinName);
      if (!pin)
        throw new Error("Choose a location inside the Lisbon–Sintra map.");
      const next = [pin, ...pins.filter((p) => p.id !== pin.id)].slice(0, 16);
      setPins(next);
      try {
        localStorage.setItem(storage.pins, JSON.stringify(next));
      } catch {
        notify("This pin is available now but could not be saved.");
      }
      setPinUrl("");
      setPinName("");
      pickHotspot(pin);
    } catch (error) {
      setPinError(
        error instanceof Error
          ? error.message
          : "The map link could not be opened. Try again.",
      );
    } finally {
      setPinBusy(false);
    }
  }
  function route(mode: Mode) {
    return trip && destination
      ? routeFor(trip.place, destination, mode)
      : transport[mode];
  }
  function routeReason(mode: Mode) {
    if (trip?.journey.phase === "arriving")
      return "Continue into the city from your arrival hub first.";
    if (trip?.journey.ticket)
      return "Board your ready ticket before continuing.";
    if (trip && destination === trip.place)
      return "You are already in this chapter.";
    if (
      mode === "walk" &&
      trip &&
      destination &&
      distanceMetres(
        { lat: visitedLocation.latitude, lng: visitedLocation.longitude },
        focusFor(destination, trip.setup.base),
      ) > WALKABLE_METRES
    )
      return "This area is too far to walk. Choose paid transport.";
    const r = route(mode);
    return !r
      ? "This mode does not serve this trip"
      : trip
        ? blocked(trip, r)
        : null;
  }
  function notify(text: string) {
    setNotice(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 6500);
  }
  useEffect(() => {
    let active = true;
    async function loadEntry() {
      await Promise.resolve();
      if (!active) return;
      let saved: Trip | null = null;
      let savedArchive: Trip[] = [];
      let canCreate = true;
      try {
        const raw = localStorage.getItem(storage.trips);
        if (raw) {
          const runs = JSON.parse(raw);
          if (!Array.isArray(runs) || runs.length > 5) throw new Error();
          const restored = runs.map((r) =>
            typeof r === "string" ? restore(r) : null,
          );
          if (restored.some((t) => !t)) throw new Error();
          saved = restored[0] || null;
          savedArchive = restored.slice(1) as Trip[];
        }
      } catch {
        setNotice(
          "Your saved trip could not be read. Start a fresh trip; the old save stays untouched until you begin.",
        );
        setStorageError(true);
        canCreate = false;
      }
      let homeDistrict: Setup["base"] = "Graça";
      if (user.userType === "local") {
        try {
          const response = await fetch("/api/player/home", {
            cache: "no-store",
          });
          if (response.ok) {
            const home = (await response.json()) as { district?: string };
            if (
              home.district === "Graça" ||
              home.district === "Baixa" ||
              home.district === "Alfama"
            ) {
              homeDistrict = home.district;
            } else {
              throw new Error("invalid_home");
            }
          } else {
            throw new Error("home_unavailable");
          }
        } catch {
          canCreate = false;
          if (active) setHomeError(true);
        }
      }
      if (!active) return;
      if (saved) {
        tripRef.current = saved;
        setTrip(saved);
        setArchive(savedArchive);
      }
      if (user.userType === "local") {
        setSetup((value) => ({
          ...value,
          base: homeDistrict,
          arrival: "home",
        }));
        if (!saved) {
          const homeFocus = focusFor("home", homeDistrict);
          setMapFocus(homeFocus);
          setVisitedLocation({
            latitude: homeFocus.lat,
            longitude: homeFocus.lng,
            area: homeDistrict,
          });
        }
      }
      const introKey = `roam.signup-intro.${user.id}`;
      let freshSignup = false;
      try {
        freshSignup = sessionStorage.getItem(introKey) === user.userType;
      } catch {}
      if (!saved && canCreate && (user.userType === "local" || freshSignup)) {
        try {
          const next = newTrip(
            {
              ...initial,
              shirt: user.appearance.topColor,
              base: homeDistrict,
              arrival: user.userType === "local" ? "home" : "airport",
            },
            crypto.randomUUID(),
          );
          try {
            localStorage.setItem(
              storage.trips,
              JSON.stringify([serialize(next)]),
            );
          } catch {
            setStorageError(true);
          }
          tripRef.current = next;
          setTrip(next);
          if (freshSignup && user.userType === "tourist") {
            setMapFocus(tripFocus(next));
            const sequence = arrivalTravel(next);
            if (sequence)
              startTravelPreview(
                sequence,
                next,
                "journey",
                "Welcome to Lisbon. Choose your airport ride.",
              );
          }
          if (freshSignup && user.userType === "local")
            setNotice(
              `Welcome home, @${user.handle}. Explore from your neighbourhood.`,
            );
        } catch {
          setNotice("Your new chapter could not start. Try the journey setup.");
        }
      }
      if (freshSignup) {
        try {
          sessionStorage.removeItem(introKey);
        } catch {}
      }
      setLoaded(true);
    }
    void loadEntry();
    return () => {
      active = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!loaded || !trip) return;
    try {
      localStorage.setItem(
        storage.trips,
        JSON.stringify([trip, ...archive].slice(0, 5).map(serialize)),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [trip, archive, loaded]);
  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if (e.key !== storage.trips) return;
      cancelTravelPreview();
      try {
        const runs = e.newValue ? JSON.parse(e.newValue) : [];
        const current = runs[0] ? restore(runs[0]) : null;
        if (runs[0] && !current) return;
        setTrip(current);
        setArchive(
          runs
            .slice(1)
            .map((r: string) => restore(r))
            .filter(Boolean),
        );
        setPanel(null);
        setPending(null);
        setSelected("");
        setNotice("Your trip was updated in another tab.");
      } catch {
        setNotice("Another tab changed the save. Reload before continuing.");
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  async function chargeWallet(
    amountCents: number,
    purpose: "travel" | "activity" | "ticket",
    description: string,
    attemptKey: string,
  ): Promise<boolean> {
    if (walletBusy.current) return false;
    if (
      pendingWalletAttempt.current &&
      pendingWalletAttempt.current.key !== attemptKey
    ) {
      notify(
        "Retry your last payment choice before starting another paid action.",
      );
      return false;
    }
    if (!walletRef.current) {
      notify("Your euro wallet is unavailable. Try again before spending.");
      return false;
    }
    if (walletRef.current.balanceCents < amountCents) {
      notify("Your euro wallet does not have enough for this choice.");
      return false;
    }
    walletBusy.current = true;
    const transactionId =
      pendingWalletAttempt.current?.id || crypto.randomUUID();
    pendingWalletAttempt.current = { key: attemptKey, id: transactionId };
    try {
      const snapshot = await spendWallet({
        transactionId,
        amountCents,
        purpose,
        description: [...description].slice(0, 100).join(""),
      });
      walletRef.current = snapshot;
      setWallet(snapshot);
      setWalletError(false);
      pendingWalletAttempt.current = null;
      return true;
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "wallet_unavailable";
      if (
        code === "insufficient_funds" ||
        code === "invalid_wallet_spend" ||
        code === "wallet_conflict"
      )
        pendingWalletAttempt.current = null;
      notify(
        code === "insufficient_funds"
          ? "Your euro wallet does not have enough for this choice."
          : "Payment could not be confirmed. Retry this same choice to check it safely.",
      );
      setWalletError(true);
      return false;
    } finally {
      walletBusy.current = false;
    }
  }

  async function command(
    action:
      | Omit<Extract<Command, { kind: "travel" }>, "key" | "revision">
      | Omit<Extract<Command, { kind: "choice" }>, "key" | "revision">
      | ({ kind: "journey" } & JourneyAction)
      | { kind: "rest" | "night" | "finish" },
  ): Promise<boolean> {
    const current = tripRef.current;
    if (!current) return false;
    if (travelGate.current.pending || commandBusy.current) return false;
    if (
      action.kind === "travel" &&
      action.mode === "walk" &&
      distanceMetres(
        { lat: visitedLocation.latitude, lng: visitedLocation.longitude },
        focusFor(action.place, current.setup.base),
      ) > WALKABLE_METRES
    ) {
      notify("This area is too far to walk. Choose paid transport.");
      return false;
    }
    const attemptKey = JSON.stringify({
      tripId: current.id,
      revision: current.revision,
      action,
    });
    const appliedCommand = {
      ...action,
      key:
        pendingWalletAttempt.current?.key === attemptKey
          ? pendingWalletAttempt.current.id
          : crypto.randomUUID(),
      revision: current.revision,
    } as Command;
    const result = apply(current, appliedCommand);
    if (result.error) {
      notify(result.error);
      return false;
    }
    const costCents = Math.round((result.trip.spent - current.spent) * 100);
    if (costCents > 0) {
      commandBusy.current = true;
      const purpose =
        action.kind === "choice"
          ? "activity"
          : action.kind === "travel"
            ? "travel"
            : "ticket";
      const charged = await chargeWallet(
        costCents,
        purpose,
        result.trip.history.at(-1)?.title || "Lisbon activity",
        attemptKey,
      );
      commandBusy.current = false;
      if (!charged) return false;
    }
    tripRef.current = result.trip;
    setTrip(result.trip);
    setPending(null);
    setSelected("");
    const outcome =
      result.trip.history.at(-1)?.outcome || "Your trip is updated.";
    const sequence = commandTravel(current, result.trip, appliedCommand);
    if (sequence) {
      if (action.kind === "travel")
        sequence.from = {
          lat: visitedLocation.latitude,
          lng: visitedLocation.longitude,
          name: visitedLocation.area,
        };
      startTravelPreview(
        sequence,
        result.trip,
        result.trip.complete ? "recap" : null,
        outcome,
      );
    } else {
      notify(outcome);
    }
    if (!sequence && action.kind === "journey" && action.action === "board") {
      leaveRoom();
      setClean(false);
      setPanel(null);
    }
    if (!sequence && result.trip.complete) setPanel("recap");
    return true;
  }
  function begin() {
    if (travelGate.current.pending) return;
    try {
      const next = newTrip(
        { ...setup, startDate: calendarStart, endDate: calendarEnd },
        crypto.randomUUID(),
      );
      leaveRoom();
      setClean(false);
      if (trip) setArchive((a) => [trip, ...a].slice(0, 4));
      tripRef.current = next;
      setTrip(next);
      setSelected("");
      const sequence = arrivalTravel(next);
      if (sequence) {
        startTravelPreview(
          sequence,
          next,
          "journey",
          "Welcome to Lisbon. Your arrival hub is ready to explore.",
        );
      } else {
        setPanel(null);
        notify("Welcome to your little Lisbon. Make it yours.");
      }
    } catch {
      notify(
        "Check your calendar range and choose a budget between €30 and €5,000.",
      );
    }
  }
  function download() {
    if (!trip) return;
    const url = URL.createObjectURL(
      new Blob([itinerary(trip)], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "roam-lisbon-itinerary.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const place = trip?.place || "home";
  const placeDistrict =
    place === "home" ? trip?.setup.base || setup.base : places[place].district;
  const PlaceIcon = iconFor(place);
  const available = trip && !trip.complete ? availableScenarios(trip) : [];
  const current = available.find((s) => s.id === selected) || available[0];
  const mood = trip
    ? trip.energy < 25
      ? "Time for a little rest"
      : trip.energy < 50
        ? "Taking it slowly"
        : "Feeling good"
    : "Your next chapter";
  const openTravel = () => {
    if (trip?.journey.phase === "arriving" || trip?.journey.ticket) {
      setPanel("journey");
      return;
    }
    setDestination(null);
    setPanel("travel");
  };

  const visited = trip
    ? new Set(memories(trip).map((h) => h.place))
    : new Set<PlaceId>();
  const calendarStart =
    setup.startDate || new Date().toISOString().slice(0, 10);
  const calendarEnd =
    setup.endDate ||
    new Date(Date.parse(`${calendarStart}T00:00:00Z`) + setup.days * 86400000)
      .toISOString()
      .slice(0, 10);
  const chatPlace = chatPlaceFor(
    interior
      ? interior.id
      : mapHotspot?.id ||
          (trip?.journey.hub ? `transit-${trip.journey.hub}` : undefined),
  );
  const selectedPresence = selectedPlayer
    ? peers.find((peer) => peer.id === selectedPlayer.id) ||
      (selectedDirectoryPeer?.id === selectedPlayer.id &&
      Date.parse(selectedDirectoryPeer.lastSeenAt) > Date.now() - 45_000
        ? selectedDirectoryPeer
        : undefined)
    : undefined;
  function selectPlayer(player: ChatPeer) {
    if (player.id === user.id || travelSequence) return;
    setPhoneOpen(false);
    setPanel(null);
    setNearbyOpen(false);
    setSelectedDirectoryPeer(
      "lastSeenAt" in player ? (player as MultiplayerPeer) : null,
    );
    setSelectedPlayer({
      id: player.id,
      handle: player.handle,
      userType: player.userType,
    });
  }
  function messagePlayer(player: ChatPeer | null = selectedPlayer) {
    if (!player) return;
    setChatPeer(player);
    setOpenPeerRequest((request) => request + 1);
    setSelectedPlayer(null);
    setNearbyOpen(false);
    setPanel(null);
    setPhoneStart("messages");
    setPhoneOpen(true);
  }
  function findPlayer() {
    if (!selectedPresence) return;
    const place = playerPlace(selectedPresence.placeId);
    setSelectedPlayer(null);
    leaveRoom();
    setMapHotspot(place?.hotspot || null);
    setPanel(place ? "hotspot" : null);
    setMapFocus({
      lat: place?.lat ?? selectedPresence.latitude,
      lng: place?.lng ?? selectedPresence.longitude,
      name:
        place?.name || `@${selectedPresence.handle} · ${selectedPresence.area}`,
      range: place ? 140 : 18,
      ...(place ? {} : { peerId: selectedPresence.id }),
      presenceArea: selectedPresence.area,
    });
  }
  function joinPlayer(peer: MultiplayerPeer) {
    // The paged venue directory can contain people beyond the short heartbeat roster.
    const live =
      peers.find((candidate) => candidate.id === peer.id) ||
      (peer.placeId === visitedLocation.placeId &&
      Date.parse(peer.lastSeenAt) > Date.now() - 45_000
        ? peer
        : undefined);
    const place = playerPlace(live?.placeId);
    if (!live || !place?.kind) {
      notify(
        "This player has left that venue. Find their latest location nearby.",
      );
      return;
    }
    setNearbyOpen(false);
    setSelectedPlayer(null);
    if (interior?.id === place.id) {
      notify(`You’re already together at ${place.name}.`);
      return;
    }
    setMapHotspot(place.hotspot);
    requestAreaEntry({
      focus: {
        lat: place.lat,
        lng: place.lng,
        name: place.name,
        range: 140,
      },
      visit: {
        id: place.id,
        name: place.name,
        kind: place.kind,
        sourceUrl: place.hotspot.sourceUrl,
      },
      message: `You joined ${live.handle} at ${place.name}.`,
    });
  }
  function closePhone() {
    setPhoneOpen(false);
  }
  function closeOverlays() {
    setPhoneOpen(false);
    setPanel(null);
    setNearbyOpen(false);
    setSelectedPlayer(null);
    setActivitiesOpen(false);
  }
  function openFeature(next: Panel) {
    closeOverlays();
    setPanel(next);
  }
  function openMessages() {
    closeOverlays();
    setChatPeer(null);
    setPhoneStart("messages");
    setPhoneOpen(true);
  }
  function openNearby() {
    closeOverlays();
    setNearbyOpen(true);
  }
  function openSharedActivities() {
    closeOverlays();
    setPhoneStart("activities");
    setPhoneOpen(true);
  }
  function visitActivityVenue(venueId: string, id: string) {
    if (travelGate.current.pending) {
      notify("Finish your journey before joining this outing.");
      return;
    }
    const place = playerPlace(venueId);
    if (!place) {
      notify(
        "This activity's mapped venue is unavailable. Open the room and choose another outing.",
      );
      return;
    }
    selectActivity(id);
    closeOverlays();
    setMapHotspot(place.hotspot);
    setMapFocus({
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      range: 100,
    });
    // Visiting is a personal choice; joining the chat never moves another player.
    if (place.kind)
      enterRoom({
        id: place.id,
        name: place.name,
        kind: place.kind,
        sourceUrl: place.hotspot.sourceUrl,
      });
    else {
      if (interior) leaveRoom();
      setVisitedLocation({
        latitude: place.lat,
        longitude: place.lng,
        area: place.area,
        placeId: place.id,
      });
      setClean(true);
    }
    notify(
      `You arrived at ${place.name}. Open your activity room to chat and take part.`,
    );
  }

  useProfileActions([
    {
      id: "trip-settings",
      label: "Trip settings & saved chapters",
      detail: "Your budget, recaps and saved trips",
      icon: "settings",
      onSelect: () => openFeature("pocket"),
    },
    {
      id: "passport",
      label: "District passport",
      detail: trip
        ? `${visited.size} places discovered`
        : "Start a trip to collect memories",
      icon: "passport",
      disabled: !trip,
      onSelect: () => openFeature("journal"),
    },
    {
      id: "home",
      label: "Your home",
      detail: trip?.setup.base || setup.base,
      icon: "home",
      onSelect: () => {
        closeOverlays();
        enterHome();
      },
    },
    {
      id: "new-chapter",
      label: trip ? "Start a new chapter" : "Plan your arrival",
      detail: "Your dates, interests and travel style",
      icon: "trip",
      disabled: !loaded,
      onSelect: () => openFeature(trip ? "new" : "setup"),
    },
  ]);
  if (!loaded) {
    return (
      <main className="auth-status" role="status">
        <p>
          {user.userType === "tourist"
            ? "Preparing your Lisbon arrival…"
            : "Opening your Lisbon home…"}
        </p>
      </main>
    );
  }
  if (homeError && !trip) {
    return (
      <main className="auth-status">
        <h1>Your saved home could not be loaded.</h1>
        <p>Try again when the account service is available.</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }
  const phoneTime = trip
    ? `${String(Math.floor(trip.minute / 60)).padStart(2, "0")}:${String(trip.minute % 60).padStart(2, "0")}`
    : cityNow?.toLocaleTimeString("en-GB", {
        timeZone: "Europe/Lisbon",
        hour: "2-digit",
        minute: "2-digit",
      }) || "—:—";
  const phoneDate = trip
    ? `Day ${trip.day} · ${trip.setup.days}-day chapter`
    : cityNow?.toLocaleDateString("en-GB", {
        timeZone: "Europe/Lisbon",
        weekday: "long",
        day: "numeric",
        month: "long",
      }) || "Your Lisbon chapter";
  const phoneApps: PhoneApp[] = [
    {
      id: "profile",
      label: "Profile",
      detail: "Your character, trip & account",
      icon: UserRound,
      content: <ProfileMenu onAction={closePhone} />,
    },
    {
      id: "messages",
      label: "Messages",
      detail: "City chats & private messages",
      icon: MessageCircle,
      layout: "fill",
      content: (
        <ChatPanel
          embedded
          key={user.id}
          user={user}
          cityId="lisbon"
          place={chatPlace}
          initialPeer={chatPeer}
          initialTab="messages"
          draftStore={chatDrafts}
          onDraftChange={rememberChatDraft}
          openPeerRequest={openPeerRequest}
          onSelectPlayer={selectPlayer}
          onOpenActivities={openSharedActivities}
          peers={peers}
          nearbyArea={enabled ? location.area : undefined}
          onClose={closePhone}
        />
      ),
    },
    {
      id: "activities",
      label: "Activities",
      detail: "Create a plan. Meet in the city.",
      icon: Sparkles,
      layout: "fill",
      content: (
        <ActivitiesPanel
          user={user}
          presenceEnabled={enabled}
          selectedActivityId={activityId}
          onActivityChange={selectActivity}
          onRoomChange={receiveActivityRoom}
          onAction={(event) =>
            receiveActivityAction(event, activityRoom?.venueId)
          }
          currentVenueId={
            enabled && presenceStatus === "online"
              ? visitedLocation.placeId
              : undefined
          }
          onVisitVenue={visitActivityVenue}
          onWalletChange={setActivityWallet}
          draftStore={chatDrafts}
          onDraftChange={rememberChatDraft}
        />
      ),
    },
    {
      id: "nearby",
      label: "Nearby",
      detail: "Find players & join their venue",
      icon: Users,
      onOpen: openNearby,
    },
    {
      id: "journey",
      label: "Journey",
      detail: "Transport card, tickets & arrival",
      icon: Ticket,
      onOpen: () => openFeature(trip ? "journey" : "setup"),
    },
    {
      id: "journal",
      label: "Journal",
      detail: "Your passport & collected memories",
      icon: BookOpen,
      content: trip ? (
        <section className="phone-page">
          <span className="phone-stamp">
            <BookOpen size={28} />
          </span>
          <h3>Your Lisbon story</h3>
          <p>
            {memories(trip).length} memories · {visited.size} places discovered
          </p>
          <div className="phone-memory-list">
            {memories(trip)
              .slice(-3)
              .reverse()
              .map((memory) => (
                <div key={memory.command.key}>
                  <strong>{memory.title}</strong>
                  <small>
                    Day {memory.day} · {places[memory.place].district}
                  </small>
                </div>
              ))}
            {!memories(trip).length && (
              <p>
                Your first memory is waiting. Pick a place and try something
                new.
              </p>
            )}
          </div>
          <button onClick={() => openFeature("journal")}>
            <Compass size={18} /> Open district passport{" "}
            <ChevronRight size={17} />
          </button>
          <button onClick={download}>
            <Download size={18} /> Download itinerary
          </button>
        </section>
      ) : (
        <section className="phone-page">
          <span className="phone-stamp">
            <BookOpen size={28} />
          </span>
          <h3>A story waiting to happen</h3>
          <p>
            Plan your arrival, then collect places and small discoveries as you
            explore.
          </p>
          <button onClick={() => openFeature("setup")}>
            <Plane size={18} /> Plan your arrival
          </button>
        </section>
      ),
    },
    {
      id: "wallet",
      label: "Wallet",
      detail: "Your activity budget & wellbeing",
      icon: Wallet,
      content: (
        <section className="phone-page">
          <span className="phone-stamp">
            <Wallet size={28} />
          </span>
          <SimulationWallet
            wallet={activityWallet}
            onChange={setActivityWallet}
          />
          <h3>
            {trip ? euro(trip.setup.budget - trip.spent) : "Your city budget"}
          </h3>
          <p>
            {trip
              ? `${euro(trip.spent)} spent of ${euro(trip.setup.budget)} · Day ${trip.day} of ${trip.setup.days}`
              : "Choose an activity budget when you plan your trip."}
          </p>
          {trip && (
            <div className="meters phone-meters">
              {(
                [
                  ["Energy", trip.energy, Zap],
                  ["Inspiration", trip.inspiration, Sparkles],
                  ["Connection", trip.connection, Heart],
                ] as const
              ).map(([label, value, Icon]) => (
                <div key={label} className="meter">
                  <div>
                    <span>
                      <Icon size={14} />
                      {label}
                    </span>
                    <span>{value}%</span>
                  </div>
                  <meter min={0} max={100} value={value} aria-label={label} />
                </div>
              ))}
            </div>
          )}
          <p className="phone-note">
            A simulated activity budget. Transport and experiences use
            illustrative costs.
          </p>
          <button onClick={() => openFeature(trip ? "pocket" : "setup")}>
            <Settings size={18} />{" "}
            {trip ? "Trip settings & recaps" : "Plan your trip"}
            <ChevronRight size={17} />
          </button>
        </section>
      ),
    },
    {
      id: "home",
      label: "Home",
      detail: `Your base in ${trip?.setup.base || setup.base}`,
      icon: Home,
      onOpen: () => {
        closeOverlays();
        enterHome();
      },
    },
    {
      id: "guide",
      label: "City guide",
      detail: "Explore Lisbon at your pace",
      icon: Compass,
      content: (
        <section className="phone-page">
          <span className="phone-stamp">
            <Compass size={28} />
          </span>
          <h3>Make the city yours</h3>
          <p>
            Tap a floating place icon to visit. Drag to rotate, use Pan to move
            and scroll to zoom. View options holds the camera and scene
            controls.
          </p>
          <button onClick={() => openFeature("map-search")}>
            <Search size={18} /> Find cafés, beaches & more{" "}
            <ChevronRight size={17} />
          </button>
          {!interior && (
            <button
              aria-pressed={clean}
              onClick={() => {
                setClean((value) => !value);
                closePhone();
              }}
            >
              {clean ? <Eye size={18} /> : <EyeOff size={18} />}
              {clean ? "Show city prompts" : "Focus on the scenery"}
            </button>
          )}
          <div className="phone-guide-note">
            <strong>Try the city before you go.</strong>
            <p>
              ROAM is a city simulation. Places use real positions; characters,
              activities, costs and journeys are illustrative.
            </p>
            <a
              href="https://www.visitlisboa.com/en"
              target="_blank"
              rel="noreferrer"
            >
              Explore Visit Lisboa <ArrowUpRight size={15} />
            </a>
          </div>
        </section>
      ),
    },
  ];
  return (
    <main className="app-shell">
      <div
        className={`game roam-play${clean || travelSequence ? " clean-world" : ""}`}
      >
        <World
          focus={mapFocus}
          thirdPerson={user.userType === "local"}
          shirt={appearance.topColor}
          appearance={travellerAppearance}
          hotspots={worldHotspots}
          onHotspot={pickHotspot}
          interior={interior}
          minute={trip?.minute}
          travelSequence={travelSequence}
          onTravelComplete={completeTravelPreview}
          onExitInterior={leaveRoom}
          onTransitAction={() => {
            if (trip) setPanel("journey");
            else setPanel("setup");
          }}
          peers={peers}
          onPlayer={selectPlayer}
          socialEvent={socialEvent}
          sharedOuting={Boolean(
            activityRoom && interior?.id === activityRoom.venueId,
          )}
        />
        {activityRoom && !phoneOpen && !travelSequence && (
          <ActivityOuting
            activity={activityRoom}
            venueName={
              playerPlace(activityRoom.venueId)?.name || "Your meeting place"
            }
            atVenue={visitedLocation.placeId === activityRoom.venueId}
            presentCount={
              peers.filter(
                (peer) =>
                  peer.placeId === activityRoom.venueId &&
                  activityRoom.members.some((member) => member.id === peer.id),
              ).length
            }
            onOpen={openSharedActivities}
            onVisit={() =>
              visitActivityVenue(activityRoom.venueId, activityRoom.id)
            }
            onExit={() => {
              leaveRoom();
              setClean(false);
            }}
          />
        )}
        {!travelSequence && (
          <MultiplayerDock
            onSelect={selectPlayer}
            onFind={() => {
              setPanel(null);
              setSelectedPlayer(null);
              setNearbyOpen(true);
            }}
            currentPlaceId={visitedLocation.placeId}
            inside={Boolean(interior)}
          />
        )}
        {!travelSequence && (
          <header className="topbar">
            <a className="brand" href="/" aria-label="ROAM home">
              ROAM<span>EVERY CITY. YOUR STORY.</span>
            </a>
            {trip ? (
              <div className="clock">
                <Sun size={18} />
                <span>
                  DAY {String(trip.day).padStart(2, "0")} <b>·</b>{" "}
                  {time(trip.minute)}
                </span>
                <span className="mood">
                  {travelSequence
                    ? "In transit"
                    : trip.complete
                      ? "Your chapter, complete"
                      : mood}
                </span>
              </div>
            ) : (
              <div className="clock intro-clock">
                <Sun size={18} />
                <span>A CITY TO TRY BEFORE YOU GO</span>
              </div>
            )}
            <button
              className="wallet"
              disabled={Boolean(travelSequence)}
              onClick={() => setPanel("pocket")}
            >
              <Wallet size={18} />
              <span>{wallet ? euro(wallet.balanceCents / 100) : "Wallet"}</span>
            </button>
          </header>
        )}
        {!travelSequence &&
          (!trip ? (
            <>
              <div className="arrival-note">
                <span className="eyebrow">A CONNECTED LISBON WORLD</span>
                <span>
                  <MapPin size={14} /> Cais do Sodré, Lisbon
                </span>
              </div>
              <section className="welcome card">
                <span className="eyebrow">A SMALL WORLD. A REAL FEELING.</span>
                <h1>
                  A little Lisbon.
                  <br />A lot of possibility.
                </h1>
                <p>
                  Try the city before you go. Find your favourite corners, make
                  a few memories, and discover a trip that feels like you.
                </p>
                <button
                  className="primary"
                  disabled={!loaded}
                  onClick={() => setPanel("setup")}
                >
                  Start your Lisbon chapter <ArrowRight size={18} />
                </button>
                <div className="welcome-details">
                  <span>
                    <Compass size={15} /> Your dates, your pace
                  </span>
                  <span>
                    <Heart size={15} /> Your pace
                  </span>
                </div>
                <small>
                  Free to play · Account protected · Saved on this browser
                </small>
              </section>
              <div className="scene-caption">
                <span>STREETS. HILLS. EVERYDAY LIFE.</span>
                <p>Drag, rotate, and find your own Lisbon.</p>
              </div>
            </>
          ) : (
            <>
              <div className="place-pill">
                <span className="live-dot" />
                <PlaceIcon size={14} />
                <span>
                  {trip.journey.hub
                    ? JOURNEY_HUBS[trip.journey.hub].name
                    : places[place].name}{" "}
                  <b>·</b> {trip.journey.hub ? "Transport hub" : placeDistrict}
                </span>
              </div>
              <section
                className="interaction card"
                id="city-experiences"
                hidden={!activitiesOpen}
                aria-label="Available experiences"
              >
                {(trip.journey.phase === "arriving" || trip.journey.ticket) &&
                !trip.complete ? (
                  <>
                    <span className="eyebrow">YOUR ARRIVAL CHAPTER</span>
                    <h2>
                      {trip.journey.ticket
                        ? "Your ticket is ready."
                        : "Welcome to Lisbon."}
                    </h2>
                    <p>
                      {trip.journey.ticket
                        ? "Your fare is already covered. Board from your travel hub to continue your journey."
                        : "Get your transport card, choose your first journey, and find your way into the city."}
                    </p>
                    <button
                      className="primary"
                      onClick={() => setPanel("journey")}
                    >
                      {trip.journey.ticket
                        ? "Return to boarding"
                        : "Continue your arrival"}{" "}
                      <Plane size={17} />
                    </button>
                  </>
                ) : trip.complete ? (
                  <>
                    <span className="eyebrow">UNTIL NEXT TIME, LISBON</span>
                    <h2>Your little chapter.</h2>
                    <p>
                      You made time for {memories(trip).length} memories. Keep
                      them, or try a different kind of trip.
                    </p>
                    <button
                      className="primary"
                      onClick={() => setPanel("recap")}
                    >
                      Open your recap <BookOpen size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="object-heading">
                      <span className="object-icon">
                        <PlaceIcon size={19} />
                      </span>
                      <div>
                        <span className="eyebrow">
                          {stageAt(trip.minute).toUpperCase()} IN{" "}
                          {placeDistrict.toUpperCase()}
                        </span>
                        <h2>{current?.title || "A little breathing room"}</h2>
                      </div>
                    </div>
                    <p>
                      {current?.description ||
                        "You have explored the available experiences here. Try another corner, or simply take a pause."}
                    </p>
                    <div className="choices">
                      {current?.choices.map((c, i) => (
                        <button
                          key={c.id}
                          className={i === 0 ? "choice featured" : "choice"}
                          disabled={!!blocked(trip, c)}
                          onClick={() => setPending(c)}
                        >
                          <strong>
                            {c.title}
                            <ArrowUpRight size={15} />
                          </strong>
                          <span>
                            {euro(c.cost)} · {c.minutes} min ·{" "}
                            {c.energy >= 0 ? "+" : ""}
                            {c.energy} energy
                          </span>
                          {blocked(trip, c) && (
                            <small>{blocked(trip, c)}</small>
                          )}
                        </button>
                      ))}
                    </div>
                    <div
                      className="scenario-tabs"
                      aria-label="More experiences"
                    >
                      {available.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelected(s.id)}
                          aria-pressed={current?.id === s.id}
                        >
                          {s.title}
                        </button>
                      ))}
                    </div>
                    <div className="pause-row">
                      <button
                        disabled={
                          !!blocked(trip, { cost: 0, minutes: 30, energy: 20 })
                        }
                        onClick={() => command({ kind: "rest" })}
                      >
                        <Armchair size={15} /> Take a pause{" "}
                        <span>Free · +20 energy</span>
                      </button>
                      <button onClick={() => command({ kind: "night" })}>
                        <Moon size={15} />
                        {trip.day === trip.setup.days
                          ? "Finish the day"
                          : "Next morning"}
                      </button>
                    </div>
                    {trip.minute > 1290 && (
                      <p className="quiet">
                        Your evening is winding down. Rest overnight to
                        continue.
                      </p>
                    )}
                  </>
                )}
              </section>
            </>
          ))}
        {!travelSequence && (
          <>
            {trip && !interior && !clean && (
              <button
                className="experience-toggle"
                aria-label={
                  activitiesOpen ? "Close experiences" : "Things to do"
                }
                aria-expanded={activitiesOpen}
                aria-controls="city-experiences"
                onClick={() => setActivitiesOpen((open) => !open)}
              >
                <Sparkles size={18} />
                <span>
                  {activitiesOpen ? "Close experiences" : "Things to do"}
                </span>
                <ChevronRight size={17} />
              </button>
            )}
            <nav className="nav card city-nav" aria-label="City navigation">
              <button
                onClick={() => openFeature("map-search")}
                aria-pressed={panel === "map-search"}
              >
                <Search />
                <span>Explore</span>
              </button>
              <button
                onClick={() => {
                  closeOverlays();
                  trip ? openTravel() : setPanel("setup");
                }}
                aria-pressed={
                  panel === "travel" || panel === "journey" || panel === "setup"
                }
              >
                <Map />
                <span>Travel</span>
              </button>
              <button
                ref={chatTrigger}
                onClick={openMessages}
                aria-haspopup="dialog"
              >
                <MessageCircle />
                <span>Chat</span>
              </button>
              <button
                ref={phoneTrigger}
                className="phone-trigger"
                onClick={() => {
                  closeOverlays();
                  setPhoneStart(undefined);
                  setChatPeer(null);
                  setPhoneOpen(true);
                }}
                aria-haspopup="dialog"
                aria-expanded={phoneOpen}
              >
                <Smartphone />
                <span>Phone</span>
              </button>
            </nav>
          </>
        )}
        <footer className="game-footnote">
          ROAM · SIMULATED TRIPS & CITY ENCOUNTERS
        </footer>
        {storageError && !travelSequence && (
          <div className="save-warning" role="alert">
            {trip
              ? "Saving is unavailable. Keep this tab open and download your itinerary before leaving."
              : "Your previous save needs attention. A new trip will replace it."}
          </div>
        )}
        {!travelSequence && (
          <div
            className="toast"
            role="status"
            aria-live="polite"
            hidden={!notice}
          >
            {notice}
          </div>
        )}
      </div>
      <Phone
        open={phoneOpen && !travelSequence}
        onClose={closePhone}
        apps={phoneApps}
        initialApp={phoneStart}
        city="Lisbon"
        time={phoneTime}
        date={phoneDate}
      />
      {selectedPlayer && !travelSequence && (
        <PlayerMenu
          key={selectedPlayer.id}
          player={selectedPlayer}
          presence={selectedPresence}
          onMessage={() => messagePlayer()}
          onFind={findPlayer}
          onJoin={
            selectedPresence && playerPlace(selectedPresence.placeId)?.kind
              ? () => joinPlayer(selectedPresence)
              : undefined
          }
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      {nearbyOpen && !travelSequence && (
        <NearbyPlayers
          peers={peers}
          enabled={enabled}
          status={presenceStatus}
          currentPlaceId={visitedLocation.placeId}
          onSelect={selectPlayer}
          onMessage={messagePlayer}
          onJoin={joinPlayer}
          onClose={() => setNearbyOpen(false)}
        />
      )}
      <div className="below-game">
        <span>Try a city. Find your rhythm.</span>
        <span>Lisbon pilot · Illustrative costs · Europe/Lisbon time</span>
      </div>
      {panel === "map-search" && (
        <Dialog title="Find your Lisbon." onClose={() => setPanel(null)} wide>
          <p className="lede">
            Landmarks, cafés, beaches and local spots across one connected
            Lisbon region.
          </p>
          <div
            className="location-entry-tabs"
            aria-label="Choose a location method"
          >
            <button
              aria-pressed={locationEntry === "search"}
              onClick={() => setLocationEntry("search")}
            >
              <Search size={16} /> Type a location
            </button>
            <button
              aria-pressed={locationEntry === "link"}
              onClick={() => setLocationEntry("link")}
            >
              <MapPin size={16} /> Google Maps link
            </button>
          </div>
          {locationEntry === "search" && (
            <>
              <div className="venue-filters" aria-label="Place categories">
                {(
                  [
                    "all",
                    "landmarks",
                    "cafe",
                    "gym",
                    "restaurant",
                    "bar",
                    "shop",
                    "culture",
                    "beach",
                  ] as const
                ).map((category) => (
                  <button
                    key={category}
                    aria-pressed={venueFilter === category}
                    onClick={() => setVenueFilter(category)}
                  >
                    {category === "all"
                      ? "All places"
                      : category === "landmarks"
                        ? "Landmarks"
                        : VENUE_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
              <label className="map-input-label">
                Place, neighbourhood or street
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matches[0])
                      pickHotspot(matches[0]);
                  }}
                  placeholder="Café Janis, Benfica, Rua Nova do Carvalho…"
                />
              </label>
              <div className="hotspot-list">
                {matches.slice(0, 60).map((h) => (
                  <button key={h.id} onClick={() => pickHotspot(h)}>
                    {h.category === "beach" ? (
                      <Waves size={17} />
                    ) : (
                      <MapPin size={17} />
                    )}
                    <span>
                      <strong>{h.name}</strong>
                      <small>
                        {h.custom
                          ? "Your saved pin"
                          : h.mapVenue &&
                              h.category &&
                              Object.hasOwn(VENUE_CATEGORY_LABELS, h.category)
                            ? `${VENUE_CATEGORY_LABELS[h.category as VenueCategory]} · ${h.address || h.area}`
                            : h.area}
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
              <p className="quiet">
                {matches.length
                  ? `${Math.min(60, matches.length)} of ${matches.length} places shown. Search a name or street to narrow the map.`
                  : "No matching places. Try another name or category."}
              </p>
            </>
          )}
          {locationEntry === "link" && (
            <form
              className="pin-form"
              onSubmit={(e) => {
                e.preventDefault();
                addPin();
              }}
            >
              <h3>Add a Google Maps pin</h3>
              <label className="map-input-label">
                Google Maps link
                <input
                  required
                  type="url"
                  value={pinUrl}
                  onChange={(e) => setPinUrl(e.target.value)}
                  placeholder="https://www.google.com/maps/place/…"
                />
              </label>
              <label className="map-input-label">
                Your label (optional)
                <input
                  value={pinName}
                  onChange={(e) => setPinName(e.target.value)}
                  maxLength={60}
                  placeholder="My Lisbon stop"
                />
              </label>
              <button className="primary" type="submit" disabled={pinBusy}>
                {pinBusy ? "Opening location…" : "Add & explore"}{" "}
                <MapPin size={16} />
              </button>
              {pinError && (
                <p className="pin-error" role="alert">
                  {pinError}
                </p>
              )}
              <p className="quiet">
                Paste a shared Google Maps link to save a spot in Lisbon or
                Sintra. If the link does not include a location, open it in Maps
                and copy the full address.
              </p>
            </form>
          )}
        </Dialog>
      )}
      {panel === "area-transport" && areaEntry && (
        <Dialog
          title={`Travel to ${areaEntry.focus.name}`}
          onClose={() => {
            if (!areaTravelBusy) {
              setAreaEntry(null);
              setPanel(null);
            }
          }}
        >
          <p className="lede">
            This area is{" "}
            {Math.round(
              distanceMetres(
                {
                  lat: visitedLocation.latitude,
                  lng: visitedLocation.longitude,
                },
                areaEntry.focus,
              ) / 100,
            ) / 10}{" "}
            km away, beyond the 2 km walking range. Choose a ride to move your
            character there.
          </p>
          <p className="quiet">
            Wallet balance:{" "}
            {wallet ? euro(wallet.balanceCents / 100) : "Unavailable"}
          </p>
          {areaTransport.map((option) => (
            <button
              key={option.mode}
              className="secondary full"
              disabled={
                areaTravelBusy ||
                !wallet ||
                wallet.balanceCents < option.costCents
              }
              onClick={() => void takeAreaTransport(option)}
            >
              {option.label} · {euro(option.costCents / 100)}{" "}
              <ArrowRight size={17} />
            </button>
          ))}
        </Dialog>
      )}
      {panel === "hotspot" && mapHotspot && (
        <Dialog title={mapHotspot.name} onClose={() => setPanel(null)}>
          <span className="eyebrow">
            {mapHotspot.custom
              ? "YOUR MAP PIN"
              : mapHotspot.area?.toUpperCase()}
          </span>
          <p className="lede">
            {mapHotspot.custom
              ? "A location you picked from a Maps link."
              : mapHotspot.description ||
                GEOGRAPHIC_HOTSPOTS.find((h) => h.id === mapHotspot.id)
                  ?.description}
          </p>
          <div className="hotspot-coordinates">
            <MapPin size={15} />
            {mapHotspot.lat.toFixed(5)}, {mapHotspot.lng.toFixed(5)}
          </div>
          <button
            className="primary full"
            onClick={() => {
              setMapFocus({ ...mapHotspot, range: 100 });
              setPanel(null);
            }}
          >
            Look around in 3D <Compass size={17} />
          </button>
          {interiorForHotspot(mapHotspot) && (
            <button
              className="secondary full"
              onClick={() =>
                requestAreaEntry({
                  focus: { ...mapHotspot, range: 140 },
                  visit: {
                    id: mapHotspot.id,
                    name: mapHotspot.name,
                    kind: interiorForHotspot(mapHotspot)!,
                    sourceUrl: mapHotspot.sourceUrl,
                  },
                })
              }
            >
              Enter{" "}
              {mapHotspot.category === "culture"
                ? "cultural scene"
                : interiorForHotspot(mapHotspot) === "cafe"
                  ? "café"
                  : interiorForHotspot(mapHotspot)}{" "}
              <ArrowRight size={17} />
            </button>
          )}
          {transitHubFor(mapHotspot) && (
            <button
              className="secondary full"
              disabled={
                !!trip &&
                trip.journey.hub !== transitHubFor(mapHotspot)!.id &&
                !!previewJourney(trip, {
                  action: "visit-hub",
                  hub: transitHubFor(mapHotspot)!.id,
                }).reason
              }
              onClick={() => visitTransitHub(transitHubFor(mapHotspot)!.id)}
            >
              {transitHubFor(mapHotspot)!.kind === "bus-stop"
                ? "Stand at the bus stop"
                : `Enter ${transitHubFor(mapHotspot)!.kind === "station" ? "train station" : "airport"}`}{" "}
              {trip &&
                trip.journey.hub !== transitHubFor(mapHotspot)!.id &&
                "· 20 min · €0 "}
              <ArrowRight size={17} />
            </button>
          )}
          {trip &&
            !trip.complete &&
            mapHotspot.area &&
            areaPlace[mapHotspot.area] &&
            areaPlace[mapHotspot.area] !== trip.place && (
              <button
                className="secondary full"
                onClick={() => {
                  if (
                    trip.journey.phase === "arriving" ||
                    trip.journey.ticket
                  ) {
                    setPanel("journey");
                    return;
                  }
                  setDestination(areaPlace[mapHotspot.area!]);
                  setMode(mapHotspot.area === "Sintra" ? "train" : "walk");
                  setPanel("travel");
                }}
              >
                Travel here in your trip <ArrowRight size={17} />
              </button>
            )}
          <div className="source-note">
            <span>
              Mapped geographic position. Building heights and appearances are
              approximate. Activities are simulated; nothing is booked.
            </span>
            {mapHotspot.mapsUrl && (
              <a target="_blank" rel="noreferrer" href={mapHotspot.mapsUrl}>
                Open this pin in Google Maps <ArrowUpRight size={13} />
              </a>
            )}
            {mapHotspot.sourceUrl && (
              <a target="_blank" rel="noreferrer" href={mapHotspot.sourceUrl}>
                {mapHotspot.mapVenue || mapHotspot.mapLocation
                  ? "View the map source"
                  : "Official cultural context"}{" "}
                <ArrowUpRight size={13} />
              </a>
            )}
          </div>
          {mapHotspot.custom && (
            <button
              className="danger-link"
              onClick={() => {
                const next = pins.filter((p) => p.id !== mapHotspot.id);
                setPins(next);
                try {
                  localStorage.setItem(storage.pins, JSON.stringify(next));
                } catch {}
                setPanel(null);
              }}
            >
              Remove this pin
            </button>
          )}
        </Dialog>
      )}
      {pending && trip && (
        <Dialog title={pending.title} onClose={() => setPending(null)}>
          <p className="lede">A little preview before you choose.</p>
          <div className="preview-stats">
            <div>
              <Wallet />
              <strong>{euro(pending.cost)}</strong>
              <span>Activity cost</span>
            </div>
            <div>
              <Sun />
              <strong>{pending.minutes} min</strong>
              <span>Trip time</span>
            </div>
            <div>
              <Zap />
              <strong>
                {pending.energy >= 0 ? "+" : ""}
                {pending.energy}
              </strong>
              <span>Energy</span>
            </div>
          </div>
          <p className="quiet">
            Illustrative simulation estimates. This activity is not booked.
          </p>
          <div className="effect-line">
            <Sparkles size={16} /> +{pending.inspiration} inspiration{" "}
            <Heart size={16} /> +{pending.connection} connection
          </div>
          <button
            className="primary full"
            onClick={() => command({ kind: "choice", choiceId: pending.id })}
          >
            Make this memory <ArrowRight size={17} />
          </button>
        </Dialog>
      )}
      {panel === "setup" && (
        <Dialog title="Make Lisbon yours." onClose={() => setPanel(null)} wide>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              begin();
            }}
            className="setup-form"
          >
            <p className="lede">A few choices to shape your little chapter.</p>
            <fieldset>
              <legend>What brings you to Lisbon?</legend>
              <div className="segments styles">
                {(
                  Object.entries(JOURNEY_PERSONAS) as [
                    Persona,
                    (typeof JOURNEY_PERSONAS)[Persona],
                  ][]
                ).map(([id, persona]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={(setup.persona || "tourist") === id}
                    onClick={() => setSetup((s) => ({ ...s, persona: id }))}
                  >
                    {persona.name}
                    <small>{persona.description}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Where does your story begin?
              <select
                value={setup.arrival || "home"}
                onChange={(e) =>
                  setSetup((s) => ({
                    ...s,
                    arrival: e.target.value as Arrival,
                  }))
                }
              >
                <option value="airport">Landing at Lisbon Airport</option>
                <option value="station">Arriving at Rossio station</option>
                <option value="bus-stop">At a Cais do Sodré bus stop</option>
                <option value="home">Already settled at home</option>
              </select>
            </label>
            <fieldset>
              <legend>When are you staying?</legend>
              <TripCalendar
                start={calendarStart}
                end={calendarEnd}
                onValidityChange={setCalendarValid}
                onChange={(startDate, endDate, days) =>
                  setSetup((s) => ({ ...s, startDate, endDate, days }))
                }
              />
            </fieldset>
            <fieldset>
              <legend>What would you like to discover?</legend>
              <div className="segments interest-options">
                {interests.map(({ id, name }) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={setup.interests?.includes(id) || false}
                    onClick={() =>
                      setSetup((s) => ({
                        ...s,
                        interests: s.interests?.includes(id)
                          ? s.interests.filter((v) => v !== id)
                          : [...(s.interests || []), id],
                      }))
                    }
                  >
                    {name}
                    {setup.interests?.includes(id) && <Check size={14} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Your accommodation style</legend>
              <div className="segments accommodation-options">
                {accommodations.map(({ id, name, detail }) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={(setup.accommodation || "apartment") === id}
                    onClick={() =>
                      setSetup((s) => ({ ...s, accommodation: id }))
                    }
                  >
                    {name}
                    <small>{detail}</small>
                  </button>
                ))}
              </div>
              <small className="quiet">
                Choose the kind of base you would like to try. Accommodation is
                imagined; no room is reserved.
              </small>
            </fieldset>
            <div className="form-grid">
              <label>
                Your journey budget (€)
                <input
                  required
                  type="number"
                  min={30}
                  max={5000}
                  step={1}
                  value={setup.budget}
                  onChange={(e) =>
                    setSetup((s) => ({ ...s, budget: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Your home base
                <select
                  value={setup.base}
                  onChange={(e) =>
                    setSetup((s) => ({
                      ...s,
                      base: e.target.value as Setup["base"],
                    }))
                  }
                >
                  <option>Graça</option>
                  <option>Baixa</option>
                  <option>Alfama</option>
                </select>
              </label>
            </div>
            <p className="quiet">
              Food, transport, experiences and any simulated departure ticket.
              Your arrival flight and accommodation are outside this budget.
              Your imagined home is in {setup.base}. Costs and travel times are
              game estimates.
            </p>
            <fieldset>
              <legend>What draws you to the city?</legend>
              <div className="segments styles">
                {styles.map((style) => (
                  <button
                    type="button"
                    key={style}
                    aria-pressed={setup.style === style}
                    onClick={() => setSetup((s) => ({ ...s, style }))}
                  >
                    {style}
                    <small>
                      {style === "Budget explorer"
                        ? "Small spends, big discoveries"
                        : style === "Foodie"
                          ? "Follow your appetite"
                          : "Stories, craft, and sound"}
                    </small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="avatar-field">
              <legend>Your trip colour</legend>
              <div className="swatches">
                {colors.map((shirt, i) => (
                  <button
                    type="button"
                    key={shirt}
                    style={{
                      background: shirt,
                      color: ["#42b894", "#ffce45", "#fff9ed"].includes(shirt)
                        ? "#172546"
                        : "#ffffff",
                    }}
                    aria-label={TRAVELLER_COLOURS[i].name}
                    aria-pressed={setup.shirt === shirt}
                    onClick={() => setSetup((s) => ({ ...s, shirt }))}
                  >
                    {setup.shirt === shirt && <Check size={18} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              className="primary full"
              type="submit"
              disabled={!calendarValid}
            >
              Let’s roam <ArrowRight size={18} />
            </button>
            <small className="quiet">
              Private, same-browser progress. Clearing browser storage removes
              your trips.
            </small>
          </form>
        </Dialog>
      )}
      {panel === "journey" && trip && (
        <Dialog
          title={
            trip.journey.phase === "arriving"
              ? "Your first steps in Lisbon."
              : "Your Lisbon journey."
          }
          onClose={() => setPanel(null)}
          wide
        >
          <JourneyPanel
            trip={trip}
            onCommand={(action) => {
              if (action.action === "visit-hub") {
                visitTransitHub(action.hub);
                return Promise.resolve(false);
              }
              return command({ kind: "journey", ...action });
            }}
            onEnterHub={enterTransitHub}
          />
          <TripRecommendations
            setup={trip.setup}
            onChoose={(id) => {
              leaveRoom();
              setMapFocus(focusFor(id, trip.setup.base));
              if (
                trip.journey.phase !== "arriving" &&
                !trip.journey.ticket &&
                !trip.complete &&
                id !== trip.place
              ) {
                setDestination(id);
                setMode(
                  id === "sintra" || trip.place === "sintra" ? "train" : "walk",
                );
                setPanel("travel");
              } else setPanel(null);
            }}
          />
        </Dialog>
      )}
      {panel === "travel" && trip && (
        <Dialog
          title={destination ? "A little journey." : "Where to next?"}
          onClose={() => setPanel(null)}
          wide
        >
          {!destination ? (
            <>
              <p className="lede">
                One connected region. Real positions, your own rhythm.
              </p>
              <button
                className="secondary full"
                onClick={() => setPanel("journey")}
              >
                <Ticket size={17} /> Stations, bus stops & airport
              </button>
              <div className="destinations">
                {(Object.keys(places) as PlaceId[]).map((id) => {
                  const p = places[id];
                  const Icon = iconFor(id);
                  return (
                    <button
                      className="destination"
                      key={id}
                      disabled={id === trip.place || trip.complete}
                      onClick={() => {
                        setDestination(id);
                        setMode(
                          id === "sintra" || trip?.place === "sintra"
                            ? "train"
                            : "walk",
                        );
                      }}
                    >
                      <span
                        className="destination-art"
                        style={{ background: p.color }}
                      >
                        <Icon size={28} />
                        <span>
                          {visited.has(id)
                            ? "DISCOVERED"
                            : id === "sintra"
                              ? "REGION"
                              : "LISBON"}
                        </span>
                      </span>
                      <span className="destination-copy">
                        <small>{p.district.toUpperCase()}</small>
                        <strong>
                          {p.name} <ArrowUpRight size={16} />
                        </strong>
                        <span>
                          {id === trip.place ? "You’re here." : p.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="quiet">
                Real geographic positions. Activities, characters and travel
                costs are illustrative.
              </p>
            </>
          ) : (
            <>
              <button
                className="text-button"
                onClick={() => setDestination(null)}
              >
                ← All places
              </button>
              <div className="route-heading">
                <MapPin size={28} />
                <h3>{places[destination].name}</h3>
                <span>{places[destination].district}</span>
              </div>
              <div className="segments routes">
                {(Object.keys(transport) as Mode[]).map((m) => (
                  <button
                    key={m}
                    disabled={!!routeReason(m)}
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                  >
                    {transport[m].title}
                    <small>
                      {euro(route(m)?.cost || 0)} · {route(m)?.minutes || "—"}{" "}
                      min
                    </small>
                  </button>
                ))}
              </div>
              <p className="quiet">
                Simplified travel estimates, including walks in Belém. These are
                not live fares, routes, or timetables.
              </p>
              {routeReason(mode) && <p role="status">{routeReason(mode)}</p>}
              <button
                className="primary full"
                disabled={!!routeReason(mode) || trip.complete}
                onClick={() => {
                  command({ kind: "travel", place: destination, mode });
                  setPanel(null);
                }}
              >
                Go to {places[destination].district} <ArrowRight size={18} />
              </button>
              <div className="source-note">
                <strong>
                  {places[destination].fictional
                    ? "Fictional venue · Real neighbourhood"
                    : "Real neighbourhood, simulated activities"}
                </strong>
                <span>
                  Context reviewed {REVIEWED}. Costs and durations are
                  illustrative.
                </span>
                <a
                  href={places[destination].source}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore cultural context <ArrowUpRight size={13} />
                </a>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(places[destination].map)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open neighbourhood map <ArrowUpRight size={13} />
                </a>
              </div>
            </>
          )}
        </Dialog>
      )}
      {(panel === "journal" || panel === "recap") && trip && (
        <Dialog
          title={
            panel === "recap" ? "Your Lisbon chapter." : "Your little journal."
          }
          onClose={() => setPanel(null)}
          wide
        >
          <p className="lede">
            {trip.complete
              ? "A few days. Your own way. Here’s what you made of them."
              : "A passport of places, pauses, and small discoveries."}
          </p>
          <div className="recap-stats">
            <div>
              <strong>{memories(trip).length}</strong>
              <span>memories</span>
            </div>
            <div>
              <strong>{visited.size}</strong>
              <span>places discovered</span>
            </div>
            <div>
              <strong>{euro(trip.spent)}</strong>
              <span>simulated spend</span>
            </div>
          </div>
          <div className="challenges">
            {challenges(trip).map((c) => (
              <div key={c.title}>
                <span
                  className={
                    c.count >= c.target
                      ? "challenge-stamp done"
                      : "challenge-stamp"
                  }
                >
                  {c.count >= c.target ? (
                    <Check size={20} />
                  ) : (
                    <Compass size={20} />
                  )}
                </span>
                <div>
                  <strong>{c.title}</strong>
                  <small>
                    {c.description} · {Math.min(c.count, c.target)}/{c.target}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="passport">
            {(Object.keys(places) as PlaceId[])
              .filter((id) => id !== "home")
              .map((id) => (
                <span key={id} className={visited.has(id) ? "stamped" : ""}>
                  {places[id].district}
                  <small>
                    {visited.has(id) ? "MEMORY COLLECTED" : "YET TO DISCOVER"}
                  </small>
                </span>
              ))}
          </div>
          <h3 className="journal-heading">Your actual choices</h3>
          {!trip.history.length ? (
            <p className="quiet">
              Your journal is waiting for its first little memory.
            </p>
          ) : (
            <ol className="timeline">
              {trip.history
                .filter((h) => !["finish", "night"].includes(h.tag))
                .map((h) => (
                  <li key={h.command.key}>
                    <span className="timeline-time">
                      DAY {h.day}
                      <small>
                        {time(h.start)}–{time(h.end)}
                      </small>
                    </span>
                    <div>
                      <strong>{h.title}</strong>
                      <small>
                        {places[h.place].district} · {euro(h.cost)}
                      </small>
                      <p>{h.outcome}</p>
                    </div>
                  </li>
                ))}
            </ol>
          )}
          <div className="journal-actions">
            <button className="primary" onClick={download}>
              <Download size={16} /> Download itinerary
            </button>
            <button
              className="secondary"
              onClick={() => {
                setSetup({ ...trip.setup });
                setPanel("setup");
              }}
            >
              <RefreshCw size={16} /> Try another trip
            </button>
          </div>
          <p className="quiet">
            Private on this browser. All activities are simulated and
            unconfirmed; fictional venues need real-world research. There is no
            public sharing link.
          </p>
        </Dialog>
      )}
      {panel === "pocket" && (
        <Dialog
          title="Trip settings & saved chapters."
          onClose={() => setPanel(null)}
        >
          <p className="lede">A little more about your world.</p>
          <div className="budget-card">
            <span>YOUR GAME WALLET</span>
            <strong>
              {wallet ? euro(wallet.balanceCents / 100) : "Loading…"}
            </strong>
            <p>
              Simulated euros · starts at €300 · spending is saved to your
              account.
            </p>
            {walletError && (
              <p role="alert">
                Wallet unavailable. Paid actions are paused until it reconnects.
              </p>
            )}
          </div>
          {wallet && wallet.entries.length > 0 && (
            <section aria-label="Recent wallet transactions">
              <h3>Recent activity</h3>
              <ul>
                {wallet.entries.slice(0, 8).map((entry) => (
                  <li key={entry.id}>
                    {entry.description} · {entry.amountCents > 0 ? "+" : "−"}
                    {euro(Math.abs(entry.amountCents) / 100)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {trip && (
            <>
              <div className="budget-card">
                <span>YOUR ACTIVITY BUDGET</span>
                <strong>
                  {euro(trip.setup.budget - trip.spent)}{" "}
                  <small>remaining</small>
                </strong>
                <p>
                  {euro(trip.spent)} spent of {euro(trip.setup.budget)} ·{" "}
                  {trip.setup.days} days · Base: {trip.setup.base}
                </p>
              </div>
              <button className="setting" onClick={() => setPanel("recap")}>
                <BookOpen size={18} />
                <span>Trip recap & itinerary</span>
                <ChevronRight size={16} />
              </button>
              <button className="setting" onClick={() => setPanel("new")}>
                <RefreshCw size={18} />
                <span>Start a new chapter</span>
                <ChevronRight size={16} />
              </button>
              {!trip.complete && (
                <button className="setting" onClick={() => setPanel("finish")}>
                  <Check size={18} />
                  <span>Finish this trip early</span>
                  <ChevronRight size={16} />
                </button>
              )}
            </>
          )}
          <div className="source-note">
            <strong>A simulation, with room to dream.</strong>
            <span>
              {scenarios.length} authored scenarios · a continuous Lisbon–Sintra
              world. Energy, inspiration, and connection are game meters. Inês,
              Tomás, and Noor are fictional characters. Signed-in players can
              now see one another through live city presence.
            </span>
            <span>
              Costs and durations are illustrative, not current prices. Sources
              support cultural context:{" "}
              <a
                href="https://www.visitlisboa.com/pt-pt/p/historic-neighbourhoods"
                target="_blank"
                rel="noreferrer"
              >
                Visit Lisboa neighbourhoods
              </a>
              ,{" "}
              <a
                href="https://www.visitlisboa.com/en/lisbon-stories/18-route-du-azulejo"
                target="_blank"
                rel="noreferrer"
              >
                azulejos
              </a>
              , and{" "}
              <a
                href="https://www.visitlisboa.com/en/lisbon-stories/1-fado-route"
                target="_blank"
                rel="noreferrer"
              >
                fado
              </a>
              . Reviewed {REVIEWED}.
            </span>
            <span>
              Current trip and up to four earlier trips stay on this browser. No
              automatic location tracking or cross-device trip storage. Your
              account uses a protected session; trips and pins stay in this
              browser, scoped to that account.
            </span>
          </div>
          {archive.length > 0 && (
            <div className="earlier-trips">
              <h3>Earlier chapters</h3>
              {archive.map((a) => (
                <button
                  className="setting"
                  key={a.id}
                  onClick={() => {
                    setArchive((all) =>
                      [trip!, ...all.filter((r) => r.id !== a.id)]
                        .filter(Boolean)
                        .slice(0, 4),
                    );
                    tripRef.current = a;
                    cancelTravelPreview();
                    setTrip(a);
                    setPanel("recap");
                  }}
                >
                  <BookOpen size={17} />
                  <span>
                    {a.setup.style} · {memories(a).length} memories
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          )}
          {trip && (
            <button className="danger-link" onClick={() => setPanel("clear")}>
              Delete all saved trips
            </button>
          )}
        </Dialog>
      )}
      {(panel === "new" || panel === "clear" || panel === "finish") && (
        <Dialog
          title={
            panel === "clear"
              ? "Leave no trace?"
              : panel === "finish"
                ? "Close this chapter?"
                : "A fresh little chapter?"
          }
          onClose={() => setPanel(null)}
        >
          <p className="lede">
            {panel === "clear"
              ? "This removes your current and earlier trips from this browser. You can download an itinerary first."
              : panel === "finish"
                ? "Your choices stay in the journal. Finish now and see your recap."
                : "Your current trip stays in Earlier chapters. You can return to it from Profile → Trip settings."}
          </p>
          <button
            className="primary full"
            onClick={() => {
              if (panel === "clear") {
                try {
                  localStorage.removeItem(storage.trips);
                } catch {
                  notify(
                    "Saved trips could not be deleted. Please check your browser storage settings.",
                  );
                  return;
                }
                tripRef.current = null;
                cancelTravelPreview();
                setTrip(null);
                setArchive([]);
                setStorageError(false);
                setPanel(null);
              } else if (panel === "finish") command({ kind: "finish" });
              else {
                setSetup({ ...initial });
                setPanel("setup");
              }
            }}
          >
            {panel === "clear"
              ? "Delete saved trips"
              : panel === "finish"
                ? "Finish & see recap"
                : "Set up a new trip"}
          </button>
          <button className="secondary full" onClick={() => setPanel(null)}>
            Keep roaming
          </button>
        </Dialog>
      )}
    </main>
  );
}

export default function Roam() {
  return (
    <AuthBoundary>
      {(user) => <RoamExperience key={user.id} user={user} />}
    </AuthBoundary>
  );
}
