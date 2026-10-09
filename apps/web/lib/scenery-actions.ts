import type { ScenerySnapshot } from "./scenery-client";

export function sceneryFineSummary(
  snapshot: ScenerySnapshot | null,
  compact = false,
): string {
  if (!snapshot) return "Check city wallet";
  const pending = snapshot.fines.filter((fine) => !fine.settled).length;
  if (!pending) return compact ? "All clear" : "No pending game fines";
  return compact
    ? `${pending} to settle`
    : `${pending} simulated ${pending === 1 ? "fine" : "fines"} to settle`;
}

export type SceneryObject = {
  id: string;
  kind: string;
  name: string;
  x: number;
  y?: number;
  z: number;
  angle?: number;
  radius?: number;
  source?: string;
  species?: string;
  speciesSource?: string;
  fruitBearing?: boolean;
};
export type SceneryAction = {
  id: string;
  label: string;
  emoji: string;
  points: number;
  detail: string;
  fineCents?: number;
};
export const SCENERY_GRAPHICS: Record<string, string> = {
  bench: "🪑",
  tree: "🌳",
  flowers: "🌸",
  bin: "♻️",
  fountain: "💧",
  bike_rack: "🚲",
  bus_stop: "🚏",
  crosswalk: "🚦",
  lamp: "💡",
  street_sign: "🪧",
};
const actions: Record<string, SceneryAction[]> = {
  bench: [
    {
      id: "sit",
      label: "Sit & watch the city",
      emoji: "🪑",
      points: 5,
      detail: "Take a seat and a little breather.",
    },
    {
      id: "relax",
      label: "Pause & relax",
      emoji: "🧘",
      points: 5,
      detail: "Let the city pass you by.",
    },
  ],
  tree: [
    {
      id: "identify",
      label: "Meet this tree",
      emoji: "🌿",
      points: 5,
      detail: "Discover its species and character.",
    },
    {
      id: "climb",
      label: "Try climbing",
      emoji: "🧗",
      points: 2,
      fineCents: 500,
      detail: "A cheeky move: a simulated €5 park fine.",
    },
  ],
  flowers: [
    {
      id: "identify",
      label: "Admire the flowers",
      emoji: "🌼",
      points: 5,
      detail: "A little colour, a little discovery.",
    },
    {
      id: "pick-flower",
      label: "Pick a flower",
      emoji: "🌸",
      points: 2,
      fineCents: 300,
      detail: "These are shared: a simulated €3 park fine.",
    },
  ],
  bin: [
    {
      id: "recycle",
      label: "Recycle & tidy up",
      emoji: "♻️",
      points: 10,
      detail: "Leave this corner a little nicer.",
    },
  ],
  fountain: [
    {
      id: "drink",
      label: "Take a water break",
      emoji: "💧",
      points: 5,
      detail: "Refresh your character.",
    },
  ],
  bike_rack: [
    {
      id: "check-bikes",
      label: "Check the bike parking",
      emoji: "🚲",
      points: 5,
      detail: "Discover a way to explore on two wheels.",
    },
  ],
  bus_stop: [
    {
      id: "read-timetable",
      label: "Check the stop",
      emoji: "🚏",
      points: 5,
      detail: "Get your bearings. This is a simulated stop.",
    },
  ],
  crosswalk: [
    {
      id: "cross-safely",
      label: "Wait & check the crossing",
      emoji: "🚦",
      points: 5,
      detail: "Pause at the pavement and look for traffic.",
    },
  ],
  lamp: [
    {
      id: "observe",
      label: "Enjoy the street lights",
      emoji: "✨",
      points: 5,
      detail: "See this street in a different light.",
    },
  ],
  street_sign: [
    {
      id: "read-sign",
      label: "Read the street name",
      emoji: "🪧",
      points: 5,
      detail: "Get to know this little corner of Lisbon.",
    },
  ],
};
export function sceneryActions(object: SceneryObject): SceneryAction[] {
  const list = actions[object.kind] || [];
  return object.kind === "tree" && object.fruitBearing
    ? [
        ...list,
        {
          id: "pick-fruit",
          label: "Pick some fruit",
          emoji: "🫒",
          points: 2,
          fineCents: 200,
          detail: "Public planting: a simulated €2 park fine.",
        },
      ]
    : list;
}
export function sceneryDescription(object: SceneryObject): string {
  if (object.kind === "tree")
    return object.species
      ? `${object.species}. ${object.speciesSource === "mapped" ? "Species recorded in the map data." : "An illustrated species in ROAM’s Lisbon planting."}`
      : "A city tree. The source map does not identify its species.";
  return object.source === "mapped"
    ? "A little discovery from the city map."
    : "A little discovery in your ROAM city.";
}

export class SceneryActionGate {
  busy = false;
  pending: { key: string; requestId: string; arrived: boolean } | null = null;
  start(objectId: string, actionId: string, makeId: () => string) {
    const key = `${objectId}|${actionId}`;
    if (this.busy || (this.pending && this.pending.key !== key)) return null;
    this.busy = true;
    this.pending ||= { key, requestId: makeId(), arrived: false };
    return this.pending;
  }
  arrive(requestId: string) {
    if (this.pending?.requestId === requestId) this.pending.arrived = true;
  }
  finish(requestId: string, keepPending = false) {
    if (this.pending?.requestId !== requestId) return;
    if (!keepPending) this.pending = null;
    this.busy = false;
  }
  lockSettlement() {
    if (this.busy) return false;
    this.busy = true;
    return true;
  }
  unlockSettlement() {
    this.busy = false;
  }
}

export function definitiveSceneryFailure(code: string) {
  return [
    "invalid_json",
    "invalid_scenery_action",
    "scenery_conflict",
    "scenery_cooldown",
    "scenery_fines_full",
    "session_expired",
    "forbidden",
  ].includes(code);
}

export function mergeSceneryState(
  current: ScenerySnapshot | null,
  incoming: ScenerySnapshot,
): ScenerySnapshot {
  const fines = new Map((current?.fines || []).map((fine) => [fine.id, fine]));
  for (const fine of incoming.fines) {
    const old = fines.get(fine.id);
    fines.set(fine.id, {
      ...fine,
      settled: Boolean(fine.settled || old?.settled),
    });
  }
  return {
    totalPoints: Math.max(current?.totalPoints || 0, incoming.totalPoints),
    fines: [...fines.values()]
      .sort((a, b) => Number(Boolean(a.settled)) - Number(Boolean(b.settled)))
      .slice(0, 100),
  };
}
