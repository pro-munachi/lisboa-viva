"use client";
import { useEffect, useRef, useState, useMemo } from "react";
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
  Search,
  Eye,
  EyeOff,
  Moon,
  Music,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Wallet,
  Waves,
  Zap,
} from "lucide-react";
import World from "../components/World";
import AuthBoundary from "../components/AuthBoundary";
import { interiorForHotspot, type InteriorVisit } from "../lib/interiors";
import Dialog from "../components/Dialog";
import JourneyPanel from "../components/JourneyPanel";
import TripCalendar from "../components/TripCalendar";
import TripRecommendations from "../components/TripRecommendations";
import {
  JOURNEY_HUBS,
  JOURNEY_PERSONAS,
  type Arrival,
  type HubId,
  type JourneyAction,
  type Persona,
} from "../lib/journey";
import { searchMapLocations } from "../lib/map-locations";
import { resolveGoogleMapsLink } from "../lib/map-link";
import { GEOGRAPHIC_HOTSPOTS } from "../lib/geography";
import {
  VENUES,
  VENUE_CATEGORY_LABELS,
  type VenueCategory,
} from "../lib/venues";
import {
  focusFor,
  placeFocus,
  fromGeographic,
  fromVenue,
  mapLinkPin,
  restorePins,
  PIN_KEY,
  areaPlace,
  type WorldFocus,
  type WorldHotspot,
} from "../lib/world-state";
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
} from "../lib/content";
import {
  apply,
  availableScenarios,
  blocked,
  challenges,
  euro,
  itinerary,
  memories,
  newTrip,
  restore,
  serialize,
  STORAGE_KEY,
  time,
  type Trip,
  type Setup,
  type Command,
  type Interest,
  type Accommodation,
} from "../lib/engine";
const colors = [
  "#ece7df",
  "#687f73",
  "#b47459",
  "#777791",
  "#456a86",
  "#ceab62",
  "#b9828f",
  "#454b4e",
];
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
  | null;
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
function RoamExperience() {
  const [mapFocus, setMapFocus] = useState<WorldFocus>(placeFocus.cais);
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
  const [interior, setInterior] = useState<InteriorVisit | null>(null);
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
  const tripRef = useRef<Trip | null>(null);
  tripRef.current = trip;
  const [loaded, setLoaded] = useState(false);
  const [archive, setArchive] = useState<Trip[]>([]);
  const [setup, setSetup] = useState<Setup>(initial);
  const [calendarValid, setCalendarValid] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [destination, setDestination] = useState<PlaceId | null>(null);
  const [mode, setMode] = useState<Mode>("walk");
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<Choice | null>(null);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (raw) setPins(restorePins(raw));
    } catch {}
  }, []);
  useEffect(() => {
    if (!trip) return;
    if (trip.journey.hub) {
      const hub = JOURNEY_HUBS[trip.journey.hub];
      setMapFocus({ ...hub, range: 140 });
    } else setMapFocus(focusFor(trip.place, trip.setup.base));
  }, [trip?.place, trip?.setup.base, trip?.journey.hub]);
  function pickHotspot(h: WorldHotspot) {
    setInterior(null);
    setMapHotspot(h);
    setMapFocus({ ...h, range: 140 });
    setPanel("hotspot");
  }
  function enterRoom(visit: InteriorVisit) {
    if (!interior) beforeInterior.current = clean;
    setInterior(visit);
    setClean(true);
    setPanel(null);
  }
  function leaveRoom() {
    setInterior(null);
    setClean(beforeInterior.current);
  }
  function enterHome() {
    setMapFocus(focusFor("home", trip?.setup.base || setup.base));
    enterRoom({
      id: "home",
      kind: "home",
      name: `Your ${trip?.setup.accommodation || setup.accommodation || "apartment"} · ${trip?.setup.base || setup.base}`,
    });
  }
  function enterTransitHub(id: HubId) {
    const hub = JOURNEY_HUBS[id];
    setMapFocus({ ...hub, range: 140 });
    enterRoom({
      id: `transit-${id}`,
      kind: hub.kind,
      name: hub.name,
      sourceUrl: hub.sourceUrl,
    });
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
        localStorage.setItem(PIN_KEY, JSON.stringify(next));
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
    if (trip?.journey.phase === "arriving") return "Continue into the city from your arrival hub first.";
    if (trip?.journey.ticket) return "Board your ready ticket before continuing.";
    if (trip && destination === trip.place) return "You are already in this chapter.";
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const runs = JSON.parse(raw);
        if (!Array.isArray(runs) || runs.length > 5) throw new Error();
        const restored = runs.map((r) =>
          typeof r === "string" ? restore(r) : null,
        );
        if (restored.some((t) => !t)) throw new Error();
        setTrip(restored[0]);
        setArchive(restored.slice(1) as Trip[]);
      }
    } catch {
      setNotice(
        "Your saved trip could not be read. Start a fresh trip; the old save stays untouched until you begin.",
      );
      setStorageError(true);
    }
    setLoaded(true);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!loaded || !trip) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([trip, ...archive].slice(0, 5).map(serialize)),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [trip, archive, loaded]);
  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
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
  function command(
    action:
      | Omit<Extract<Command, { kind: "travel" }>, "key" | "revision">
      | Omit<Extract<Command, { kind: "choice" }>, "key" | "revision">
      | ({ kind: "journey" } & JourneyAction)
      | { kind: "rest" | "night" | "finish" },
  ) {
    const current = tripRef.current;
    if (!current) return false;
    const result = apply(current, {
      ...action,
      key: crypto.randomUUID(),
      revision: current.revision,
    } as Command);
    if (result.error) {
      notify(result.error);
      return false;
    }
    tripRef.current = result.trip;
    setTrip(result.trip);
    setPending(null);
    setSelected("");
    notify(result.trip.history.at(-1)?.outcome || "Your trip is updated.");
    if (action.kind === "journey" && action.action === "board") {
      leaveRoom();
      setClean(false);
      setPanel(null);
    }
    if (result.trip.complete) setPanel("recap");
    return true;
  }
  function begin() {
    try {
      const next = newTrip({ ...setup, startDate: calendarStart, endDate: calendarEnd }, crypto.randomUUID());
      if (trip) setArchive((a) => [trip, ...a].slice(0, 4));
      tripRef.current = next;
      setTrip(next);
      setPanel(next.journey.phase === "arriving" ? "journey" : null);
      setSelected("");
      notify("Welcome to your little Lisbon. Make it yours.");
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
  return (
    <main className="app-shell">
      <div className={clean ? "game clean-world" : "game"}>
        <World
          focus={mapFocus}
          shirt={trip?.setup.shirt || setup.shirt}
          hotspots={worldHotspots}
          onHotspot={pickHotspot}
          interior={interior}
          minute={trip?.minute}
          onExitInterior={leaveRoom}
          onTransitAction={() => {
            if (trip) setPanel("journey");
            else setPanel("setup");
          }}
        />
        <div className="map-tools">
          <button onClick={() => setPanel(trip ? "journey" : "setup")}>
            <Ticket size={16} /> {trip ? "Your journey" : "Arrive in Lisbon"}
          </button>
          <button onClick={() => setPanel("map-search")}>
            <Search size={16} /> Find a hotspot
          </button>
          <button onClick={enterHome}>
            <Home size={16} /> Your home
          </button>
          {!interior && (
            <button onClick={() => setClean((v) => !v)}>
              {clean ? <Eye size={16} /> : <EyeOff size={16} />}{" "}
              {clean ? "Show trip" : "Clean screen"}
            </button>
          )}
          <span>
            {interior
              ? `INSIDE ${interior.name.toUpperCase()}`
              : `VIEWING ${mapFocus.name.toUpperCase()}`}
          </span>
        </div>
        <header className="topbar">
          <a className="brand" href="/" aria-label="ROAM home">
            ROAM<span>LISBON. YOUR WAY.</span>
          </a>
          {trip ? (
            <div className="clock">
              <Sun size={18} />
              <span>
                DAY {String(trip.day).padStart(2, "0")} <b>·</b>{" "}
                {time(trip.minute)}
              </span>
              <span className="mood">
                {trip.complete ? "Your chapter, complete" : mood}
              </span>
            </div>
          ) : (
            <div className="clock intro-clock">
              <Sun size={18} />
              <span>A CITY TO TRY BEFORE YOU GO</span>
            </div>
          )}
          <button className="wallet" onClick={() => setPanel("pocket")}>
            <Wallet size={18} />
            <span>
              {trip ? euro(trip.setup.budget - trip.spent) : "Meet ROAM"}
            </span>
          </button>
        </header>
        {!trip ? (
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
                Try the city before you go. Find your favourite corners, make a
                few memories, and discover a trip that feels like you.
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
                Free to play · No account needed · Saved on this browser
              </small>
            </section>
            <div className="scene-caption">
              <span>STREETS. HILLS. EVERYDAY LIFE.</span>
              <p>Drag, rotate, and find your own Lisbon.</p>
            </div>
          </>
        ) : (
          <>
            <aside className="missions card">
              <div className="mission-symbol">
                <Compass size={20} />
              </div>
              <div>
                <strong>
                  {trip.complete
                    ? "A chapter worth keeping"
                    : "Find your own Lisbon"}
                </strong>
                <p>
                  {trip.complete
                    ? `${memories(trip).length} memories in your journal`
                    : trip.journey.phase === "arriving"
                      ? "You have landed. Your first city journey starts here."
                      : JOURNEY_PERSONAS[trip.setup.persona || "tourist"]
                          .missions[0].detail}
                </p>
                <button
                  className="text-button"
                  onClick={() => setPanel("journal")}
                >
                  Your district passport <ChevronRight size={13} />
                </button>
              </div>
            </aside>
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
            <nav className="nav card" aria-label="Game navigation">
              <button
                onClick={() => {
                  if (place === "home") setPanel(null);
                  else {
                    setDestination("home");
                    setPanel("travel");
                  }
                }}
                aria-pressed={place === "home" && !panel}
              >
                <Home />
                <span>Home</span>
              </button>
              <button onClick={openTravel} aria-pressed={panel === "travel"}>
                <Map />
                <span>Travel</span>
              </button>
              <button
                onClick={() => setPanel("journal")}
                aria-pressed={panel === "journal"}
              >
                <BookOpen />
                <span>Journal</span>
              </button>
              <button
                onClick={() => setPanel("pocket")}
                aria-pressed={panel === "pocket"}
              >
                <Settings />
                <span>Pocket</span>
              </button>
            </nav>
            <section
              className="interaction card"
              aria-label="Available experiences"
            >
              {(trip.journey.phase === "arriving" || trip.journey.ticket) && !trip.complete ? (
                <>
                  <span className="eyebrow">YOUR ARRIVAL CHAPTER</span>
                  <h2>{trip.journey.ticket ? "Your ticket is ready." : "Welcome to Lisbon."}</h2>
                  <p>
                    {trip.journey.ticket
                      ? "Your fare is already covered. Board from your travel hub to continue your journey."
                      : "Get your transport card, choose your first journey, and find your way into the city."}
                  </p>
                  <button
                    className="primary"
                    onClick={() => setPanel("journey")}
                  >
                    {trip.journey.ticket ? "Return to boarding" : "Continue your arrival"} <Plane size={17} />
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
                  <button className="primary" onClick={() => setPanel("recap")}>
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
                        {blocked(trip, c) && <small>{blocked(trip, c)}</small>}
                      </button>
                    ))}
                  </div>
                  <div className="scenario-tabs" aria-label="More experiences">
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
                      Your evening is winding down. Rest overnight to continue.
                    </p>
                  )}
                </>
              )}
            </section>
            <section className="needs card" aria-label="Your traveller">
              <div className="traveller">
                <span className="face" style={{ background: trip.setup.shirt }}>
                  ✦
                </span>
                <div>
                  <strong>
                    {JOURNEY_PERSONAS[trip.setup.persona || "tourist"].name}, in
                    Lisbon
                  </strong>
                  <small>
                    {trip.setup.style} · {trip.setup.days} days
                  </small>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setPanel("pocket")}
                  aria-label="Trip settings"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="meters">
                {[
                  ["Energy", trip.energy, Zap],
                  ["Inspiration", trip.inspiration, Sparkles],
                  ["Connection", trip.connection, Heart],
                ].map(([label, value, Icon]) => {
                  const MeterIcon = Icon as typeof Zap;
                  return (
                    <div key={label as string} className="meter">
                      <div>
                        <span>
                          <MeterIcon size={12} />
                          {label as string}
                        </span>
                        <span>{value as number}%</span>
                      </div>
                      <meter
                        min={0}
                        max={100}
                        value={value as number}
                        aria-label={label as string}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="world-tip">
              Drag to rotate · Scroll to zoom.
              <br />
              Tap an icon to explore a place.
            </div>
          </>
        )}
        <footer className="game-footnote">
          ROAM · SIMULATED TRIPS & FICTIONAL CHARACTERS
        </footer>
        {storageError && (
          <div className="save-warning" role="alert">
            {trip
              ? "Saving is unavailable. Keep this tab open and download your itinerary before leaving."
              : "Your previous save needs attention. A new trip will replace it."}
          </div>
        )}
        <div
          className="toast"
          role="status"
          aria-live="polite"
          hidden={!notice}
        >
          {notice}
        </div>
      </div>
      <div className="below-game">
        <span>Try a city. Find your rhythm.</span>
        <span>Lisbon pilot · Illustrative costs · Europe/Lisbon time</span>
      </div>
      {panel === "map-search" && (
        <Dialog title="Find your Lisbon." onClose={() => setPanel(null)} wide>
          <p className="lede">
            Landmarks, cafés, gyms and local spots across one connected Lisbon
            region.
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
                    <MapPin size={17} />
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
                enterRoom({
                  id: mapHotspot.id,
                  name: mapHotspot.name,
                  kind: interiorForHotspot(mapHotspot)!,
                  sourceUrl: mapHotspot.sourceUrl,
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
              onClick={() => enterTransitHub(transitHubFor(mapHotspot)!.id)}
            >
              {transitHubFor(mapHotspot)!.kind === "bus-stop"
                ? "Stand at the bus stop"
                : `Enter ${transitHubFor(mapHotspot)!.kind === "station" ? "train station" : "airport"}`}{" "}
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
                  if (trip.journey.phase === "arriving" || trip.journey.ticket) {
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
                  localStorage.setItem(PIN_KEY, JSON.stringify(next));
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
              <legend>Your traveller’s colour</legend>
              <div className="swatches">
                {colors.map((shirt, i) => (
                  <button
                    type="button"
                    key={shirt}
                    style={{ background: shirt }}
                    aria-label={
                      [
                        "Cream",
                        "Sage",
                        "Terracotta",
                        "Slate",
                        "Tile blue",
                        "Ochre",
                        "Rose",
                        "Charcoal",
                      ][i]
                    }
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
            onCommand={(action) => command({ kind: "journey", ...action })}
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
                !trip.complete && id !== trip.place
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
        <Dialog title="In your pocket." onClose={() => setPanel(null)}>
          <p className="lede">A little more about your world.</p>
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
              Tomás, and Noor are fictional characters. Multiplayer is planned
              for a later release.
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
              account, tracking, location collection, or server trip storage.
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
                : "Your current trip stays in Earlier chapters. You can return to it from Pocket."}
          </p>
          <button
            className="primary full"
            onClick={() => {
              if (panel === "clear") {
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {
                  notify(
                    "Saved trips could not be deleted. Please check your browser storage settings.",
                  );
                  return;
                }
                tripRef.current = null;
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
      <RoamExperience />
    </AuthBoundary>
  );
}
