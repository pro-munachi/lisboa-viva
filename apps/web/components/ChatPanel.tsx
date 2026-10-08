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
  ArrowDown,
  ArrowLeft,
  Coffee,
  Globe2,
  MapPin,
  MessageCircle,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { AuthUser } from "../lib/auth";
import { getCity } from "../lib/cities";
import {
  CHAT_CHARACTER_LIMIT,
  ChatRequestError,
  ChatTimeline,
  chatAttempt,
  chatBodyError,
  chatCharacterCount,
  fetchChatPage,
  normalizeChatBody,
  sendChatMessage,
  type ChatDraft,
  type ChatMessage,
} from "../lib/chat-client";
import {
  directRoom,
  fetchDirectConversations,
  fetchDirectPage,
  sendDirectMessage,
  type ChatPeer,
  type DirectConversation,
} from "../lib/direct-client";
import styles from "./ChatPanel.module.css";

export type ChatPanelProps = {
  user: AuthUser;
  cityId: string;
  place?: { id: string; label: string };
  initialPeer?: ChatPeer | null;
  openPeerRequest?: number;
  onSelectPlayer?: (peer: ChatPeer) => void;
  onClose: () => void;
};

const emptyDraft: ChatDraft = { body: "", attempt: null };
const errorMessage = (error: unknown) =>
  error instanceof ChatRequestError
    ? error
    : new ChatRequestError(
        "We could not connect to chat. Your draft is still here.",
      );

export default function ChatPanel({
  user,
  cityId,
  place,
  initialPeer,
  openPeerRequest,
  onSelectPlayer,
  onClose,
}: ChatPanelProps) {
  const [tab, setTab] = useState<"city" | "here" | "messages">(
    initialPeer && initialPeer.id !== user.id ? "messages" : "city",
  );
  const [peer, setPeer] = useState<ChatPeer | null>(
    initialPeer?.id !== user.id ? (initialPeer ?? null) : null,
  );
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>({});
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const cityName = getCity(cityId).name;
  const here = tab === "here" && place;
  const directPeer = tab === "messages" ? peer : null;
  const room = directPeer
    ? directRoom(directPeer.id)
    : here
      ? `${cityId}:hotspot:${place.id}`
      : `${cityId}:city`;
  const roomLabel = directPeer
    ? `@${directPeer.handle}`
    : here
      ? place.label
      : cityName;
  const draftKey = `${user.id}/${room}`;
  const setDraft = useCallback(
    (next: ChatDraft) => setDrafts((all) => ({ ...all, [draftKey]: next })),
    [draftKey],
  );

  useEffect(() => {
    if (!initialPeer || initialPeer.id === user.id) return;
    setPeer(initialPeer);
    setTab("messages");
  }, [initialPeer, openPeerRequest, user.id]);

  function openThread(person: ChatPeer) {
    if (person.id === user.id) return;
    setPeer(person);
    setTab("messages");
  }

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  return (
    <section
      id="roam-chat"
      className={styles.panel}
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <div className={styles.symbol} aria-hidden="true">
          <MessageCircle size={21} />
        </div>
        <div className={styles.heading}>
          <span>
            {tab === "messages" ? "PEOPLE BECOME PLANS" : "MAPS BECOME PLANS"}
          </span>
          <h2 id={titleId}>
            {tab === "messages"
              ? "Your messages"
              : here
                ? place.label
                : `${cityName} city chat`}
          </h2>
        </div>
        <button
          ref={closeButton}
          type="button"
          className={styles.close}
          aria-label="Close chat"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </header>
      <div className={styles.rooms} role="group" aria-label="Chat room">
        <button
          type="button"
          aria-pressed={tab === "city"}
          onClick={() => setTab("city")}
        >
          <Globe2 size={16} /> {cityName}
        </button>
        <button
          type="button"
          aria-pressed={Boolean(here)}
          disabled={!place}
          title={
            place ? `Chat around ${place.label}` : "Select a mapped place first"
          }
          onClick={() => setTab("here")}
        >
          <MapPin size={16} /> Here
        </button>
        <button
          type="button"
          aria-pressed={tab === "messages"}
          onClick={() => {
            setPeer(null);
            setTab("messages");
          }}
        >
          <Users size={16} /> Messages
        </button>
      </div>
      {tab === "messages" ? (
        directPeer ? (
          <>
            <div className={styles.directHeading}>
              <button
                type="button"
                aria-label="Back to message inbox"
                onClick={() => setPeer(null)}
              >
                <ArrowLeft size={17} />
              </button>
              <div>
                <strong>@{directPeer.handle}</strong>
                <span>
                  {directPeer.userType === "local" ? "Local" : "Traveller"} ·
                  Direct conversation
                </span>
              </div>
            </div>
            <p className={styles.disclosure}>
              Only you and @{directPeer.handle} can access this conversation.
            </p>
            <RoomConversation
              key={draftKey}
              user={user}
              room={room}
              roomLabel={roomLabel}
              peerId={directPeer.id}
              draft={drafts[draftKey] ?? emptyDraft}
              setDraft={setDraft}
              onSelectPlayer={onSelectPlayer}
            />
          </>
        ) : (
          <DirectInbox key={user.id} user={user} onOpen={openThread} />
        )
      ) : (
        <>
          <p className={styles.disclosure}>
            Anyone signed in can join this room. Messages are shared with the
            room.
          </p>
          <RoomConversation
            key={draftKey}
            user={user}
            room={room}
            roomLabel={roomLabel}
            draft={drafts[draftKey] ?? emptyDraft}
            setDraft={setDraft}
            onSelectPlayer={onSelectPlayer}
          />
        </>
      )}
    </section>
  );
}

function RoomConversation({
  user,
  room,
  roomLabel,
  peerId,
  draft,
  setDraft,
  onSelectPlayer,
}: {
  user: AuthUser;
  room: string;
  roomLabel: string;
  peerId?: string;
  draft: ChatDraft;
  setDraft: (draft: ChatDraft) => void;
  onSelectPlayer?: (peer: ChatPeer) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<ChatRequestError | null>(null);
  const [sendError, setSendError] = useState<ChatRequestError | null>(null);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notice, setNotice] = useState("");
  const messageList = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const timeline = useRef(new ChatTimeline());
  const alive = useRef(false);
  const sendingRef = useRef(false);
  const sendController = useRef<AbortController | null>(null);
  const refresh = useRef<() => void>(() => undefined);
  const composerId = useId();
  const errorId = `${composerId}-error`;
  const normalizedBody = normalizeChatBody(draft.body);
  const count = chatCharacterCount(normalizedBody);
  const validation = draft.body ? chatBodyError(draft.body) : null;
  const sessionExpired = loadError?.status === 401 || sendError?.status === 401;
  const unavailable = [loadError?.status, sendError?.status].some(
    (status) => status === 403 || status === 404,
  );
  const retrying = Boolean(draft.attempt?.body === normalizedBody);

  function publish({
    messages,
    added,
  }: {
    messages: ChatMessage[];
    added: number;
  }) {
    setMessages(messages);
    if (added && !nearBottom.current) setUnread((value) => value + added);
  }

  useEffect(() => {
    alive.current = true;
    let active = true;
    let requesting = false;
    let halted = false;
    let controller: AbortController | null = null;
    let continuation: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (!active || requesting || document.hidden || halted) return;
      requesting = true;
      controller = new AbortController();
      const requestController = controller;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        requestController.abort();
      }, 10000);
      let hasMore = false;
      try {
        for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
          const page = peerId
            ? await fetchDirectPage(
                peerId,
                user.id,
                timeline.current.cursor,
                controller.signal,
              )
            : await fetchChatPage(
                room,
                timeline.current.cursor,
                controller.signal,
              );
          if (!active) return;
          publish(timeline.current.acceptPage(page));
          hasMore = page.hasMore;
          setLoadError(null);
          setSendError((failure) =>
            failure && [401, 403, 404].includes(failure.status)
              ? null
              : failure,
          );
          setReady(true);
          if (!hasMore || document.hidden) break;
        }
      } catch (error) {
        hasMore = false;
        if (!active || (requestController.signal.aborted && !timedOut)) return;
        const failure = errorMessage(error);
        setLoadError(failure);
        halted = [401, 403, 404].includes(failure.status);
      } finally {
        requesting = false;
        clearTimeout(timeout);
        if (active) setLoading(false);
        if (active && hasMore && !halted && !document.hidden)
          continuation = setTimeout(poll, 0);
      }
    }
    refresh.current = () => {
      halted = false;
      void poll();
    };
    function visibility() {
      if (document.hidden) controller?.abort();
      else void poll();
    }
    void poll();
    const interval = setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      alive.current = false;
      controller?.abort();
      sendController.current?.abort();
      clearInterval(interval);
      clearTimeout(continuation);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [room, user.id, peerId]);

  useEffect(() => {
    if (peerId && ready) composer.current?.focus();
  }, [peerId, ready]);

  useEffect(() => {
    if (!nearBottom.current) return;
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function updateDraft(body: string) {
    setDraft({
      body,
      attempt:
        draft.attempt?.body === normalizeChatBody(body) ? draft.attempt : null,
    });
    setSendError(null);
    setNotice("");
  }
  function prompt(body: string) {
    if (sending) return;
    updateDraft(body);
    composer.current?.focus();
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      sendingRef.current ||
      loading ||
      !ready ||
      sessionExpired ||
      unavailable
    )
      return;
    let attempt;
    try {
      attempt = chatAttempt(draft.body, draft.attempt);
    } catch (error) {
      setSendError(errorMessage(error));
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    setNotice("");
    setDraft({ body: attempt.body, attempt });
    const controller = new AbortController();
    sendController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const message = peerId
        ? await sendDirectMessage(peerId, user.id, attempt, controller.signal)
        : await sendChatMessage(room, attempt, controller.signal);
      if (!alive.current) return;
      publish(timeline.current.acceptSent(message));
      setDraft(emptyDraft);
      setNotice("Message sent.");
      refresh.current();
    } catch (error) {
      if (!alive.current) return;
      setSendError(errorMessage(error));
    } finally {
      sendingRef.current = false;
      clearTimeout(timeout);
      if (alive.current) setSending(false);
    }
  }
  function latest() {
    nearBottom.current = true;
    setUnread(0);
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }

  return (
    <>
      <div className={styles.conversation}>
        <div
          ref={messageList}
          className={styles.messages}
          role="log"
          aria-label={`Messages in ${roomLabel}`}
          aria-live={loading ? "off" : "polite"}
          aria-relevant="additions"
          aria-busy={loading}
          tabIndex={0}
          onScroll={() => {
            const list = messageList.current;
            if (!list) return;
            nearBottom.current =
              list.scrollHeight - list.scrollTop - list.clientHeight < 80;
            if (nearBottom.current) setUnread(0);
          }}
        >
          {loading ? (
            <p className={styles.loading}>Loading recent messages…</p>
          ) : messages.length === 0 && !loadError ? (
            <div className={styles.empty}>
              <Sparkles size={25} aria-hidden="true" />
              <strong>
                {peerId
                  ? "Say hello. Make a plan."
                  : "A place. A conversation. A plan."}
              </strong>
              <p>
                {peerId
                  ? `Start a direct conversation with ${roomLabel}. Introduce yourself, suggest a coffee or share a place to explore.`
                  : `Travellers and locals can turn the map into shared plans. Ask about ${roomLabel}, find a coffee buddy, or plan a city walk.`}
              </p>
              <span>
                {peerId
                  ? "Your messages stay in this conversation."
                  : "Be the first to leave a message here."}
              </span>
            </div>
          ) : (
            messages.map((message) => {
              const own = message.author.id === user.id;
              return (
                <article
                  className={styles.message}
                  data-own={own}
                  key={message.id}
                >
                  <div className={styles.byline}>
                    {!own && onSelectPlayer ? (
                      <button
                        type="button"
                        className={styles.author}
                        aria-label={`Options for @${message.author.handle}`}
                        onClick={() => onSelectPlayer(message.author)}
                      >
                        @{message.author.handle}
                      </button>
                    ) : (
                      <strong>
                        {own ? "You" : `@${message.author.handle}`}
                      </strong>
                    )}
                    <span>
                      {message.author.userType === "local"
                        ? "Local"
                        : "Traveller"}
                    </span>
                    <time dateTime={message.sentAt} title={message.sentAt}>
                      {new Date(message.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>{message.body}</p>
                </article>
              );
            })
          )}
        </div>
        {unread > 0 && (
          <button className={styles.latest} type="button" onClick={latest}>
            <ArrowDown size={15} /> {unread} new{" "}
            {unread === 1 ? "message" : "messages"}
          </button>
        )}
      </div>
      {loadError && (
        <div className={styles.loadError} role="status">
          <p>{loadError.message}</p>
          <button type="button" onClick={() => refresh.current()}>
            Retry connection
          </button>
        </div>
      )}
      {!peerId && (
        <div className={styles.prompts} aria-label="Conversation starters">
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              prompt(`What is a local favourite around ${roomLabel}?`)
            }
          >
            <MapPin size={13} /> Ask a local
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              prompt(`Anyone up for a coffee around ${roomLabel}?`)
            }
          >
            <Coffee size={13} /> Coffee buddy
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              prompt(
                `Would anyone like to plan a city walk around ${roomLabel}?`,
              )
            }
          >
            <Globe2 size={13} /> City walk
          </button>
        </div>
      )}
      <form className={styles.composer} onSubmit={send}>
        <div className={styles.composerHeading}>
          <label htmlFor={composerId}>
            {peerId ? `Message ${roomLabel}` : `Posting as @${user.handle}`}
          </label>
          <span data-over={count > CHAT_CHARACTER_LIMIT}>{count}/1,000</span>
        </div>
        <textarea
          ref={composer}
          id={composerId}
          rows={2}
          maxLength={CHAT_CHARACTER_LIMIT * 2}
          value={draft.body}
          placeholder={
            peerId
              ? `Say hello to ${roomLabel}…`
              : `Say something about ${roomLabel}…`
          }
          disabled={sending}
          aria-invalid={Boolean(validation)}
          aria-describedby={sendError || validation ? errorId : undefined}
          onChange={(event) => updateDraft(event.target.value)}
        />
        {(sendError || validation) && (
          <p className={styles.sendError} id={errorId} role="alert">
            {sendError?.message ?? validation}
          </p>
        )}
        <div className={styles.sendRow}>
          <span role="status">
            {sending
              ? "Sending…"
              : notice || "Share plans. Keep personal details private."}
          </span>
          <button
            type="submit"
            disabled={
              sending ||
              loading ||
              !ready ||
              sessionExpired ||
              unavailable ||
              Boolean(validation) ||
              !normalizedBody
            }
          >
            {sending ? "Sending…" : retrying ? "Retry send" : "Send"}
            <Send size={15} />
          </button>
        </div>
        {sessionExpired && (
          <Link className={styles.signIn} href="/login">
            Sign in again
          </Link>
        )}
      </form>
    </>
  );
}

function DirectInbox({
  user,
  onOpen,
}: {
  user: AuthUser;
  onOpen: (peer: ChatPeer) => void;
}) {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ChatRequestError | null>(null);
  const retry = useRef<() => void>(() => undefined);

  useEffect(() => {
    let active = true;
    let requesting = false;
    let halted = false;
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
        const threads = await fetchDirectConversations(user.id, request.signal);
        if (!active) return;
        setConversations(threads);
        setFailure(null);
      } catch (error) {
        if (!active || (request.signal.aborted && !timedOut)) return;
        const next = errorMessage(error);
        setFailure(next);
        halted = next.status === 401 || next.status === 403;
      } finally {
        clearTimeout(timeout);
        requesting = false;
        if (active) setLoading(false);
      }
    }
    retry.current = () => {
      halted = false;
      void poll();
    };
    function visibility() {
      if (document.hidden) controller?.abort();
      else void poll();
    }
    void poll();
    const interval = setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [user.id]);

  return (
    <>
      <p className={styles.disclosure}>
        Your direct conversations, wherever you are in the city.
      </p>
      <div
        className={styles.inbox}
        aria-label="Message inbox"
        aria-busy={loading}
      >
        {loading ? (
          <p className={styles.loading}>Loading your messages…</p>
        ) : conversations.length ? (
          conversations.map(({ peer, lastMessage }) => (
            <button
              type="button"
              className={styles.thread}
              key={peer.id}
              onClick={() => onOpen(peer)}
              aria-label={`Open conversation with @${peer.handle}`}
            >
              <span className={styles.contactAvatar} aria-hidden="true">
                {peer.handle.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.threadText}>
                <strong>@{peer.handle}</strong>
                <span>
                  {lastMessage.author.id === user.id ? "You: " : ""}
                  {lastMessage.body}
                </span>
              </span>
              <time
                dateTime={lastMessage.sentAt}
                title={new Date(lastMessage.sentAt).toLocaleString()}
              >
                {new Date(lastMessage.sentAt).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </button>
          ))
        ) : (
          !failure && (
            <div className={styles.empty}>
              <Users size={28} aria-hidden="true" />
              <strong>Your next city friend starts here.</strong>
              <p>
                Pick a real player on the map, in Find nearby players or in city
                chat, then choose Message.
              </p>
              <span>Conversations appear here after the first message.</span>
            </div>
          )
        )}
      </div>
      {failure && (
        <div className={styles.loadError} role="status">
          <p>{failure.message}</p>
          <button type="button" onClick={() => retry.current()}>
            Retry connection
          </button>
        </div>
      )}
      {failure?.status === 401 && (
        <Link
          className={`${styles.signIn} ${styles.inboxSignIn}`}
          href="/login"
        >
          Sign in again
        </Link>
      )}
      <p className={styles.inboxNote}>
        Messages are visible to the two people in each conversation. City and
        Here remain shared rooms.
      </p>
    </>
  );
}
