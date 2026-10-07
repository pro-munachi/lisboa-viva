"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
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
import Dialog from "../components/Dialog";
import {
  places,
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
} from "../lib/engine";
const colors = ["#ece7df", "#687f73", "#b47459", "#777791"];
const styles: Style[] = ["Budget explorer", "Foodie", "Culture seeker"];
const initial: Setup = {
  days: 3,
  budget: 300,
  style: "Culture seeker",
  base: "Graça",
  shirt: colors[0],
};
type Panel =
  | "setup"
  | "travel"
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
  })[id];
export default function Roam() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const tripRef = useRef<Trip | null>(null);
  tripRef.current = trip;
  const [loaded, setLoaded] = useState(false);
  const [archive, setArchive] = useState<Trip[]>([]);
  const [setup, setSetup] = useState<Setup>(initial);
  const [panel, setPanel] = useState<Panel>(null);
  const [destination, setDestination] = useState<PlaceId | null>(null);
  const [mode, setMode] = useState<Mode>("walk");
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<Choice | null>(null);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      | { kind: "rest" | "night" | "finish" },
  ) {
    const current = tripRef.current;
    if (!current) return;
    const result = apply(current, {
      ...action,
      key: crypto.randomUUID(),
      revision: trip?.revision ?? -1,
    } as Command);
    if (result.error) {
      notify(result.error);
      return;
    }
    tripRef.current = result.trip;
    setTrip(result.trip);
    setPending(null);
    setSelected("");
    notify(result.trip.history.at(-1)?.outcome || "Your trip is updated.");
    if (result.trip.complete) setPanel("recap");
  }
  function begin() {
    try {
      const next = newTrip(setup, crypto.randomUUID());
      if (trip) setArchive((a) => [trip, ...a].slice(0, 4));
      tripRef.current = next;
      setTrip(next);
      setPanel(null);
      setSelected("");
      notify("Welcome to your little Lisbon. Make it yours.");
    } catch {
      notify("Choose a budget between €30 and €5,000.");
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
    setDestination(null);
    setPanel("travel");
  };
  function selectObject(id: string) {
    const found = available.find((s) => s.object === id);
    if (found) setSelected(found.id);
    else if (trip)
      notify("Use the experience cards to explore what’s available right now.");
  }
  const visited = trip
    ? new Set(memories(trip).map((h) => h.place))
    : new Set<PlaceId>();
  return (
    <main className="app-shell">
      <div className="game">
        <World
          place={place}
          shirt={trip?.setup.shirt || setup.shirt}
          onSelect={selectObject}
        />
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
              <span className="eyebrow">YOUR FIRST DESTINATION</span>
              <span>
                <MapPin size={14} /> {setup.base}, Lisbon
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
                  <Compass size={15} /> 3 or 5 days
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
              <span>YOUR LITTLE LOFT</span>
              <p>A soft landing in the city of seven hills.</p>
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
                    : "Explore, pause, and collect a few memories."}
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
                {places[place].name} <b>·</b> {placeDistrict}
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
              {trip.complete ? (
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
                  <strong>You, in Lisbon</strong>
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
              Click the floor to walk.
              <br />
              Choose an object, or use the experience cards.
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
              <legend>How long are you staying?</legend>
              <div className="segments">
                {([3, 5] as const).map((days) => (
                  <button
                    type="button"
                    key={days}
                    aria-pressed={setup.days === days}
                    onClick={() => setSetup((s) => ({ ...s, days }))}
                  >
                    {days} days{" "}
                    <small>
                      {days === 3 ? "A little escape" : "Room to wander"}
                    </small>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <label>
                Your activity budget (€)
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
              Food, local transport, and experiences. Flights and accommodation
              are excluded. Your fictional loft is your base in {setup.base};
              travel estimates are simplified.
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
                    aria-label={["Cream", "Sage", "Terracotta", "Slate"][i]}
                    aria-pressed={setup.shirt === shirt}
                    onClick={() => setSetup((s) => ({ ...s, shirt }))}
                  >
                    {setup.shirt === shirt && <Check size={18} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <button className="primary full" type="submit">
              Let’s roam <ArrowRight size={18} />
            </button>
            <small className="quiet">
              Private, same-browser progress. Clearing browser storage removes
              your trips.
            </small>
          </form>
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
                Six corners of Lisbon. Each with its own rhythm.
              </p>
              <div className="destinations">
                {(Object.keys(places) as PlaceId[]).map((id) => {
                  const p = places[id];
                  const Icon = iconFor(id);
                  return (
                    <button
                      className="destination"
                      key={id}
                      disabled={id === trip.place || trip.complete}
                      onClick={() => setDestination(id)}
                    >
                      <span
                        className="destination-art"
                        style={{ background: p.color }}
                      >
                        <Icon size={28} />
                        <span>{visited.has(id) ? "DISCOVERED" : "LISBON"}</span>
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
                Original miniature scenes. Venues and characters are
                illustrative.
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
                    disabled={!!blocked(trip, transport[m])}
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                  >
                    {transport[m].title}
                    <small>
                      {euro(transport[m].cost)} · {transport[m].minutes} min
                    </small>
                  </button>
                ))}
              </div>
              <p className="quiet">
                Simplified travel estimates, including walks in Belém. These are
                not live fares, routes, or timetables.
              </p>
              {blocked(trip, transport[mode]) && (
                <p role="status">{blocked(trip, transport[mode])}</p>
              )}
              <button
                className="primary full"
                disabled={!!blocked(trip, transport[mode]) || trip.complete}
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
                    : "An imagined scene in a real neighbourhood"}
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
              30 authored scenarios · 6 miniature scenes. Energy, inspiration,
              and connection are game meters. Inês, Tomás, and Noor are
              fictional characters. Multiplayer is planned for a later release.
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
