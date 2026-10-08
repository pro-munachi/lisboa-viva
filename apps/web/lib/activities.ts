import {
  ChatRequestError,
  chatBodyError,
  normalizeChatBody,
  parseChatMessage,
  type ChatAttempt,
  type ChatDraft,
  type ChatMessage,
} from "./chat-client";

export const ACTIVITY_CATEGORIES = [
  "nightlife",
  "coffee",
  "outdoors",
  "culture",
  "wellness",
] as const;
export const ACTIVITY_TRAVELLERS = [
  "everyone",
  "tourist",
  "nomad",
  "expat",
  "local",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export type ActivityTraveller = (typeof ACTIVITY_TRAVELLERS)[number];
export type ActivityWallet = { balance: number; currency: "ROAM credits" };
export type ActivityVenue = {
  id: string;
  name: string;
  category: "bar" | "cafe" | "beach" | "culture" | "gym";
  area: string;
  latitude: number;
  longitude: number;
};
export type ActivityIdentity = { id: string; handle: string };
export type ActivitySummary = {
  id: string;
  title: string;
  category: ActivityCategory;
  travellerType: ActivityTraveller;
  venueId: string;
  startsAt: string;
  capacity: number;
  memberCount: number;
  host: ActivityIdentity;
  joined: boolean;
  createdAt: string;
};
export type ActivityMember = ActivityIdentity & {
  userType: "tourist" | "local";
  joinedAt: string;
  socialOptIn: boolean;
};
export type ActivityActionKind =
  | "drink"
  | "dance"
  | "wave"
  | "compliment"
  | "flirt"
  | "challenge"
  | "accept-challenge"
  | "decline-challenge";
export type ActivityEvent = {
  id: string;
  kind: string;
  actor: ActivityIdentity;
  target?: ActivityIdentity;
  label: string;
  createdAt: string;
  inviteId?: string;
};
export type ActivityRoom = ActivitySummary & {
  members: ActivityMember[];
  messages: ChatMessage[];
  events: ActivityEvent[];
};
export type ActivityFeed = {
  activities: ActivitySummary[];
  wallet: ActivityWallet;
  venues: ActivityVenue[];
};
export type ActivityEnvelope = {
  activity: ActivityRoom;
  wallet: ActivityWallet;
};
export type ActivityCreateInput = {
  title: string;
  category: ActivityCategory;
  travellerType: ActivityTraveller;
  venueId: string;
  startsAt: string;
  capacity: number;
  clientId: string;
};
export type ActivityActionInput = {
  kind: ActivityActionKind;
  item?: "coffee" | "mocktail" | "beer";
  targetId?: string;
  inviteId?: string;
  clientId: string;
};
export const ACTIVITY_LABELS: Record<ActivityCategory, string> = {
  nightlife: "Nightlife",
  coffee: "Coffee",
  outdoors: "Outdoors",
  culture: "Culture",
  wellness: "Wellness",
};
export const TRAVELLER_LABELS: Record<ActivityTraveller, string> = {
  everyone: "Everyone",
  tourist: "Tourists",
  nomad: "Nomads",
  expat: "Expats",
  local: "Locals",
};
export const ACTIVITY_DRINKS = [
  { id: "coffee", label: "Coffee", cost: 8 },
  { id: "mocktail", label: "Mocktail", cost: 12 },
  { id: "beer", label: "Beer", cost: 15 },
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const validUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  uuid.test(value) &&
  value !== "00000000-0000-0000-0000-000000000000";
const date = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  Array.from(value).length > 0 &&
  Array.from(value).length <= max;
const bad = (message = "Activities returned an unreadable update."): never => {
  throw new ChatRequestError(message);
};
function identity(value: unknown): ActivityIdentity {
  if (!record(value) || !validUuid(value.id) || !text(value.handle, 100))
    return bad();
  return { id: value.id, handle: value.handle };
}
export function activityRoomId(id: string) {
  if (!validUuid(id)) return bad("Choose a valid activity.");
  return `activity:${id}`;
}
export function parseWallet(value: unknown): ActivityWallet {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.balance) ||
    Number(value.balance) < 0 ||
    value.currency !== "ROAM credits"
  )
    return bad("The simulated wallet returned an unreadable balance.");
  return { balance: Number(value.balance), currency: "ROAM credits" };
}
export function parseActivitySummary(value: unknown): ActivitySummary {
  if (
    !record(value) ||
    !validUuid(value.id) ||
    !text(value.title, 120) ||
    !ACTIVITY_CATEGORIES.includes(value.category as ActivityCategory) ||
    !ACTIVITY_TRAVELLERS.includes(value.travellerType as ActivityTraveller) ||
    !text(value.venueId, 200) ||
    !date(value.startsAt) ||
    !date(value.createdAt) ||
    !Number.isInteger(value.capacity) ||
    Number(value.capacity) < 2 ||
    Number(value.capacity) > 12 ||
    !Number.isInteger(value.memberCount) ||
    Number(value.memberCount) < 1 ||
    Number(value.memberCount) > Number(value.capacity) ||
    typeof value.joined !== "boolean"
  )
    return bad();
  return {
    id: value.id,
    title: value.title,
    category: value.category as ActivityCategory,
    travellerType: value.travellerType as ActivityTraveller,
    venueId: value.venueId,
    startsAt: value.startsAt,
    capacity: Number(value.capacity),
    memberCount: Number(value.memberCount),
    host: identity(value.host),
    joined: value.joined,
    createdAt: value.createdAt,
  };
}
export function parseActivityEvent(value: unknown): ActivityEvent {
  if (
    !record(value) ||
    !validUuid(value.id) ||
    !text(value.kind, 50) ||
    !text(value.label, 500) ||
    !date(value.createdAt) ||
    (value.inviteId !== undefined &&
      value.inviteId !== null &&
      !validUuid(value.inviteId))
  )
    return bad();
  return {
    id: value.id,
    kind: value.kind,
    actor: identity(value.actor),
    ...(value.target != null ? { target: identity(value.target) } : {}),
    label: value.label,
    createdAt: value.createdAt,
    ...(typeof value.inviteId === "string" ? { inviteId: value.inviteId } : {}),
  };
}
export function parseActivityRoom(
  value: unknown,
  expectedId?: string,
  viewerId?: string,
): ActivityRoom {
  const summary = parseActivitySummary(value);
  if (
    !record(value) ||
    (expectedId && summary.id !== expectedId) ||
    !Array.isArray(value.members) ||
    value.members.length !== summary.memberCount ||
    !Array.isArray(value.messages) ||
    value.messages.length > 50 ||
    !Array.isArray(value.events) ||
    value.events.length > 30
  )
    return bad();
  const ids = new Set<string>();
  const members = value.members.map((entry): ActivityMember => {
    const person = identity(entry);
    if (
      !record(entry) ||
      ids.has(person.id) ||
      (entry.userType !== "tourist" && entry.userType !== "local") ||
      !date(entry.joinedAt) ||
      typeof entry.socialOptIn !== "boolean"
    )
      return bad();
    ids.add(person.id);
    return {
      ...person,
      userType: entry.userType,
      joinedAt: entry.joinedAt,
      socialOptIn: entry.socialOptIn,
    };
  });
  if (
    !ids.has(summary.host.id) ||
    (viewerId && (!ids.has(viewerId) || !summary.joined))
  )
    return bad("This activity room is not available to this account.");
  let previous = BigInt(0);
  const messages = value.messages.map((entry) => {
    const message = parseChatMessage(entry, activityRoomId(summary.id));
    if (!validUuid(message.author.id) || BigInt(message.id) <= previous)
      return bad();
    previous = BigInt(message.id);
    return message;
  });
  const events = value.events.map(parseActivityEvent);
  if (
    new Set(events.map((event) => event.id)).size !== events.length ||
    events.some(
      (event, i) =>
        i > 0 &&
        Date.parse(event.createdAt) < Date.parse(events[i - 1].createdAt),
    )
  )
    return bad();
  return { ...summary, members, messages, events };
}
export function parseActivityFeed(value: unknown): ActivityFeed {
  if (
    !record(value) ||
    !Array.isArray(value.activities) ||
    value.activities.length > 60 ||
    !Array.isArray(value.venues) ||
    value.venues.length > 200
  )
    return bad();
  const activities = value.activities.map(parseActivitySummary);
  if (
    new Set(activities.map((activity) => activity.id)).size !==
    activities.length
  )
    return bad();
  const venues = value.venues.map((entry): ActivityVenue => {
    if (
      !record(entry) ||
      !text(entry.id, 200) ||
      !text(entry.name, 150) ||
      !["bar", "cafe", "beach", "culture", "gym"].includes(
        String(entry.category),
      ) ||
      !text(entry.area, 100) ||
      typeof entry.latitude !== "number" ||
      !Number.isFinite(entry.latitude) ||
      Math.abs(entry.latitude) > 90 ||
      typeof entry.longitude !== "number" ||
      !Number.isFinite(entry.longitude) ||
      Math.abs(entry.longitude) > 180
    )
      return bad();
    return {
      id: entry.id,
      name: entry.name,
      category: entry.category as ActivityVenue["category"],
      area: entry.area,
      latitude: entry.latitude,
      longitude: entry.longitude,
    };
  });
  if (
    new Set(venues.map((venue) => venue.id)).size !== venues.length ||
    activities.some(
      (activity) =>
        !venuesForActivity(activity.category, venues).some(
          (venue) => venue.id === activity.venueId,
        ),
    )
  )
    return bad();
  return { activities, venues, wallet: parseWallet(value.wallet) };
}
const categoryVenues: Record<ActivityCategory, readonly string[]> = {
  nightlife: ["bar"],
  coffee: ["cafe"],
  outdoors: ["beach"],
  culture: ["culture"],
  wellness: ["gym"],
};
export function venuesForActivity(
  category: ActivityCategory,
  venues: readonly ActivityVenue[],
) {
  return venues.filter((venue) =>
    categoryVenues[category].includes(venue.category),
  );
}
export function drinkAvailable(
  item: (typeof ACTIVITY_DRINKS)[number]["id"],
  venue?: ActivityVenue,
) {
  if (!venue) return false;
  if (item === "coffee") return venue.category === "cafe";
  return ["bar"].includes(venue.category);
}
export function incomingChallenges(
  room: ActivityRoom,
  viewerId: string,
  now = Date.now(),
) {
  const resolved = new Set(
    room.events
      .filter((event) =>
        ["accept-challenge", "decline-challenge"].includes(event.kind),
      )
      .map((event) => event.inviteId),
  );
  return room.events.filter(
    (event) =>
      event.kind === "challenge" &&
      event.target?.id === viewerId &&
      !resolved.has(event.inviteId || event.id) &&
      now - Date.parse(event.createdAt) >= 0 &&
      now - Date.parse(event.createdAt) < 600000 &&
      room.members.some(
        (member) =>
          member.id === event.actor.id &&
          Date.parse(member.joinedAt) <= Date.parse(event.createdAt),
      ) &&
      room.members.some(
        (member) =>
          member.id === viewerId &&
          Date.parse(member.joinedAt) <= Date.parse(event.createdAt),
      ),
  );
}
export function validateActivityCreate(input: ActivityCreateInput) {
  if (
    !text(input.title.trim(), 80) ||
    Array.from(input.title.trim()).length < 3 ||
    /[\u0000-\u001f\u007f]/.test(input.title) ||
    !ACTIVITY_CATEGORIES.includes(input.category) ||
    !ACTIVITY_TRAVELLERS.includes(input.travellerType) ||
    !text(input.venueId, 200) ||
    !date(input.startsAt) ||
    !Number.isInteger(input.capacity) ||
    input.capacity < 2 ||
    input.capacity > 12 ||
    !validUuid(input.clientId)
  )
    throw new ChatRequestError(
      "Add a title, mapped venue, start time and group size between 2 and 12.",
    );
  return {
    title: input.title.trim(),
    category: input.category,
    travellerType: input.travellerType,
    venueId: input.venueId,
    startsAt: input.startsAt,
    capacity: input.capacity,
    clientId: input.clientId,
  };
}
// The Phone can unmount during a request. Keep the exact creation payload and nonce
// in the account-scoped, in-memory draft store for an intentional retry on return.
export function creationRetryDraft(
  input: ActivityCreateInput,
  fingerprint: string,
): ChatAttempt {
  const validated = validateActivityCreate(input);
  return {
    clientId: validated.clientId,
    body: JSON.stringify({ fingerprint, input: validated }),
  };
}
export function restoreCreationRetry(
  saved: ChatAttempt | null,
  fingerprint: string,
): ActivityCreateInput | null {
  if (!saved || !validUuid(saved.clientId) || saved.body.length > 5000)
    return null;
  try {
    const value: unknown = JSON.parse(saved.body);
    if (
      !record(value) ||
      value.fingerprint !== fingerprint ||
      !record(value.input)
    )
      return null;
    const input = validateActivityCreate(value.input as ActivityCreateInput);
    return input.clientId === saved.clientId ? input : null;
  } catch {
    return null;
  }
}
async function request(
  path: string,
  signal: AbortSignal,
  payload?: unknown,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(path, {
    ...(payload !== undefined
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }
      : {}),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      record(value) && typeof value.error === "string" ? value.error : "";
    const codes: Record<string, string> = {
      insufficient_funds:
        "You do not have enough ROAM credits for this action.",
      insufficient_credits:
        "You do not have enough ROAM credits for this action.",
      activity_full: "This group is full. Try another activity.",
      capacity_reached: "This group is full. Try another activity.",
      not_at_venue:
        "Visit the activity venue and wait for your location to connect first.",
      presence_required:
        "Connect your ROAM location at this venue before taking part.",
      activity_presence_required:
        "Connect your ROAM location at this venue. For shared actions, the other player must also still be here.",
      invitation_unavailable:
        "That invitation is no longer available. Refresh the room.",
      activity_membership_required: "Join this activity to enter its room.",
      social_opt_in_required:
        "Both people must allow friendly flirting before this action.",
      invite_unavailable:
        "That invitation is no longer available. Refresh the room.",
      nonce_conflict:
        "This retry no longer matches its original request. Change the action and try again.",
    };
    const statuses: Record<number, string> = {
      400: "Check this activity's details and try again.",
      401: "Your session has expired. Sign in again to continue.",
      403: "This room or action is not available to your account.",
      404: "This activity is no longer available.",
      409: "The group or action changed. Refresh and try again.",
      410: "The host closed this activity.",
      429: "Wait a moment before trying another action.",
    };
    throw new ChatRequestError(
      codes[code] ||
        statuses[response.status] ||
        "Activities are temporarily unavailable. Your request may have completed; check the room before retrying.",
      response.status,
    );
  }
  return value;
}
function envelope(
  value: unknown,
  id?: string,
  viewerId?: string,
): ActivityEnvelope {
  if (!record(value)) return bad();
  return {
    activity: parseActivityRoom(value.activity, id, viewerId),
    wallet: parseWallet(value.wallet),
  };
}
export async function fetchActivities(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  return parseActivityFeed(
    await request("/api/activities", signal, undefined, fetcher),
  );
}
export async function getWallet(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const value = await request("/api/wallet", signal, undefined, fetcher);
  return parseWallet(record(value) ? value.wallet : null);
}
export async function getActivity(
  id: string,
  signal: AbortSignal,
  viewerId?: string,
  fetcher: typeof fetch = fetch,
) {
  activityRoomId(id);
  return envelope(
    await request(`/api/activities/${id}`, signal, undefined, fetcher),
    id,
    viewerId,
  );
}
export async function createActivity(
  input: ActivityCreateInput,
  viewerId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  return envelope(
    await request(
      "/api/activities",
      signal,
      validateActivityCreate(input),
      fetcher,
    ),
    undefined,
    viewerId,
  );
}
export async function joinActivity(
  id: string,
  socialOptIn: boolean,
  viewerId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  activityRoomId(id);
  return envelope(
    await request(
      `/api/activities/${id}/join`,
      signal,
      { socialOptIn },
      fetcher,
    ),
    id,
    viewerId,
  );
}
export async function leaveActivity(
  id: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  activityRoomId(id);
  const value = await request(
    `/api/activities/${id}/leave`,
    signal,
    {},
    fetcher,
  );
  if (!record(value) || value.left !== true)
    return bad("The activity returned an unreadable leave confirmation.");
}
export async function sendActivityMessage(
  id: string,
  viewerId: string,
  attempt: ChatAttempt,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const room = activityRoomId(id);
  const error = chatBodyError(attempt.body);
  if (error || !validUuid(attempt.clientId))
    throw new ChatRequestError(error || "The message retry ID is invalid.");
  const value = await request(
    `/api/activities/${id}/messages`,
    signal,
    { body: normalizeChatBody(attempt.body), clientId: attempt.clientId },
    fetcher,
  );
  const message = parseChatMessage(record(value) ? value.message : null, room);
  if (
    message.author.id !== viewerId ||
    message.body !== normalizeChatBody(attempt.body)
  )
    return bad("The activity returned an unreadable send confirmation.");
  return message;
}
export function activityActionKey(
  input: Omit<ActivityActionInput, "clientId">,
) {
  return [
    input.kind,
    input.item ?? "",
    input.targetId ?? "",
    input.inviteId ?? "",
  ].join("|");
}
function validateActionInput(
  input: ActivityActionInput,
  viewerId: string,
): ActivityActionInput {
  if (
    ![
      "drink",
      "dance",
      "wave",
      "compliment",
      "flirt",
      "challenge",
      "accept-challenge",
      "decline-challenge",
    ].includes(input.kind) ||
    !validUuid(input.clientId) ||
    (input.targetId !== undefined &&
      (!validUuid(input.targetId) || input.targetId === viewerId)) ||
    (input.kind === "drink" &&
      !ACTIVITY_DRINKS.some(({ id }) => id === input.item)) ||
    (["wave", "compliment", "flirt", "challenge"].includes(input.kind) &&
      !input.targetId) ||
    (["accept-challenge", "decline-challenge"].includes(input.kind) &&
      !validUuid(input.inviteId))
  )
    throw new ChatRequestError(
      "Choose a valid activity action and another group member.",
    );
  return {
    kind: input.kind,
    clientId: input.clientId,
    ...(input.item !== undefined ? { item: input.item } : {}),
    ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
    ...(input.inviteId !== undefined ? { inviteId: input.inviteId } : {}),
  };
}
export function persistActivityActions(
  id: string,
  viewerId: string,
  attempts: readonly ActivityActionInput[],
): ChatDraft {
  activityRoomId(id);
  if (!validUuid(viewerId) || attempts.length > 200)
    throw new ChatRequestError("Too many saved activity requests.");
  const requests = attempts.map((input) =>
    validateActionInput(input, viewerId),
  );
  if (
    new Set(requests.map(activityActionKey)).size !== requests.length ||
    new Set(requests.map((input) => input.clientId)).size !== requests.length
  )
    throw new ChatRequestError(
      "Activity requests returned an unreadable retry draft.",
    );
  return {
    body: requests.length
      ? JSON.stringify({ activityId: id, actorId: viewerId, requests })
      : "",
    attempt: null,
  };
}
export function restoreActivityActions(
  id: string,
  viewerId: string,
  draft: ChatDraft,
): ActivityActionInput[] {
  if (!draft.body || draft.body.length > 60000) return [];
  try {
    const value: unknown = JSON.parse(draft.body);
    if (
      !record(value) ||
      value.activityId !== id ||
      value.actorId !== viewerId ||
      !Array.isArray(value.requests) ||
      value.requests.length > 200
    )
      return [];
    const requests = value.requests.map((input) =>
      validateActionInput(input as ActivityActionInput, viewerId),
    );
    persistActivityActions(id, viewerId, requests);
    return requests;
  } catch {
    return [];
  }
}
export async function performActivityAction(
  id: string,
  input: ActivityActionInput,
  viewerId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  activityRoomId(id);
  const payload = validateActionInput(input, viewerId);
  const value = await request(
    `/api/activities/${id}/actions`,
    signal,
    payload,
    fetcher,
  );
  if (!record(value)) return bad();
  const event = parseActivityEvent(value.event);
  if (
    event.actor.id !== viewerId ||
    event.kind !== input.kind ||
    (input.targetId && event.target?.id !== input.targetId) ||
    (input.inviteId && event.inviteId !== input.inviteId)
  )
    return bad("The activity returned an unreadable action confirmation.");
  return { event, wallet: parseWallet(value.wallet) };
}
