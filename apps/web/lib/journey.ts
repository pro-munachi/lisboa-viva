import type { PlaceId } from "./content";

export type Persona = "tourist" | "nomad" | "expat";
export type Arrival = "airport" | "station" | "bus-stop" | "home";
export type HubId = "airport" | "rossio" | "cais-bus";
export type JourneyState = {
  phase: "arriving" | "city" | "departed";
  hub: HubId | null;
  card: boolean;
  ticket: { routeId: string } | null;
  talked: string[];
};
export type JourneyAction =
  | { action: "visit-hub"; hub: HubId }
  | { action: "get-card" }
  | { action: "book"; routeId: string }
  | { action: "board" }
  | { action: "talk"; personId: string };
export type JourneyHub = {
  id: HubId;
  name: string;
  kind: "airport" | "station" | "bus-stop";
  lat: number;
  lng: number;
  category: "transport";
  mapsUrl: string;
  sourceUrl: string;
  coordinateSource: string;
  description: string;
};

const airportSource =
  "https://www.aeroportolisboa.pt/en/lis/access-parking/getting-to-and-from-the-airport/public-transportation";
const railSource = "https://www.cp.pt/info/en/w/institucional/the-sintra-line";
const busSource = "https://www.carris.pt/en/travel/carreiras/758/";
export const CARD_SOURCE =
  "https://www.metrolisboa.pt/comprar/cartao-navegante-ocasional/";
export const CARD_COST = 0.5;
export const JOURNEY_NOTE =
  "Original transport scenes with simulated fares, travel times and bookings. Nothing is purchased, reserved or scheduled with a real operator.";
function hub(
  id: HubId,
  name: string,
  kind: JourneyHub["kind"],
  lat: number,
  lng: number,
  sourceUrl: string,
  coordinateSource: string,
  description: string,
): JourneyHub {
  return {
    id,
    name,
    kind,
    lat,
    lng,
    category: "transport",
    sourceUrl,
    coordinateSource,
    description,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng} (${name})`)}`,
  };
}
export const JOURNEY_HUBS: Record<HubId, JourneyHub> = {
  airport: hub(
    "airport",
    "Lisbon Airport · Terminal 1",
    "airport",
    38.77173,
    -9.130666,
    airportSource,
    "https://www.openstreetmap.org/way/17651166",
    "Begin in an original arrivals hall anchored to the mapped Terminal 1 footprint. The airport has metro and bus connections; this scene is an imagined layout.",
  ),
  rossio: hub(
    "rossio",
    "Rossio railway station",
    "station",
    38.714227,
    -9.141044,
    railSource,
    "https://www.openstreetmap.org/way/96530649",
    "An original railway hall at the mapped Rossio station. Practice buying a simulated ticket for the Sintra line, or continue on foot into Baixa.",
  ),
  "cais-bus": hub(
    "cais-bus",
    "Cais do Sodré · bus stop",
    "bus-stop",
    38.706119,
    -9.144692,
    busSource,
    "https://scholar.tecnico.ulisboa.pt/api/records/OAbJk3hQ2hQj4KooRQC1fvujJn-OrWLRha71/file/248e0e245f1461c17bd9523d837948296beebb4a5f16f1afc6bd7bc97be5e7ff.pdf",
    "Wait at an original stop near the Cais do Sodré interchange. Its anchor follows a published stop-location snapshot; stop layouts and live departures are not reproduced.",
  ),
};

export type JourneyRoute = {
  id: string;
  from: HubId;
  toPlace: PlaceId;
  name: string;
  mode: "metro" | "bus" | "train" | "walk" | "flight" | "taxi";
  cost: number;
  minutes: number;
  energy: number;
  requiresCard: boolean;
  departure?: boolean;
  description: string;
  sourceUrl: string;
};
/** Operator links provide place/network context. These values are game content,
 * not a fare table, timetable, real reservation or guaranteed service. */
export const JOURNEY_ROUTES: readonly JourneyRoute[] = [
  {
    id: "airport-uber",
    from: "airport",
    toPlace: "home",
    name: "Uber to your base · simulation",
    mode: "taxi",
    cost: 18,
    minutes: 25,
    energy: -2,
    requiresCard: false,
    description:
      "Request an imagined Uber ride from the airport to your Lisbon base. The fare and booking use game credits only.",
    sourceUrl: airportSource,
  },
  {
    id: "airport-taxi",
    from: "airport",
    toPlace: "home",
    name: "Airport taxi to your base · simulation",
    mode: "taxi",
    cost: 20,
    minutes: 25,
    energy: -2,
    requiresCard: false,
    description:
      "Take an imagined airport taxi to your Lisbon base. No real driver is dispatched or fare charged.",
    sourceUrl: airportSource,
  },
  {
    id: "airport-metro",
    from: "airport",
    toPlace: "cafe",
    name: "Metro into Lisbon · simulation",
    mode: "metro",
    cost: 2,
    minutes: 30,
    energy: -3,
    requiresCard: true,
    description:
      "Practice validating your travel card and changing lines on an imagined journey into Baixa.",
    sourceUrl: airportSource,
  },
  {
    id: "airport-bus",
    from: "airport",
    toPlace: "cais",
    name: "Airport bus into the city · simulation",
    mode: "bus",
    cost: 3,
    minutes: 40,
    energy: -4,
    requiresCard: true,
    description:
      "An authored bus journey into the city, with a simulated transfer to Cais do Sodré. This is not a live direct-service claim.",
    sourceUrl: airportSource,
  },
  {
    id: "rossio-sintra",
    from: "rossio",
    toPlace: "sintra",
    name: "Train to Sintra · simulation",
    mode: "train",
    cost: 4,
    minutes: 45,
    energy: -3,
    requiresCard: true,
    description:
      "Book one simulated rail ticket, then board for the mapped Sintra chapter.",
    sourceUrl: railSource,
  },
  {
    id: "rossio-city",
    from: "rossio",
    toPlace: "cafe",
    name: "Walk into Baixa · simulation",
    mode: "walk",
    cost: 0,
    minutes: 10,
    energy: -2,
    requiresCard: false,
    description: "Leave the station and begin your Lisbon chapter on foot.",
    sourceUrl: railSource,
  },
  {
    id: "cais-benfica",
    from: "cais-bus",
    toPlace: "benfica",
    name: "Bus toward Benfica · simulation",
    mode: "bus",
    cost: 3,
    minutes: 40,
    energy: -4,
    requiresCard: true,
    description:
      "Practice a card check and bus boarding, inspired by the CARRIS 758 corridor between Cais do Sodré and Portas Benfica.",
    sourceUrl: busSource,
  },
  {
    id: "cais-city",
    from: "cais-bus",
    toPlace: "cais",
    name: "Walk along Cais do Sodré · simulation",
    mode: "walk",
    cost: 0,
    minutes: 8,
    energy: -2,
    requiresCard: false,
    description:
      "Continue on foot into the riverside neighbourhood instead of boarding a bus.",
    sourceUrl: busSource,
  },
  {
    id: "airport-flight",
    from: "airport",
    toPlace: "home",
    name: "Departure flight · simulation",
    mode: "flight",
    cost: 90,
    minutes: 90,
    energy: -5,
    requiresCard: false,
    departure: true,
    description:
      "An imagined departure with a €90 game-budget charge. No destination, airline, seat or real flight is booked.",
    sourceUrl:
      "https://www.aeroportolisboa.pt/en/lis/flights-destinations/find-flights/departures",
  },
];

export type JourneyPerson = {
  id: string;
  name: string;
  hub: HubId;
  role: "local" | "traveller";
  greeting: string;
  responses: Record<Persona, string>;
};
/** Original fictional characters; conversations are finite authored encounters. */
export const JOURNEY_PEOPLE: readonly JourneyPerson[] = [
  {
    id: "airport-ines",
    name: "Inês",
    hub: "airport",
    role: "local",
    greeting: "First time in Lisbon? I can help you find your next step.",
    responses: {
      tourist:
        "Start slowly. Practice getting your card here, then choose a city journey and leave room for a walk in Baixa.",
      nomad:
        "Give yourself an arrival morning before you open the laptop. Pick a neighbourhood, settle in, and try a café scene when you are ready.",
      expat:
        "Learn one useful journey before a whole city. Your simulated travel card is a first step toward feeling at home.",
    },
  },
  {
    id: "airport-mika",
    name: "Mika",
    hub: "airport",
    role: "traveller",
    greeting: "I have just arrived too. Shall we compare first-day plans?",
    responses: {
      tourist:
        "I am keeping my first day light: a ride into the centre, a snack, and one view. The game budget helps me choose.",
      nomad:
        "I am looking for a calm base before exploring work spots. A small routine makes a new city easier.",
      expat:
        "I am practising the local journey before making bigger plans. We can start with the same card machine.",
    },
  },
  {
    id: "rossio-tiago",
    name: "Tiago",
    hub: "rossio",
    role: "local",
    greeting: "The station can feel busy. Which chapter are you planning?",
    responses: {
      tourist:
        "Sintra is its own town. Leave a generous part of your day for it; this simulated rail trip gives you a starting point.",
      nomad:
        "A day outside Lisbon can be a good break from your routine. Finish your work chapter, then make time for the hills.",
      expat:
        "Try one familiar rail journey and build from there. Check the operator's current information before travelling in real life.",
    },
  },
  {
    id: "rossio-aya",
    name: "Aya",
    hub: "rossio",
    role: "traveller",
    greeting: "I am deciding between a walk in Baixa and a train chapter.",
    responses: {
      tourist:
        "I chose one destination today, rather than racing between them. There is still time for a slow lunch.",
      nomad:
        "I saved a day for the train journey after a few work mornings. A different rhythm helps me explore.",
      expat:
        "I am learning the city one route at a time. It is easier when I can recognise the starting station.",
    },
  },
  {
    id: "cais-rita",
    name: "Rita",
    hub: "cais-bus",
    role: "local",
    greeting: "Waiting for the bus? Have your card ready before you step on.",
    responses: {
      tourist:
        "The Benfica chapter shows an everyday side of Lisbon. In this scene, book your simulated ride and then board once.",
      nomad:
        "Try a neighbourhood beyond the centre. You can explore a quieter daily routine in the Benfica chapter.",
      expat:
        "A stop, a card, a familiar journey: small things become a daily rhythm. Practise here before researching your actual commute.",
    },
  },
  {
    id: "cais-noah",
    name: "Noah",
    hub: "cais-bus",
    role: "traveller",
    greeting: "I am learning the city by bus today. Want to share a plan?",
    responses: {
      tourist:
        "I am heading toward Benfica for a market chapter. This is a simulation, so I will check the real route later.",
      nomad:
        "I like finding one neighbourhood I would return to between work days. Today I am trying Benfica.",
      expat:
        "I am building a routine around a few places, instead of trying to know everything at once.",
    },
  },
];
export const JOURNEY_PERSONAS: Record<
  Persona,
  {
    name: string;
    description: string;
    missions: readonly { title: string; detail: string; place: PlaceId }[];
  }
> = {
  tourist: {
    name: "Tourist",
    description:
      "Arrive curious, discover neighbourhoods and collect a few good memories.",
    missions: [
      {
        title: "Your first Lisbon view",
        detail: "Find a view and give yourself a slow first day.",
        place: "viewpoint",
      },
      {
        title: "A taste of Baixa",
        detail: "Make time for a café experience in the centre.",
        place: "cafe",
      },
      {
        title: "A day in Sintra",
        detail: "Try the station and simulated train journey.",
        place: "sintra",
      },
    ],
  },
  nomad: {
    name: "Digital nomad",
    description:
      "Settle into a base, balance a work rhythm with time to explore.",
    missions: [
      {
        title: "Build a gentle routine",
        detail: "Settle into your Lisbon home before filling the day.",
        place: "home",
      },
      {
        title: "Find your café pause",
        detail: "Explore a café scene between your imagined work sessions.",
        place: "cafe",
      },
      {
        title: "Beyond the centre",
        detail: "Try a bus chapter and discover everyday Benfica.",
        place: "benfica",
      },
    ],
  },
  expat: {
    name: "Expat",
    description:
      "Learn everyday journeys, meet neighbours and begin to feel at home.",
    missions: [
      {
        title: "Your familiar journey",
        detail: "Practise the travel card and one bus journey.",
        place: "benfica",
      },
      {
        title: "Meet the neighbourhood",
        detail: "Build connections through an Alfama chapter.",
        place: "exchange",
      },
      {
        title: "Make a home base",
        detail: "Leave room for a restful moment in your new routine.",
        place: "home",
      },
    ],
  },
};

export function initialJourney(arrival: Arrival = "home"): JourneyState {
  const hub: HubId | null =
    arrival === "airport"
      ? "airport"
      : arrival === "station"
        ? "rossio"
        : arrival === "bus-stop"
          ? "cais-bus"
          : null;
  return {
    phase: hub ? "arriving" : "city",
    hub,
    card: false,
    ticket: null,
    talked: [],
  };
}
/** Supports an in-memory trip created before the arrival feature was loaded. */
export function journeyFor(trip: { journey?: JourneyState }): JourneyState {
  return trip.journey || initialJourney();
}
export function peopleAtHub(hubId: HubId | null): readonly JourneyPerson[] {
  return JOURNEY_PEOPLE.filter((person) => person.hub === hubId);
}
export function routesAtHub(hubId: HubId | null): readonly JourneyRoute[] {
  return JOURNEY_ROUTES.filter((route) => route.from === hubId);
}

/** Curated profile matches; these suggestions are authored rather than AI output. */
export function profileMissions(profile: {
  persona?: Persona;
  interests?: readonly (
    | "food"
    | "culture"
    | "nature"
    | "nightlife"
    | "wellness"
    | "community"
  )[];
}) {
  const interestMissions = {
    food: {
      title: "Make time for a café",
      detail: "Explore a food chapter in Baixa.",
      place: "cafe" as PlaceId,
    },
    culture: {
      title: "Follow the tiles",
      detail: "Try a cultural chapter in Alfama.",
      place: "exchange" as PlaceId,
    },
    nature: {
      title: "Find a quiet view",
      detail: "Give yourself a slower moment above the city.",
      place: "viewpoint" as PlaceId,
    },
    nightlife: {
      title: "An evening in Santos",
      detail: "Explore a music chapter with time to return home.",
      place: "music" as PlaceId,
    },
    wellness: {
      title: "A riverside pause",
      detail: "Leave space for a restful chapter beside the Tejo.",
      place: "riverside" as PlaceId,
    },
    community: {
      title: "Everyday Benfica",
      detail: "Meet an imagined neighbourhood beyond the centre.",
      place: "benfica" as PlaceId,
    },
  };
  const suggestions = [
    ...(profile.interests || []).map((interest) => interestMissions[interest]),
    ...JOURNEY_PERSONAS[profile.persona || "tourist"].missions,
  ];
  return [
    ...new Map(suggestions.map((mission) => [mission.place, mission])).values(),
  ].slice(0, 4);
}
