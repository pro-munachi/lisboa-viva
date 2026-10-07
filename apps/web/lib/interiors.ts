import { GEOGRAPHIC_HOTSPOTS } from "./geography";
import type { WorldHotspot } from "./world-state";

export type InteriorKind = "home" | "cafe" | "gym" | "shop" | "museum" | "bar";

export type InteriorVisit = {
  id: string;
  name: string;
  kind: InteriorKind;
  sourceUrl?: string;
};

export type InteriorActivity = {
  id: string;
  label: string;
  actionLabel: string;
  description: string;
  result: string;
  /** Scene time only; these exploratory actions do not spend trip time or money. */
  durationMs?: number;
};

export const INTERIOR_LABELS: Record<InteriorKind, string> = {
  home: "Your Lisbon home",
  cafe: "Café scene",
  gym: "Fitness scene",
  shop: "Shop scene",
  museum: "Gallery scene",
  bar: "Bar scene",
};

const authoredMuseums = new Set(
  GEOGRAPHIC_HOTSPOTS.filter((hotspot) => hotspot.category === "museum").map(
    (hotspot) => hotspot.id,
  ),
);

/** A sourced venue category can open an original scene of that kind. Unknown
 * custom links, geocoded map locations, streets and viewpoints do not imply
 * an enterable business or a surveyed interior.
 */
export function interiorForHotspot(hotspot: WorldHotspot): InteriorKind | null {
  if (hotspot.custom || hotspot.mapLocation || hotspot.googlePlaceId)
    return null;
  if (authoredMuseums.has(hotspot.id)) return "museum";
  if (!hotspot.mapVenue) return null;
  switch (hotspot.category) {
    case "cafe":
    case "restaurant":
      return "cafe";
    case "gym":
      return "gym";
    case "shop":
      return "shop";
    case "culture":
      return "museum";
    case "bar":
      return "bar";
    default:
      return null;
  }
}

/** Zone IDs are shared with the 3D room props. All results describe this
 * imagined room, rather than a real venue's stock, services or transactions.
 */
export const INTERIOR_ACTIVITIES: Record<
  InteriorKind,
  readonly InteriorActivity[]
> = {
  home: [
    {
      id: "rest",
      label: "Rest corner",
      actionLabel: "Take a rest",
      description:
        "Settle on the sofa and take a quiet moment in your ROAM home.",
      result: "You rested on the sofa. There is time to enjoy the city slowly.",
      durationMs: 5000,
    },
    {
      id: "kitchen",
      label: "Kitchen",
      actionLabel: "Prepare breakfast",
      description:
        "Start your day at the little kitchen counter in this imagined home.",
      result: "A little breakfast prepared. Your Lisbon day can begin.",
      durationMs: 3200,
    },
    {
      id: "plan",
      label: "Map desk",
      actionLabel: "Study your map",
      description:
        "Visit the map desk and imagine your next route through the city.",
      result: "A moment to dream about the next street to explore.",
      durationMs: 3800,
    },
  ],
  cafe: [
    {
      id: "espresso",
      label: "Espresso bar",
      actionLabel: "Sip an espresso",
      description:
        "Pause at the counter for an espresso in this original café scene.",
      result:
        "A small espresso, a slower moment. You are ready for the next street.",
      durationMs: 3800,
    },
    {
      id: "pastry",
      label: "Pastry case",
      actionLabel: "Try a pastry",
      description:
        "Take a little pastry break at the display in this imagined café.",
      result: "A sweet little pause in your café visit.",
      durationMs: 3000,
    },
    {
      id: "table",
      label: "Café table",
      actionLabel: "Sit at the table",
      description: "Settle by a table and watch the room for a moment.",
      result: "You found your favourite table in this little café scene.",
      durationMs: 4200,
    },
  ],
  gym: [
    {
      id: "treadmill",
      label: "Treadmill",
      actionLabel: "Run on the treadmill",
      description:
        "Head to the treadmill corner for a short simulated warm-up.",
      result:
        "A short virtual run completed. Your city walk can wait a moment.",
      durationMs: 5000,
    },
    {
      id: "weights",
      label: "Free weights",
      actionLabel: "Lift weights",
      description: "Try a short virtual set at the free weights corner.",
      result: "A few controlled lifts, then a pause to catch your breath.",
      durationMs: 4500,
    },
    {
      id: "stretch",
      label: "Stretch mat",
      actionLabel: "Stretch",
      description: "Find some room for a gentle stretch in this scene.",
      result: "A moment to unwind before the next stop.",
      durationMs: 4500,
    },
  ],
  shop: [
    {
      id: "browse",
      label: "Clothes rail",
      actionLabel: "Browse the rails",
      description:
        "Visit the display rail and inspect the original collection.",
      result: "You took a closer look at the colours and textures on the rail.",
      durationMs: 3500,
    },
    {
      id: "try-on",
      label: "Mirror",
      actionLabel: "Check your outfit",
      description: "Check your ROAM outfit in the mirror area.",
      result: "A quick outfit check, then back to exploring.",
      durationMs: 4000,
    },
    {
      id: "counter",
      label: "Shop counter",
      actionLabel: "Look at the counter",
      description: "Step up to the counter and look at the little display.",
      result: "A last look at the display before returning to the street.",
      durationMs: 3000,
    },
  ],
  museum: [
    {
      id: "gallery",
      label: "Gallery wall",
      actionLabel: "Read the artwork",
      description:
        "Take a closer look at the forms and colours in this room’s original artwork.",
      result:
        "You noticed a new shape in the artwork. A closer look changes the scene.",
      durationMs: 4500,
    },
    {
      id: "tiles",
      label: "Tile study",
      actionLabel: "Study the tiles",
      description: "Look at the shapes in the room’s decorative tile panel.",
      result: "You noticed the rhythms and colours in the tiles.",
      durationMs: 4500,
    },
    {
      id: "bench",
      label: "Gallery bench",
      actionLabel: "Rest on the bench",
      description: "Take a quiet seat and look around this imagined gallery.",
      result: "A moment to take it all in.",
      durationMs: 4000,
    },
  ],
  bar: [
    {
      id: "listen",
      label: "Music corner",
      actionLabel: "Join the music corner",
      description:
        "Join the little music corner and watch the scene for a moment.",
      result:
        "You stayed with the music corner for a little while. The evening feels unhurried.",
      durationMs: 5000,
    },
    {
      id: "counter",
      label: "Bar counter",
      actionLabel: "Pause at the counter",
      description: "Take a moment at the counter in this original bar scene.",
      result: "A quiet pause at the bar, then back into the room.",
      durationMs: 3500,
    },
    {
      id: "lounge",
      label: "Lounge",
      actionLabel: "Relax in the lounge",
      description: "Find a seat in the lounge area and relax for a moment.",
      result: "You found a place to unwind.",
      durationMs: 4500,
    },
  ],
};
