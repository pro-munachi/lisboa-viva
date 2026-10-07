import {
  CONTENT_VERSION,
  choiceIndex,
  places,
  scenarios,
  stageAt,
  transport,
  routeFor,
  type PlaceId,
  type Style,
  type Mode,
  type Choice,
} from "./content";
import {
  CARD_COST,
  JOURNEY_HUBS,
  JOURNEY_PEOPLE,
  JOURNEY_ROUTES,
  initialJourney,
  journeyFor,
  type Persona,
  type Arrival,
  type JourneyState,
  type JourneyAction,
} from "./journey";
export const STORAGE_KEY = "roam.lisbon.trips.v1";
export type Interest =
  | "food"
  | "culture"
  | "nature"
  | "nightlife"
  | "wellness"
  | "community";
export type Accommodation = "hotel" | "hostel" | "apartment" | "coliving";
export type Setup = {
  days: number;
  budget: number;
  style: Style;
  base: "Graça" | "Baixa" | "Alfama";
  shirt: string;
  persona?: Persona;
  arrival?: Arrival;
  interests?: Interest[];
  startDate?: string;
  endDate?: string;
  accommodation?: Accommodation;
};
export type Command = { key: string; revision: number } & (
  | { kind: "choice"; choiceId: string }
  | { kind: "travel"; place: PlaceId; mode: Mode }
  | { kind: "rest" }
  | { kind: "night" }
  | { kind: "finish" }
  | ({ kind: "journey" } & JourneyAction)
);
export type Entry = {
  command: Command;
  day: number;
  start: number;
  end: number;
  place: PlaceId;
  title: string;
  outcome: string;
  cost: number;
  tag: Choice["tag"] | "travel" | "night" | "finish" | "journey";
  energy: number;
  inspiration: number;
  connection: number;
};
export type Trip = {
  id: string;
  version: string;
  setup: Setup;
  day: number;
  minute: number;
  place: PlaceId;
  energy: number;
  inspiration: number;
  connection: number;
  spent: number;
  revision: number;
  history: Entry[];
  complete: boolean;
  journey: JourneyState;
};
export const euro = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
export const time = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
function dateValue(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}
export function tripDateDuration(
  startDate: string,
  endDate: string,
): number | null {
  const start = dateValue(startDate),
    end = dateValue(endDate);
  if (start === null || end === null) return null;
  const days = (end - start) / 86_400_000;
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days : null;
}
export function validSetup(s: Setup): boolean {
  const validDates =
    (s?.startDate === undefined && s?.endDate === undefined) ||
    (s?.startDate !== undefined &&
      s?.endDate !== undefined &&
      tripDateDuration(s.startDate, s.endDate) === s.days);
  return (
    !!s &&
    Number.isInteger(s.days) &&
    s.days >= 1 &&
    s.days <= 30 &&
    Number.isInteger(s.budget) &&
    s.budget >= 30 &&
    s.budget <= 5000 &&
    ["Budget explorer", "Foodie", "Culture seeker"].includes(s.style) &&
    ["Graça", "Baixa", "Alfama"].includes(s.base) &&
    [
      "#ece7df",
      "#687f73",
      "#b47459",
      "#777791",
      "#456a86",
      "#ceab62",
      "#b9828f",
      "#454b4e",
    ].includes(s.shirt) &&
    (s.persona === undefined ||
      ["tourist", "nomad", "expat"].includes(s.persona)) &&
    (s.arrival === undefined ||
      ["airport", "station", "bus-stop", "home"].includes(s.arrival)) &&
    (s.accommodation === undefined ||
      ["hotel", "hostel", "apartment", "coliving"].includes(s.accommodation)) &&
    (s.interests === undefined ||
      (Array.isArray(s.interests) &&
        s.interests.length <= 6 &&
        new Set(s.interests).size === s.interests.length &&
        s.interests.every((interest) =>
          [
            "food",
            "culture",
            "nature",
            "nightlife",
            "wellness",
            "community",
          ].includes(interest),
        ))) &&
    validDates
  );
}
export function newTrip(setup: Setup, id: string): Trip {
  if (!validSetup(setup) || typeof id !== "string" || id.length > 100)
    throw new Error("Invalid trip setup");
  return {
    id,
    version: CONTENT_VERSION,
    setup: {
      ...setup,
      ...(setup.interests ? { interests: [...setup.interests] } : {}),
    },
    day: 1,
    minute: 540,
    place: "home",
    energy: 85,
    inspiration: 35,
    connection: 20,
    spent: 0,
    revision: 0,
    history: [],
    complete: false,
    journey: initialJourney(setup.arrival),
  };
}
export function availableScenarios(t: Trip) {
  if (journeyFor(t).phase !== "city" || journeyFor(t).hub) return [];
  const completed = new Set(
    t.history
      .filter((h) => h.command.kind === "choice")
      .map(
        (h) =>
          choiceIndex.get(
            (h.command as Extract<Command, { kind: "choice" }>).choiceId,
          )?.scenario.id,
      ),
  );
  return scenarios
    .filter(
      (s) =>
        s.place === t.place &&
        !completed.has(s.id) &&
        (s.stage === "any" || s.stage === stageAt(t.minute)),
    )
    .sort((a, b) => {
      const fav =
        t.setup.style === "Foodie"
          ? "food"
          : t.setup.style === "Culture seeker"
            ? "culture"
            : "discovery";
      return (
        Number(b.choices.some((c) => c.tag === fav)) -
        Number(a.choices.some((c) => c.tag === fav))
      );
    });
}
export function blocked(
  t: Trip,
  c: { cost: number; minutes: number; energy: number },
): string | null {
  if (t.complete) return "This trip is complete.";
  if (t.spent + c.cost > t.setup.budget) return "Above your remaining budget";
  if (t.minute + c.minutes > 1320) return "Not enough time before 22:00";
  if (t.energy + c.energy < 0) return "Rest first to restore your energy";
  return null;
}
export type JourneyPreview = {
  reason: string | null;
  title: string;
  outcome: string;
  cost: number;
  minutes: number;
  energy: number;
  inspiration: number;
  connection: number;
  place: PlaceId;
  journey: JourneyState;
  complete: boolean;
};
/** The UI and ledger share this validation; previewing never mutates a trip. */
export function previewJourney(t: Trip, action: JourneyAction): JourneyPreview {
  const current = journeyFor(t);
  const preview: JourneyPreview = {
    reason: null,
    title: "Transport encounter",
    outcome: "",
    cost: 0,
    minutes: 0,
    energy: 0,
    inspiration: 0,
    connection: 0,
    place: t.place,
    journey: {
      ...current,
      ticket: current.ticket ? { ...current.ticket } : null,
      talked: [...current.talked],
    },
    complete: false,
  };
  const fail = (reason: string) => ({ ...preview, reason });
  if (t.complete || current.phase === "departed")
    return fail("This trip is complete.");
  if (!action || typeof action.action !== "string")
    return fail("Choose a transport action.");
  if (current.ticket && action.action !== "board") {
    // Keep the authored amounts visible while the ready ticket locks the clock.
    if (action.action === "get-card") {
      preview.title = "Get a simulated transport card";
      preview.cost = CARD_COST;
      preview.minutes = 3;
    } else if (action.action === "book") {
      const route = JOURNEY_ROUTES.find((route) => route.id === action.routeId);
      if (route) {
        preview.title =
          route.mode === "walk" ? `Plan ${route.name}` : `Book ${route.name}`;
        preview.cost = route.cost;
        preview.minutes = route.mode === "flight" ? 5 : 3;
      }
    }
    return fail("Board your ready ticket before continuing.");
  }
  if (action.action === "visit-hub") {
    if (!Object.hasOwn(JOURNEY_HUBS, action.hub))
      return fail("Choose a mapped transport hub.");
    if (current.phase === "arriving")
      return fail("Continue into Lisbon from your arrival hub first.");
    if (current.hub === action.hub) return fail("You are already at this hub.");
    const hub = JOURNEY_HUBS[action.hub];
    preview.title = `Visit ${hub.name}`;
    preview.outcome =
      "You arrive at an original transport scene. This authored scene transfer has illustrative time and energy; it is not a real route instruction.";
    preview.minutes = 20;
    preview.energy = -4;
    preview.journey.hub = action.hub;
  } else if (action.action === "get-card") {
    preview.title = "Get a simulated transport card";
    preview.outcome =
      "Your ROAM transport card is ready for the simulated public-transport journeys. No real card or travel credit has been purchased.";
    preview.cost = CARD_COST;
    preview.minutes = 3;
    if (!current.hub) return fail("Visit a transport hub to get your card.");
    if (current.card)
      return fail("You already have your simulated transport card.");
    preview.journey.card = true;
  } else if (action.action === "book") {
    const route = JOURNEY_ROUTES.find((route) => route.id === action.routeId);
    if (!route) return fail("Choose a simulated route.");
    preview.title =
      route.mode === "walk" ? `Plan ${route.name}` : `Book ${route.name}`;
    preview.cost = route.cost;
    preview.minutes = route.mode === "flight" ? 5 : 3;
    preview.outcome =
      route.mode === "flight"
        ? `A simulated flight ticket is ready. ${euro(route.cost)} was charged to your game budget. No airline reservation or real flight exists.`
        : route.mode === "walk"
          ? "Your walking continuation is ready. Confirm it to begin your city chapter."
          : "One simulated ticket is ready. The game fare is charged now; board to apply the travel time and destination.";
    if (current.hub !== route.from)
      return fail("Book this route at its departure hub.");
    if (route.departure && current.phase === "arriving")
      return fail("Continue into Lisbon before booking a departure.");
    if (route.requiresCard && !current.card)
      return fail("Get your simulated transport card first.");
    const boardingReason = blocked(t, {
      cost: preview.cost,
      minutes: preview.minutes + route.minutes,
      energy: route.energy,
    });
    if (boardingReason) return fail(boardingReason);
    preview.journey.ticket = { routeId: route.id };
  } else if (action.action === "board") {
    const route = JOURNEY_ROUTES.find(
      (route) => route.id === current.ticket?.routeId,
    );
    if (!route) return fail("Book a simulated journey before boarding.");
    preview.title =
      route.mode === "walk" ? `Continue: ${route.name}` : `Board ${route.name}`;
    preview.minutes = route.minutes;
    preview.energy = route.energy;
    preview.outcome = route.departure
      ? "You board the imagined departure flight. Your simulated Lisbon chapter is complete; no real flight has been booked."
      : `You arrive in ${places[route.toPlace].district}. The journey and its duration are simulated.`;
    if (current.hub !== route.from)
      return fail("Your ticket belongs to another departure hub.");
    if (route.requiresCard && !current.card)
      return fail("Get your simulated transport card first.");
    preview.place = route.toPlace;
    preview.inspiration = 2;
    preview.connection = 1;
    preview.journey.ticket = null;
    preview.journey.hub = null;
    preview.journey.phase = route.departure ? "departed" : "city";
    preview.complete = !!route.departure;
  } else if (action.action === "talk") {
    const person = JOURNEY_PEOPLE.find(
      (person) => person.id === action.personId,
    );
    if (!person || person.hub !== current.hub)
      return fail("Meet this person at their transport hub.");
    preview.title = `Talk with ${person.name} · fictional ${person.role}`;
    preview.outcome = person.responses[t.setup.persona || "tourist"];
    preview.minutes = 6;
    preview.connection = 6;
    preview.inspiration = 2;
    if (current.talked.includes(person.id))
      return fail("You have already shared this conversation.");
    preview.journey.talked.push(person.id);
  } else return fail("Choose a transport action.");
  preview.reason = blocked(t, preview);
  return preview;
}
export function apply(t: Trip, cmd: Command): { trip: Trip; error?: string } {
  const fail = (error: string) => ({ trip: t, error });
  if (!cmd || typeof cmd.key !== "string" || !cmd.key || cmd.key.length > 100)
    return fail("Invalid action.");
  const previous = t.history.find((e) => e.command.key === cmd.key)?.command;
  if (previous) {
    const same =
      previous.kind === cmd.kind &&
      previous.revision === cmd.revision &&
      (cmd.kind !== "choice" ||
        (previous.kind === "choice" && previous.choiceId === cmd.choiceId)) &&
      (cmd.kind !== "travel" ||
        (previous.kind === "travel" &&
          previous.place === cmd.place &&
          previous.mode === cmd.mode));
    const sameJourney =
      cmd.kind !== "journey" ||
      (previous.kind === "journey" &&
        previous.action === cmd.action &&
        (cmd.action !== "visit-hub" ||
          (previous.action === "visit-hub" && previous.hub === cmd.hub)) &&
        (cmd.action !== "book" ||
          (previous.action === "book" && previous.routeId === cmd.routeId)) &&
        (cmd.action !== "talk" ||
          (previous.action === "talk" && previous.personId === cmd.personId)));
    return same && sameJourney
      ? { trip: t }
      : fail("This action key was already used for another choice.");
  }
  if (cmd.revision !== t.revision)
    return fail("Your trip has changed. Choose again.");
  if (t.complete) return fail("This trip is complete.");
  const currentJourney = journeyFor(t);
  if (
    currentJourney.ticket &&
    cmd.kind !== "finish" &&
    !(cmd.kind === "journey" && cmd.action === "board")
  )
    return fail("Board your ready ticket before continuing.");
  if (
    currentJourney.phase === "arriving" &&
    (cmd.kind === "choice" || cmd.kind === "travel" || cmd.kind === "night")
  )
    return fail("Continue into Lisbon from your arrival hub first.");
  let title = "",
    outcome = "",
    cost = 0,
    minutes = 0,
    energy = 0,
    inspiration = 0,
    connection = 0,
    tag: Entry["tag"] = "rest",
    place = t.place,
    day = t.day,
    minute = t.minute,
    complete = false,
    journey = currentJourney;
  if (cmd.kind === "journey") {
    const preview = previewJourney(t, cmd);
    if (preview.reason) return fail(preview.reason);
    ({
      title,
      outcome,
      cost,
      minutes,
      energy,
      inspiration,
      connection,
      place,
      journey,
      complete,
    } = preview);
    tag = "journey";
  } else if (cmd.kind === "choice") {
    const found = choiceIndex.get(cmd.choiceId);
    if (
      !found ||
      !availableScenarios(t).some((s) => s.id === found.scenario.id)
    )
      return fail("That experience is not available here right now.");
    ({ title, outcome, cost, minutes, energy, inspiration, connection, tag } =
      found.choice);
  } else if (cmd.kind === "travel") {
    if (
      !Object.hasOwn(places, cmd.place) ||
      !Object.hasOwn(transport, cmd.mode) ||
      cmd.place === t.place
    )
      return fail("Choose another place.");
    const route = routeFor(t.place, cmd.place, cmd.mode);
    if (!route)
      return fail(
        "This route is not available. Choose a train, walk, or cycle for Sintra.",
      );
    ({ cost, minutes, energy } = route);
    place = cmd.place;
    journey = { ...currentJourney, hub: null };
    tag = "travel";
    title = `${route.title} to ${places[place].name}`;
    outcome = `You arrive in ${places[place].district}. Travel cost and duration are illustrative.`;
  } else if (cmd.kind === "rest") {
    title = "A little time to recharge";
    outcome = "You take a quiet break. Rest belongs in the trip, too.";
    minutes = 30;
    energy = 20;
    inspiration = 3;
  } else if (cmd.kind === "night") {
    title =
      t.day === t.setup.days
        ? "Your last night in Lisbon"
        : "A good night’s rest";
    tag = "night";
    outcome =
      t.day === t.setup.days
        ? "Your simulated trip is complete. Your journal is ready."
        : "A fresh morning and a little more room for discovery.";
    complete = t.day === t.setup.days;
    energy = 85 - t.energy;
    place = "home";
    journey = { ...currentJourney, hub: null };
    if (!complete) {
      day++;
      minute = 540;
    } else minute = 1320;
  } else if (cmd.kind === "finish") {
    title = "Your Lisbon chapter";
    outcome = "You choose to finish your simulated trip here.";
    tag = "finish";
    complete = true;
  } else return fail("Unknown action.");
  const reason = blocked(t, { cost, minutes, energy });
  if (reason) return fail(reason);
  const entry: Entry = {
    command: { ...cmd },
    day: t.day,
    start: t.minute,
    end: cmd.kind === "night" ? 1320 : t.minute + minutes,
    place,
    title,
    outcome,
    cost,
    tag,
    energy,
    inspiration,
    connection,
  };
  return {
    trip: {
      ...t,
      day,
      minute: cmd.kind === "night" ? minute : t.minute + minutes,
      place,
      spent: t.spent + cost,
      energy: clamp(t.energy + energy),
      inspiration: clamp(t.inspiration + inspiration),
      connection: clamp(t.connection + connection),
      revision: t.revision + 1,
      history: [...t.history, entry],
      complete,
      journey,
    },
  };
}
export function serialize(t: Trip): string {
  return JSON.stringify({
    version: t.version,
    id: t.id,
    setup: t.setup,
    commands: t.history.map((e) => e.command),
  });
}
export function restore(raw: string): Trip | null {
  try {
    if (raw.length > 250000) return null;
    const saved = JSON.parse(raw);
    if (
      saved.version !== CONTENT_VERSION ||
      !Array.isArray(saved.commands) ||
      saved.commands.length > 500
    )
      return null;
    let trip = newTrip(saved.setup, saved.id);
    for (const cmd of saved.commands) {
      const next = apply(trip, cmd);
      if (next.error || next.trip === trip) return null;
      trip = next.trip;
    }
    return trip;
  } catch {
    return null;
  }
}
export const district = (t: Trip, p: PlaceId) =>
  p === "home" ? t.setup.base : places[p].district;
export const memories = (t: Trip) =>
  t.history.filter((h) => h.command.kind === "choice");
export const challenges = (t: Trip) => [
  {
    title: "Find your own Lisbon",
    description: "Discover three neighbourhoods",
    count: new Set(memories(t).map((h) => district(t, h.place))).size,
    target: 3,
  },
  {
    title: "A taste of the city",
    description: "Collect two food experiences",
    count: new Set(
      memories(t)
        .filter((h) => h.tag === "food")
        .map((h) => h.title),
    ).size,
    target: 2,
  },
  {
    title: "Make room for a pause",
    description: "Enjoy two restful moments",
    count: t.history.filter((h) => h.tag === "rest").length,
    target: 2,
  },
];
export function itinerary(t: Trip): string {
  return [
    "ROAM · YOUR SIMULATED LISBON ITINERARY",
    `${t.setup.days}-day ${t.setup.style.toLowerCase()} trip · Home base: ${t.setup.base}`,
    `Simulated spend ${euro(t.spent)} / ${euro(t.setup.budget)} activity budget`,
    t.history.some((h) => {
      const command = h.command;
      return (
        command.kind === "journey" &&
        command.action === "book" &&
        JOURNEY_ROUTES.find((route) => route.id === command.routeId)?.departure
      );
    })
      ? "Simulated departure flight charges are included in the game spend. Accommodation is excluded. All costs/times illustrative. Nothing booked or confirmed."
      : "Flights and accommodation excluded. All costs/times illustrative. Nothing booked or confirmed.",
    "Fictional venues are ideas to research, not real booking recommendations.",
    "",
    ...t.history
      .filter((h) => !["night", "finish"].includes(h.tag))
      .map(
        (h) =>
          `Day ${h.day} · ${time(h.start)}–${time(h.end)} · ${h.title}\n${district(t, h.place)} · ${euro(h.cost)} · ${h.outcome}${places[h.place].fictional ? "\nFictional venue. Research an equivalent before visiting." : ""}`,
      ),
  ].join("\n\n");
}
