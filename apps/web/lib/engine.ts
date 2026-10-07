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
export const STORAGE_KEY = "roam.lisbon.trips.v1";
export type Setup = {
  days: 3 | 5;
  budget: number;
  style: Style;
  base: "Graça" | "Baixa" | "Alfama";
  shirt: string;
};
export type Command = { key: string; revision: number } & (
  | { kind: "choice"; choiceId: string }
  | { kind: "travel"; place: PlaceId; mode: Mode }
  | { kind: "rest" }
  | { kind: "night" }
  | { kind: "finish" }
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
  tag: Choice["tag"] | "travel" | "night" | "finish";
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
};
export const euro = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
export const time = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function validSetup(s: Setup): boolean {
  return (
    !!s &&
    [3, 5].includes(s.days) &&
    Number.isInteger(s.budget) &&
    s.budget >= 30 &&
    s.budget <= 5000 &&
    ["Budget explorer", "Foodie", "Culture seeker"].includes(s.style) &&
    ["Graça", "Baixa", "Alfama"].includes(s.base) &&
    ["#ece7df", "#687f73", "#b47459", "#777791"].includes(s.shirt)
  );
}
export function newTrip(setup: Setup, id: string): Trip {
  if (!validSetup(setup) || typeof id !== "string" || id.length > 100)
    throw new Error("Invalid trip setup");
  return {
    id,
    version: CONTENT_VERSION,
    setup: { ...setup },
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
  };
}
export function availableScenarios(t: Trip) {
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
    return same
      ? { trip: t }
      : fail("This action key was already used for another choice.");
  }
  if (cmd.revision !== t.revision)
    return fail("Your trip has changed. Choose again.");
  if (t.complete) return fail("This trip is complete.");
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
    complete = false;
  if (cmd.kind === "choice") {
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
    "Flights and accommodation excluded. All costs/times illustrative. Nothing booked or confirmed.",
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
