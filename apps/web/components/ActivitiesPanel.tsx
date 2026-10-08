"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Coffee,
  GlassWater,
  Heart,
  MapPin,
  MessageCircle,
  Music,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  Waves,
  Dumbbell,
  Landmark,
  Hand,
  Swords,
  Wallet,
  ChevronRight,
} from "lucide-react";
import type { AuthUser } from "../lib/auth";
import {
  ChatRequestError,
  chatAttempt,
  chatBodyError,
  chatCharacterCount,
  mergeChatMessages,
  normalizeChatBody,
  type ChatDraft,
} from "../lib/chat-client";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_DRINKS,
  ACTIVITY_LABELS,
  ACTIVITY_TRAVELLERS,
  TRAVELLER_LABELS,
  activityRoomId,
  activityActionKey,
  persistActivityActions,
  restoreActivityActions,
  createActivity,
  creationRetryDraft,
  restoreCreationRetry,
  drinkAvailable,
  fetchActivities,
  getActivity,
  incomingChallenges,
  joinActivity,
  leaveActivity,
  performActivityAction,
  sendActivityMessage,
  venuesForActivity,
  type ActivityActionInput,
  type ActivityCategory,
  type ActivityCreateInput,
  type ActivityEnvelope,
  type ActivityEvent,
  type ActivityFeed,
  type ActivityRoom,
  type ActivityTraveller,
  type ActivityVenue,
  type ActivityWallet,
} from "../lib/activities";
import styles from "./ActivitiesPanel.module.css";

export type ActivitiesPanelProps = {
  user: AuthUser;
  selectedActivityId?: string | null;
  onActivityChange: (id: string | null) => void;
  onVisitVenue: (venueId: string, activityId: string) => void;
  currentVenueId?: string;
  presenceEnabled?: boolean;
  onWalletChange?: (wallet: ActivityWallet) => void;
  onRoomChange?: (room: ActivityRoom | null) => void;
  onAction?: (event: ActivityEvent) => void;
  draftStore?: Record<string, ChatDraft>;
  onDraftChange?: (key: string, draft: ChatDraft) => void;
};
const icons = {
  nightlife: Music,
  coffee: Coffee,
  outdoors: Waves,
  culture: Landmark,
  wellness: Dumbbell,
};
const emptyDraft: ChatDraft = { body: "", attempt: null };
const failure = (error: unknown) =>
  error instanceof ChatRequestError
    ? error
    : new ChatRequestError(
        "We could not confirm that request. Your draft is still here; check the room and retry.",
      );
const atTime = (value: string) =>
  new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled: boolean,
  interval: number,
  initial?: T,
) {
  const loader = useLatest(load);
  const [data, setData] = useState<T | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<ChatRequestError | null>(null);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      requesting = false,
      halted = false;
    let controller: AbortController | null = null;
    async function poll() {
      if (!active || requesting || halted || document.hidden) return;
      requesting = true;
      controller = new AbortController();
      const request = controller;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        request.abort();
      }, 10000);
      try {
        const result = await loader.current(request.signal);
        if (!active) return;
        setData(result);
        setError(null);
      } catch (error) {
        if (!active || (request.signal.aborted && !timedOut)) return;
        const next = failure(error);
        setError(next);
        halted = [401, 403, 404, 410].includes(next.status);
      } finally {
        clearTimeout(timeout);
        requesting = false;
        if (active) setLoading(false);
      }
    }
    refresh.current = () => {
      halted = false;
      void poll();
    };
    const visibility = () => {
      if (document.hidden) controller?.abort();
      else void poll();
    };
    void poll();
    const timer = setInterval(() => void poll(), interval);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, enabled, interval]);
  return { data, loading, error, refresh: () => refresh.current() };
}
function useMutation() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ChatRequestError | null>(null);
  const alive = useRef(false),
    pending = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  async function run<T>(
    label: string,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined> {
    if (pending.current) return;
    pending.current = true;
    setBusy(label);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    try {
      const value = await action(request.signal);
      if (alive.current && controller.current === request) return value;
    } catch (error) {
      if (alive.current && controller.current === request)
        setError(failure(error));
    } finally {
      clearTimeout(timeout);
      pending.current = false;
      if (alive.current) setBusy(null);
    }
  }
  return { busy, error, run, active: () => alive.current };
}
function ErrorNotice({
  error,
  retry,
}: {
  error: ChatRequestError | null;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div className={styles.error} role="alert">
      <p>{error.message}</p>
      {error.status === 401 ? (
        <Link href="/login">Sign in again</Link>
      ) : (
        retry && (
          <button type="button" onClick={retry}>
            <RefreshCw size={15} /> Retry
          </button>
        )
      )}
    </div>
  );
}
function CreditBadge({ wallet }: { wallet?: ActivityWallet | null }) {
  return (
    <span className={styles.credit}>
      <Wallet size={14} aria-hidden="true" />{" "}
      {wallet ? `${wallet.balance} credits` : "Balance loading…"}
    </span>
  );
}

export default function ActivitiesPanel(props: ActivitiesPanelProps) {
  const {
    user,
    selectedActivityId,
    onActivityChange,
    onVisitVenue,
    currentVenueId,
    presenceEnabled = true,
    draftStore,
    onDraftChange,
  } = props;
  const callbacks = useLatest(props);
  const [internalId, setInternalId] = useState<string | null>(null);
  const selectedId =
    selectedActivityId === undefined ? internalId : selectedActivityId;
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [notice, setNotice] = useState("");
  const [opened, setOpened] = useState<ActivityEnvelope | null>(null);
  const [internalDrafts, setInternalDrafts] = useState<
    Record<string, ChatDraft>
  >({});
  const mutation = useMutation();
  const resource = useResource<ActivityFeed>(
    `${user.id}:activities`,
    fetchActivities,
    !mutation.busy,
    selectedId ? 30000 : 15000,
  );
  const catalogue = resource.data?.venues ?? [];
  const select = (id: string | null) => {
    if (selectedActivityId === undefined) setInternalId(id);
    onActivityChange(id);
    setCreating(false);
  };
  useEffect(() => {
    if (resource.data && !selectedId)
      callbacks.current.onWalletChange?.(resource.data.wallet);
  }, [resource.data]);
  useEffect(() => {
    if (!selectedId) callbacks.current.onRoomChange?.(null);
  }, [selectedId]);
  const setDraft = useCallback(
    (key: string, next: ChatDraft) => {
      if (draftStore !== undefined && onDraftChange) onDraftChange(key, next);
      else setInternalDrafts((all) => ({ ...all, [key]: next }));
    },
    [draftStore !== undefined, onDraftChange],
  );
  async function open(id: string, joined: boolean) {
    setNotice("");
    if (joined) {
      select(id);
      return;
    }
    const result = await mutation.run("join", (signal) =>
      joinActivity(id, false, user.id, signal),
    );
    if (!result || !mutation.active()) return;
    setOpened(result);
    callbacks.current.onRoomChange?.(result.activity);
    callbacks.current.onWalletChange?.(result.wallet);
    select(id);
  }
  function accepted(result: ActivityEnvelope) {
    setOpened(result);
    callbacks.current.onRoomChange?.(result.activity);
    callbacks.current.onWalletChange?.(result.wallet);
    select(result.activity.id);
  }
  if (selectedId)
    return (
      <ActivityRoomView
        key={`${user.id}/${selectedId}`}
        user={user}
        id={selectedId}
        venues={catalogue}
        initial={opened?.activity.id === selectedId ? opened : undefined}
        currentVenueId={currentVenueId}
        presenceEnabled={presenceEnabled}
        onVisitVenue={onVisitVenue}
        onBack={() => select(null)}
        onRemoved={(message) => {
          setNotice(message);
          select(null);
        }}
        onWalletChange={(wallet) => callbacks.current.onWalletChange?.(wallet)}
        onRoomChange={(room) => callbacks.current.onRoomChange?.(room)}
        onAction={(event) => callbacks.current.onAction?.(event)}
        draft={
          (draftStore ?? internalDrafts)[
            `${user.id}/${activityRoomId(selectedId)}`
          ] ?? emptyDraft
        }
        setDraft={(draft) =>
          setDraft(`${user.id}/${activityRoomId(selectedId)}`, draft)
        }
        actionDraft={
          (draftStore ?? internalDrafts)[
            `${user.id}/${activityRoomId(selectedId)}:actions`
          ] ?? emptyDraft
        }
        setActionDraft={(draft) =>
          setDraft(`${user.id}/${activityRoomId(selectedId)}:actions`, draft)
        }
      />
    );
  if (creating)
    return (
      <CreateActivity
        user={user}
        venues={catalogue}
        onBack={() => setCreating(false)}
        onCreated={accepted}
        draft={
          (draftStore ?? internalDrafts)[`${user.id}/activity:create`] ??
          emptyDraft
        }
        setDraft={(draft) => setDraft(`${user.id}/activity:create`, draft)}
      />
    );
  const activities = (resource.data?.activities ?? []).filter(
    (activity) => category === "all" || activity.category === category,
  );
  return (
    <section className={styles.panel} aria-label="Shared activities">
      <div className={styles.feedScroll}>
        <header className={styles.hero}>
          <div>
            <span>MAKE A PLAN</span>
            <h2>Find your people.</h2>
            <p>Real players. A shared city. Your kind of day.</p>
          </div>
          <CreditBadge wallet={resource.data?.wallet} />
        </header>
        <div className={styles.feedTools}>
          <button
            className={styles.primary}
            type="button"
            disabled={!catalogue.length || Boolean(mutation.busy)}
            onClick={() => setCreating(true)}
          >
            <Plus size={18} /> Create activity
          </button>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Refresh activities"
            disabled={Boolean(mutation.busy)}
            onClick={resource.refresh}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <div className={styles.filters} role="group" aria-label="Activity type">
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            All plans
          </button>
          {ACTIVITY_CATEGORIES.map((type) => {
            const Icon = icons[type];
            return (
              <button
                key={type}
                type="button"
                aria-pressed={category === type}
                onClick={() => setCategory(type)}
              >
                <Icon size={15} />
                {ACTIVITY_LABELS[type]}
              </button>
            );
          })}
        </div>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        <ErrorNotice error={resource.error} retry={resource.refresh} />
        <ErrorNotice error={mutation.error} retry={resource.refresh} />
        {resource.loading ? (
          <p className={styles.loading}>Finding shared plans…</p>
        ) : activities.length ? (
          <div className={styles.cards}>
            {activities.map((activity) => {
              const venue = catalogue.find(
                (venue) => venue.id === activity.venueId,
              );
              const Icon = icons[activity.category];
              const full =
                activity.memberCount >= activity.capacity && !activity.joined;
              return (
                <article
                  className={styles.card}
                  data-category={activity.category}
                  key={activity.id}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.categoryIcon}>
                      <Icon size={26} />
                    </span>
                    <div>
                      <span>
                        {ACTIVITY_LABELS[activity.category]} ·{" "}
                        {TRAVELLER_LABELS[activity.travellerType]}
                      </span>
                      <h3>{activity.title}</h3>
                    </div>
                  </div>
                  <p className={styles.venueLine}>
                    <MapPin size={14} />
                    {venue?.name || "Mapped venue"}
                    <span>{venue?.area}</span>
                  </p>
                  <div className={styles.cardFacts}>
                    <span>
                      <CalendarDays size={14} />
                      {atTime(activity.startsAt)}
                    </span>
                    <span>
                      <Users size={14} />
                      {activity.memberCount}/{activity.capacity}
                    </span>
                  </div>
                  <footer>
                    <span>Hosted by @{activity.host.handle}</span>
                    <button
                      type="button"
                      disabled={full || Boolean(mutation.busy)}
                      onClick={() => void open(activity.id, activity.joined)}
                    >
                      {activity.joined
                        ? "Open room"
                        : full
                          ? "Full"
                          : "Join activity"}
                      <ChevronRight size={16} />
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          !resource.error && (
            <div className={styles.empty}>
              <Sparkles size={32} />
              <strong>
                {category === "all"
                  ? "Be the first to make a plan."
                  : "No plans in this category yet."}
              </strong>
              <p>
                Create a coffee catch-up, beach walk or evening out. Other
                players can join your room.
              </p>
            </div>
          )
        )}
        <p className={styles.simulation}>
          ROAM credits and venue actions are simulated. No real purchases or
          reservations.
        </p>
      </div>
    </section>
  );
}

type CreationForm = {
  title: string;
  category: ActivityCategory;
  traveller: ActivityTraveller;
  venueId: string;
  when: "now" | "planned";
  startsAt: string;
  capacity: number;
};
function readCreationForm(body: string): CreationForm | null {
  if (!body || body.length > 5000) return null;
  try {
    const value = JSON.parse(body) as Partial<CreationForm>;
    if (
      !value ||
      typeof value.title !== "string" ||
      value.title.length > 160 ||
      !ACTIVITY_CATEGORIES.includes(value.category as ActivityCategory) ||
      !ACTIVITY_TRAVELLERS.includes(value.traveller as ActivityTraveller) ||
      typeof value.venueId !== "string" ||
      value.venueId.length > 200 ||
      !["now", "planned"].includes(String(value.when)) ||
      typeof value.startsAt !== "string" ||
      value.startsAt.length > 100 ||
      !Number.isInteger(value.capacity) ||
      Number(value.capacity) < 2 ||
      Number(value.capacity) > 12
    )
      return null;
    return value as CreationForm;
  } catch {
    return null;
  }
}

function CreateActivity({
  user,
  venues,
  onBack,
  onCreated,
  draft,
  setDraft,
}: {
  user: AuthUser;
  venues: ActivityVenue[];
  onBack: () => void;
  onCreated: (value: ActivityEnvelope) => void;
  draft: ChatDraft;
  setDraft: (draft: ChatDraft) => void;
}) {
  const savedForm = useRef(readCreationForm(draft.body));
  const [title, setTitle] = useState(savedForm.current?.title ?? ""),
    [category, setCategory] = useState<ActivityCategory>(
      savedForm.current?.category ?? "coffee",
    ),
    [traveller, setTraveller] = useState<ActivityTraveller>(
      savedForm.current?.traveller ?? "everyone",
    ),
    [venueId, setVenueId] = useState(savedForm.current?.venueId ?? ""),
    [when, setWhen] = useState<"now" | "planned">(
      savedForm.current?.when ?? "now",
    ),
    [startsAt, setStartsAt] = useState(savedForm.current?.startsAt ?? ""),
    [capacity, setCapacity] = useState(savedForm.current?.capacity ?? 6);
  const savedDraft = useLatest(draft);
  const writeDraft = useLatest(setDraft);
  const mutation = useMutation();
  const attempt = useRef<{
    fingerprint: string;
    input: ActivityCreateInput;
  } | null>(null);
  const labelId = useId();
  const eligible = venuesForActivity(category, venues);
  const effectiveVenue = eligible.some((venue) => venue.id === venueId)
    ? venueId
    : (eligible[0]?.id ?? "");
  const fingerprint = JSON.stringify({
    title,
    category,
    traveller,
    effectiveVenue,
    when,
    startsAt,
    capacity,
  });
  const formBody = JSON.stringify({
    title,
    category,
    traveller,
    venueId,
    when,
    startsAt,
    capacity,
  });
  useEffect(() => {
    const restored = restoreCreationRetry(
      savedDraft.current.attempt,
      fingerprint,
    );
    if (!attempt.current && restored)
      attempt.current = { fingerprint, input: restored };
    if (attempt.current && attempt.current.fingerprint !== fingerprint)
      attempt.current = null;
    const next = {
      body: formBody,
      attempt: attempt.current
        ? creationRetryDraft(attempt.current.input, fingerprint)
        : null,
    };
    if (
      next.body !== savedDraft.current.body ||
      next.attempt?.clientId !== savedDraft.current.attempt?.clientId
    ) {
      savedDraft.current = next;
      writeDraft.current(next);
    }
  }, [formBody, fingerprint]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.busy) return;
    const result = await mutation.run("create", async (signal) => {
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
        const date = when === "now" ? new Date() : new Date(startsAt);
        if (
          !Number.isFinite(date.getTime()) ||
          (when === "planned" &&
            (date.getTime() < Date.now() ||
              date.getTime() > Date.now() + 30 * 86400000))
        )
          throw new ChatRequestError(
            "Choose a start time in the next 30 days, or start now.",
          );
        attempt.current = {
          fingerprint,
          input: {
            title,
            category,
            travellerType: traveller,
            venueId: effectiveVenue,
            startsAt: date.toISOString(),
            capacity,
            clientId: crypto.randomUUID(),
          },
        };
      }
      const next = {
        body: formBody,
        attempt: creationRetryDraft(attempt.current.input, fingerprint),
      };
      savedDraft.current = next;
      writeDraft.current(next);
      return createActivity(attempt.current.input, user.id, signal);
    });
    if (result && mutation.active()) {
      writeDraft.current(emptyDraft);
      onCreated(result);
    }
  }
  return (
    <section className={styles.panel} aria-labelledby={labelId}>
      <div className={styles.feedScroll}>
        <header className={styles.formHeader}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Back to activities"
            disabled={Boolean(mutation.busy)}
            onClick={onBack}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <span>YOUR INVITATION TO THE CITY</span>
            <h2 id={labelId}>Create a plan</h2>
          </div>
        </header>
        <form className={styles.createForm} onSubmit={submit}>
          <fieldset disabled={Boolean(mutation.busy)}>
            <label>
              Activity title
              <input
                autoComplete="off"
                maxLength={80}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Coffee and a city wander"
                minLength={3}
                required
              />
            </label>
            <label>
              Activity type
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ActivityCategory)
                }
              >
                {ACTIVITY_CATEGORIES.map((value) => (
                  <option value={value} key={value}>
                    {ACTIVITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Who is it for?
              <select
                value={traveller}
                onChange={(event) =>
                  setTraveller(event.target.value as ActivityTraveller)
                }
              >
                {ACTIVITY_TRAVELLERS.map((value) => (
                  <option value={value} key={value}>
                    {TRAVELLER_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Meet at a mapped venue
              <select
                value={effectiveVenue}
                onChange={(event) => setVenueId(event.target.value)}
                required
              >
                {!eligible.length && (
                  <option value="">No venues for this type</option>
                )}
                {eligible.map((venue) => (
                  <option value={venue.id} key={venue.id}>
                    {venue.name} · {venue.area}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.when} role="group" aria-label="Start time">
              <button
                type="button"
                aria-pressed={when === "now"}
                onClick={() => setWhen("now")}
              >
                Start now
              </button>
              <button
                type="button"
                aria-pressed={when === "planned"}
                onClick={() => setWhen("planned")}
              >
                Plan ahead
              </button>
            </div>
            {when === "planned" && (
              <label>
                Start time (your device time)
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  required
                />
                <small>
                  We save the exact time in UTC. Choose within the next 30 days.
                </small>
              </label>
            )}
            <label>
              Group size, including you
              <select
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              >
                {Array.from({ length: 11 }, (_, i) => i + 2).map((value) => (
                  <option value={value} key={value}>
                    {value} people
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <ErrorNotice error={mutation.error} />
          <button
            type="submit"
            className={styles.primary}
            disabled={Boolean(mutation.busy) || !effectiveVenue}
          >
            {mutation.busy
              ? "Creating…"
              : Boolean(restoreCreationRetry(draft.attempt, fingerprint))
                ? "Retry creation"
                : "Create activity"}
            <Plus size={18} />
          </button>
          <p className={styles.simulation}>
            Your plan is shared with signed-in players. Joining opens a room;
            each person chooses when to visit the venue.
          </p>
        </form>
      </div>
    </section>
  );
}

function ActivityRoomView({
  user,
  id,
  venues,
  initial,
  currentVenueId,
  presenceEnabled,
  onVisitVenue,
  onBack,
  onRemoved,
  onWalletChange,
  onRoomChange,
  onAction,
  draft,
  setDraft,
  actionDraft,
  setActionDraft,
}: {
  user: AuthUser;
  id: string;
  venues: ActivityVenue[];
  initial?: ActivityEnvelope;
  currentVenueId?: string;
  presenceEnabled: boolean;
  onVisitVenue: ActivitiesPanelProps["onVisitVenue"];
  onBack: () => void;
  onRemoved: (notice: string) => void;
  onWalletChange: (wallet: ActivityWallet) => void;
  onRoomChange: (room: ActivityRoom | null) => void;
  onAction: (event: ActivityEvent) => void;
  draft: ChatDraft;
  setDraft: (draft: ChatDraft) => void;
  actionDraft: ChatDraft;
  setActionDraft: (draft: ChatDraft) => void;
}) {
  const [section, setSection] = useState<"plan" | "chat" | "happenings">(
    "plan",
  );
  const [targetId, setTargetId] = useState(""),
    [flirtTarget, setFlirtTarget] = useState("");
  const [sentMessages, setSentMessages] = useState<
    ReturnType<typeof mergeChatMessages>
  >([]);
  const [notice, setNotice] = useState("");
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [confirmedWallet, setConfirmedWallet] = useState<ActivityWallet | null>(
    null,
  );
  const mutation = useMutation();
  const resource = useResource<ActivityEnvelope>(
    `${user.id}/${id}`,
    (signal) => getActivity(id, signal, user.id),
    !mutation.busy,
    3000,
    initial,
  );
  const callbacks = useLatest({
    onRoomChange,
    onWalletChange,
    onAction,
    onRemoved,
  });
  const latestDraft = useLatest(draft);
  const chatLog = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const [pendingActions, setPendingActions] = useState(() =>
    restoreActivityActions(id, user.id, actionDraft),
  );
  const actionAttempts = useRef(
      new Map(
        pendingActions.map((attempt) => [activityActionKey(attempt), attempt]),
      ),
    ),
    lastAction = useRef<ActivityActionInput | null>(
      pendingActions.at(-1) ?? null,
    );
  const saveActionDraft = useLatest(setActionDraft);
  function persistPendingActions() {
    const attempts = Array.from(actionAttempts.current.values());
    setPendingActions(attempts);
    saveActionDraft.current(persistActivityActions(id, user.id, attempts));
  }
  const room = resource.data?.activity,
    wallet = confirmedWallet ?? resource.data?.wallet;
  const venue = venues.find((venue) => venue.id === room?.venueId);
  const own = room?.members.find((member) => member.id === user.id);
  const atVenue = Boolean(
    presenceEnabled && room && currentVenueId === room.venueId,
  );
  const otherMembers =
    room?.members.filter((member) => member.id !== user.id) ?? [];
  const optedPeers = otherMembers.filter((member) => member.socialOptIn);
  const target = otherMembers.some((member) => member.id === targetId)
    ? targetId
    : (otherMembers[0]?.id ?? "");
  const flirtPerson = optedPeers.some((member) => member.id === flirtTarget)
    ? flirtTarget
    : (optedPeers[0]?.id ?? "");
  const messages = mergeChatMessages(room?.messages ?? [], sentMessages);
  const body = normalizeChatBody(draft.body),
    validation = draft.body ? chatBodyError(draft.body) : null;
  const composerId = useId();
  useEffect(() => {
    if (!resource.data) return;
    callbacks.current.onRoomChange(resource.data.activity);
    setConfirmedWallet(null);
    callbacks.current.onWalletChange(resource.data.wallet);
  }, [resource.data]);
  useEffect(() => {
    if (resource.error && [403, 404, 410].includes(resource.error.status)) {
      callbacks.current.onRoomChange(null);
      callbacks.current.onRemoved(resource.error.message);
    }
  }, [resource.error]);
  useEffect(() => {
    if (nearBottom.current && chatLog.current)
      chatLog.current.scrollTop = chatLog.current.scrollHeight;
  }, [room?.messages, sentMessages, section]);
  async function preference(next: boolean) {
    const result = await mutation.run("preference", (signal) =>
      joinActivity(id, next, user.id, signal),
    );
    if (result && mutation.active()) {
      callbacks.current.onRoomChange(result.activity);
      setConfirmedWallet(result.wallet);
      callbacks.current.onWalletChange(result.wallet);
      resource.refresh();
    }
  }
  async function leave() {
    const result = await mutation.run("leave", async (signal) => {
      await leaveActivity(id, signal);
      return true;
    });
    if (result && mutation.active()) {
      callbacks.current.onRoomChange(null);
      onRemoved(
        room?.host.id === user.id
          ? "Your activity has been closed."
          : "You left the activity.",
      );
    }
  }
  async function action(input: Omit<ActivityActionInput, "clientId">) {
    if (mutation.busy) return;
    const signature = activityActionKey(input);
    if (
      !actionAttempts.current.has(signature) &&
      actionAttempts.current.size >= 200
    ) {
      setNotice("Review your saved requests before starting more actions.");
      return;
    }
    const pending = actionAttempts.current.get(signature) ?? {
      ...input,
      clientId: crypto.randomUUID(),
    };
    actionAttempts.current.set(signature, pending);
    lastAction.current = pending;
    persistPendingActions();
    const result = await mutation.run("action", (signal) =>
      performActivityAction(id, pending, user.id, signal),
    );
    if (!result || !mutation.active()) return;
    if (actionAttempts.current.get(signature)?.clientId === pending.clientId)
      actionAttempts.current.delete(signature);
    if (lastAction.current?.clientId === pending.clientId)
      lastAction.current = null;
    persistPendingActions();
    setConfirmedWallet(result.wallet);
    callbacks.current.onWalletChange(result.wallet);
    callbacks.current.onAction(result.event);
    setNotice(result.event.label);
    resource.refresh();
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (mutation.busy || !body || validation || !room) return;
    const attempt = chatAttempt(draft.body, draft.attempt);
    const result = await mutation.run("message", async (signal) => {
      const next = { body: attempt.body, attempt };
      latestDraft.current = next;
      setDraft(next);
      return sendActivityMessage(id, user.id, attempt, signal);
    });
    if (!result || !mutation.active()) return;
    setSentMessages((messages) => mergeChatMessages(messages, [result]));
    if (
      latestDraft.current.body === body &&
      latestDraft.current.attempt?.clientId === attempt.clientId
    ) {
      latestDraft.current = emptyDraft;
      setDraft(emptyDraft);
    }
    setNotice("Message sent.");
    resource.refresh();
  }
  if (!room)
    return (
      <section className={styles.panel}>
        <div className={styles.feedScroll}>
          <button type="button" className={styles.back} onClick={onBack}>
            <ArrowLeft size={17} /> All activities
          </button>
          <ErrorNotice error={resource.error} retry={resource.refresh} />
          <p className={styles.loading}>
            {resource.error
              ? "Your activity will be available after reconnecting."
              : "Opening your group room…"}
          </p>
        </div>
      </section>
    );
  const pendingInvites = incomingChallenges(room, user.id);
  const disabled =
    !atVenue || Boolean(mutation.busy) || Boolean(resource.error);
  return (
    <section
      className={`${styles.panel} ${styles.room}`}
      data-section={section}
      aria-label={`Activity room: ${room.title}`}
    >
      <header className={styles.roomHeader}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Back to all activities"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span>
            {ACTIVITY_LABELS[room.category]} · {room.memberCount}/
            {room.capacity} people
          </span>
          <h2>{room.title}</h2>
        </div>
        <CreditBadge wallet={wallet} />
      </header>
      <div
        className={styles.roomTabs}
        role="group"
        aria-label="Activity room view"
      >
        <button
          type="button"
          aria-pressed={section === "plan"}
          onClick={() => setSection("plan")}
        >
          <Users size={15} /> Plan
        </button>
        <button
          type="button"
          aria-pressed={section === "chat"}
          onClick={() => setSection("chat")}
        >
          <MessageCircle size={15} /> Chat
        </button>
        <button
          type="button"
          aria-pressed={section === "happenings"}
          onClick={() => setSection("happenings")}
        >
          <Sparkles size={15} /> Happenings
          {pendingInvites.length > 0 && (
            <span className={styles.tabBadge}>{pendingInvites.length}</span>
          )}
        </button>
      </div>
      {section !== "chat" && (
        <ErrorNotice
          error={mutation.error || resource.error}
          retry={
            lastAction.current
              ? () => {
                  const { clientId: _id, ...input } = lastAction.current!;
                  void action(input);
                }
              : resource.refresh
          }
        />
      )}
      {section === "plan" ? (
        <div className={styles.roomScroll}>
          <div className={styles.destination}>
            <MapPin size={24} />
            <div>
              <span>MEET HERE</span>
              <h3>{venue?.name || "The group's mapped venue"}</h3>
              <p>
                {venue?.area} · {atTime(room.startsAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={Boolean(mutation.busy)}
            onClick={() => onVisitVenue(room.venueId, room.id)}
          >
            <MapPin size={17} />
            {atVenue ? "Back to the venue" : "Go to venue"}
          </button>
          <p className={styles.note}>
            {atVenue
              ? "Your ROAM location is connected here. Open Happenings to join in."
              : "Joining does not move you. Choose Go to venue when you are ready."}
          </p>
          {pendingActions.length > 0 && (
            <div className={styles.savedRequest}>
              <strong>Saved request awaiting confirmation</strong>
              <p>
                Check the room's moments before retrying. Your previous request
                ID is kept to prevent duplicate credit charges.
              </p>
              <button type="button" onClick={() => setSection("happenings")}>
                Review saved requests
              </button>
            </div>
          )}
          <h3 className={styles.smallHeading}>Your group</h3>
          <div className={styles.members}>
            {room.members.map((member) => (
              <span key={member.id}>
                <i>{member.handle[0].toUpperCase()}</i>@{member.handle}
                {member.id === user.id ? " (you)" : ""}
                {member.id === room.host.id && <small>Host</small>}
              </span>
            ))}
          </div>
          <label className={styles.optIn}>
            <input
              type="checkbox"
              checked={Boolean(own?.socialOptIn)}
              disabled={Boolean(mutation.busy)}
              onChange={(event) => void preference(event.target.checked)}
            />
            <span>
              <strong>Allow friendly flirting</strong>
              <small>
                Off by default. Only other opted-in group members can send a
                playful flirt; you can turn this off anytime.
              </small>
            </span>
          </label>
          <p className={styles.simulation}>
            A shared ROAM outing. Credits, drinks and actions are simulated.
          </p>
          {leaveConfirm ? (
            <div className={styles.leaveConfirm}>
              <p>
                {room.host.id === user.id
                  ? "Close this activity for everyone?"
                  : "Leave this group?"}
              </p>
              <button
                type="button"
                disabled={Boolean(mutation.busy)}
                onClick={() => void leave()}
              >
                {mutation.busy === "leave"
                  ? "Leaving…"
                  : room.host.id === user.id
                    ? "Close activity"
                    : "Leave activity"}
              </button>
              <button
                type="button"
                disabled={Boolean(mutation.busy)}
                onClick={() => setLeaveConfirm(false)}
              >
                Stay
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.leave}
              onClick={() => setLeaveConfirm(true)}
            >
              {room.host.id === user.id ? "Close activity" : "Leave activity"}
            </button>
          )}
        </div>
      ) : section === "chat" ? (
        <>
          <div className={styles.chatSurface}>
            <div
              ref={chatLog}
              className={styles.chatLog}
              role="log"
              aria-label="Activity group messages"
              aria-live="polite"
              aria-relevant="additions"
              tabIndex={0}
              onScroll={() => {
                const list = chatLog.current;
                if (list)
                  nearBottom.current =
                    list.scrollHeight - list.scrollTop - list.clientHeight < 80;
              }}
            >
              {messages.length ? (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={styles.message}
                    data-own={message.author.id === user.id}
                  >
                    <header>
                      <strong>
                        {message.author.id === user.id
                          ? "You"
                          : `@${message.author.handle}`}
                      </strong>
                      <time dateTime={message.sentAt}>
                        {new Date(message.sentAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </header>
                    <p>{message.body}</p>
                  </article>
                ))
              ) : (
                <div className={styles.empty}>
                  <MessageCircle size={28} />
                  <strong>Make a plan together.</strong>
                  <p>
                    Only this activity's members can access the group
                    conversation.
                  </p>
                </div>
              )}
            </div>
          </div>
          <form className={styles.composer} onSubmit={send}>
            <div className={styles.composerLabel}>
              <label htmlFor={composerId}>Message your group</label>
              <span>{chatCharacterCount(body)}/1,000</span>
            </div>
            <textarea
              ref={composer}
              id={composerId}
              rows={2}
              value={draft.body}
              maxLength={2000}
              disabled={Boolean(mutation.busy)}
              placeholder="Shall we meet by the entrance?"
              aria-invalid={Boolean(validation)}
              aria-describedby={
                validation || mutation.error || resource.error
                  ? `${composerId}-error`
                  : undefined
              }
              onChange={(event) => {
                const next = {
                  body: event.target.value,
                  attempt:
                    draft.attempt?.body ===
                    normalizeChatBody(event.target.value)
                      ? draft.attempt
                      : null,
                };
                latestDraft.current = next;
                setDraft(next);
                setNotice("");
              }}
            />
            {(validation || mutation.error || resource.error) && (
              <div id={`${composerId}-error`}>
                <ErrorNotice
                  error={mutation.error || resource.error}
                  retry={resource.refresh}
                />
                {validation && (
                  <p className={styles.validation} role="alert">
                    {validation}
                  </p>
                )}
              </div>
            )}
            <div className={styles.sendRow}>
              <span role="status">
                {mutation.busy === "message"
                  ? "Sending…"
                  : notice || "Shared with your activity's members."}
              </span>
              <button
                type="submit"
                disabled={
                  Boolean(mutation.busy) ||
                  Boolean(resource.error) ||
                  !body ||
                  Boolean(validation)
                }
              >
                {mutation.busy === "message"
                  ? "Sending…"
                  : draft.attempt?.body === body
                    ? "Retry send"
                    : "Send"}
                <Send size={15} />
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className={styles.roomScroll}>
          <p className={styles.presenceNote}>
            <MapPin size={16} />
            {atVenue
              ? `You're at ${venue?.name || "the venue"}. Join the moment.`
              : presenceEnabled
                ? "Visit the venue and connect your ROAM location to take part. Other players must be here for shared actions."
                : "Your ROAM location is hidden. Enable Share location in Nearby players, then visit this venue to take part."}
          </p>
          {!atVenue && presenceEnabled && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => onVisitVenue(room.venueId, room.id)}
            >
              Go to venue
              <MapPin size={17} />
            </button>
          )}
          <CreditBadge wallet={wallet} />
          <p className={styles.simulation}>
            Simulated ROAM credits. These actions make no real purchase.
          </p>
          {pendingActions.length > 0 && (
            <div
              className={styles.savedRequests}
              aria-label="Saved activity requests"
            >
              <h3>Saved requests</h3>
              <p>
                Retry uses the original request ID. Credits are charged once
                when the server confirms the action.
              </p>
              {pendingActions.map((pending) => {
                const label =
                  pending.kind === "drink"
                    ? ACTIVITY_DRINKS.find((drink) => drink.id === pending.item)
                        ?.label
                    : pending.kind.replaceAll("-", " ");
                return (
                  <div className={styles.savedRequest} key={pending.clientId}>
                    <strong>
                      {label}
                      {pending.targetId
                        ? ` · @${room.members.find((member) => member.id === pending.targetId)?.handle || "group member"}`
                        : ""}
                    </strong>
                    <button
                      type="button"
                      disabled={
                        Boolean(mutation.busy) ||
                        Boolean(resource.error) ||
                        (pending.kind !== "decline-challenge" && !atVenue)
                      }
                      onClick={() => {
                        const { clientId: _id, ...input } = pending;
                        void action(input);
                      }}
                    >
                      {mutation.busy === "action"
                        ? "Confirming…"
                        : "Retry saved request"}
                      <RefreshCw size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <h3 className={styles.smallHeading}>Something to sip</h3>
          <div className={styles.drinks}>
            {ACTIVITY_DRINKS.map((drink) => (
              <button
                type="button"
                key={drink.id}
                disabled={
                  disabled ||
                  !drinkAvailable(drink.id, venue) ||
                  !wallet ||
                  wallet.balance < drink.cost
                }
                onClick={() => void action({ kind: "drink", item: drink.id })}
              >
                <GlassWater size={19} />
                <strong>{drink.label}</strong>
                <small>{drink.cost} credits</small>
              </button>
            ))}
          </div>
          {venue && !["bar", "cafe"].includes(venue.category) && (
            <p className={styles.note}>
              Drinks are available at café and bar activities.
            </p>
          )}
          {room.category === "nightlife" && (
            <button
              type="button"
              className={styles.friendly}
              disabled={disabled}
              onClick={() => void action({ kind: "dance" })}
            >
              <Music size={19} /> Start dancing <small>Free</small>
            </button>
          )}
          <label className={styles.targetLabel}>
            Say hello to
            <select
              value={target}
              disabled={!otherMembers.length || Boolean(mutation.busy)}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {!otherMembers.length && (
                <option value="">Waiting for another group member</option>
              )}
              {otherMembers.map((member) => (
                <option value={member.id} key={member.id}>
                  @{member.handle}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.friendlyActions}>
            <button
              type="button"
              disabled={disabled || !target}
              onClick={() => void action({ kind: "wave", targetId: target })}
            >
              <Hand size={18} /> Wave
            </button>
            <button
              type="button"
              disabled={disabled || !target}
              onClick={() =>
                void action({ kind: "compliment", targetId: target })
              }
            >
              <Sparkles size={18} /> Compliment
            </button>
          </div>
          <label className={styles.targetLabel}>
            Friendly flirting with
            <select
              value={flirtPerson}
              disabled={
                !own?.socialOptIn ||
                !optedPeers.length ||
                Boolean(mutation.busy)
              }
              onChange={(event) => setFlirtTarget(event.target.value)}
            >
              {!optedPeers.length && (
                <option value="">No opted-in members</option>
              )}
              {optedPeers.map((member) => (
                <option value={member.id} key={member.id}>
                  @{member.handle}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.friendly}
            disabled={disabled || !own?.socialOptIn || !flirtPerson}
            onClick={() =>
              void action({ kind: "flirt", targetId: flirtPerson })
            }
          >
            <Heart size={19} /> Friendly flirt <small>Free · Both opt in</small>
          </button>
          {!own?.socialOptIn && (
            <p className={styles.note}>
              Enable friendly flirting in Plan if you want to take part.
            </p>
          )}
          {room.category === "nightlife" && (
            <>
              <h3 className={styles.smallHeading}>Playful showdown</h3>
              <p className={styles.note}>
                Invite another member to a simulated, friendly playfight. They
                choose whether to accept. No injuries.
              </p>
              <button
                type="button"
                className={styles.friendly}
                disabled={disabled || !target}
                onClick={() =>
                  void action({ kind: "challenge", targetId: target })
                }
              >
                <Swords size={19} /> Invite @
                {otherMembers.find((member) => member.id === target)?.handle ||
                  "a friend"}
                <small>Free</small>
              </button>
              {pendingInvites.map((invite) => (
                <div className={styles.invitation} key={invite.id}>
                  <strong>
                    @{invite.actor.handle} invited you to a playful showdown.
                  </strong>
                  <p>
                    Accept only if you feel like joining in. Invitations last 10
                    minutes.
                  </p>
                  <div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        void action({
                          kind: "accept-challenge",
                          inviteId: invite.inviteId || invite.id,
                        })
                      }
                    >
                      <Check size={17} /> Accept
                    </button>
                    <button
                      type="button"
                      disabled={
                        Boolean(mutation.busy) || Boolean(resource.error)
                      }
                      onClick={() =>
                        void action({
                          kind: "decline-challenge",
                          inviteId: invite.inviteId || invite.id,
                        })
                      }
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          <h3 className={styles.smallHeading}>In the room</h3>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          <div className={styles.events} aria-label="Shared activity events">
            {room.events.length ? (
              room.events.map((event) => (
                <p key={event.id}>
                  <span>{event.label}</span>
                  <time dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </p>
              ))
            ) : (
              <p>The room's shared moments appear here after an action.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
