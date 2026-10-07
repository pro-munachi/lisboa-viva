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
  Coffee,
  Globe2,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { AuthUser } from "../lib/auth";
import type { MultiplayerPeer } from "../lib/multiplayer";
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
import styles from "./ChatPanel.module.css";

export type ChatPanelProps = {
  user: AuthUser;
  cityId: string;
  place?: { id: string; label: string };
  peers?: MultiplayerPeer[];
  nearbyArea?: string;
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
  peers = [],
  nearbyArea,
  onClose,
}: ChatPanelProps) {
  const [tab, setTab] = useState<"nearby" | "direct" | "city" | "here">(
    nearbyArea ? "nearby" : "city",
  );
  const [directPeerId, setDirectPeerId] = useState(peers[0]?.id ?? "");
  const [knownPeers, setKnownPeers] = useState<Record<string, MultiplayerPeer>>(
    () => Object.fromEntries(peers.map((peer) => [peer.id, peer])),
  );
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>({});
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const cityName = getCity(cityId).name;
  const here = tab === "here" && place;
  useEffect(() => {
    if (!peers.length) return;
    setKnownPeers((known) => ({
      ...known,
      ...Object.fromEntries(peers.map((peer) => [peer.id, peer])),
    }));
    if (!directPeerId) setDirectPeerId(peers[0].id);
  }, [peers, directPeerId]);
  const directOptions = Object.values(knownPeers);
  const directPeer = knownPeers[directPeerId];
  const effectiveTab =
    tab === "nearby" && !nearbyArea
      ? "city"
      : tab === "direct" && !directPeer
        ? "city"
        : tab;
  const room =
    effectiveTab === "nearby"
      ? `nearby:${nearbyArea}`
      : effectiveTab === "direct"
        ? `direct:${directPeer!.id}`
        : here
          ? `${cityId}:hotspot:${place.id}`
          : `${cityId}:city`;
  const roomLabel =
    effectiveTab === "nearby"
      ? `people around ${nearbyArea}`
      : effectiveTab === "direct"
        ? `@${directPeer!.handle}`
        : here
          ? place.label
          : cityName;
  const draftKey = `${user.id}/${room}`;
  const setDraft = useCallback(
    (next: ChatDraft) => setDrafts((all) => ({ ...all, [draftKey]: next })),
    [draftKey],
  );

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
          <span>MAPS BECOME PLANS</span>
          <h2 id={titleId}>
            {effectiveTab === "direct"
              ? `Private chat with @${directPeer!.handle}`
              : effectiveTab === "nearby"
                ? `Around ${nearbyArea}`
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
          aria-pressed={effectiveTab === "nearby"}
          disabled={!nearbyArea}
          title={
            nearbyArea
              ? `Chat around ${nearbyArea}`
              : "Join multiplayer to chat nearby"
          }
          onClick={() => setTab("nearby")}
        >
          <MessagesSquare size={16} /> Nearby
        </button>
        <button
          type="button"
          aria-pressed={effectiveTab === "direct"}
          disabled={!directOptions.length}
          title={
            directOptions.length
              ? "Chat privately with a player you met nearby"
              : "No nearby players are online"
          }
          onClick={() => {
            if (!directPeerId && directOptions[0])
              setDirectPeerId(directOptions[0].id);
            setTab("direct");
          }}
        >
          <UserRound size={16} /> Private
        </button>
        <button
          type="button"
          aria-pressed={effectiveTab === "city"}
          onClick={() => setTab("city")}
        >
          <Globe2 size={16} /> {cityName}
        </button>
        <button
          type="button"
          aria-pressed={effectiveTab === "here"}
          disabled={!place}
          title={
            place ? `Chat around ${place.label}` : "Select a mapped place first"
          }
          onClick={() => setTab("here")}
        >
          <MapPin size={16} /> Here
        </button>
      </div>
      {effectiveTab === "direct" && directOptions.length > 0 && (
        <label className={styles.peerPicker}>
          Chat with
          <select
            value={directPeer!.id}
            onChange={(event) => setDirectPeerId(event.target.value)}
          >
            {directOptions.map((peer) => (
              <option key={peer.id} value={peer.id}>
                @{peer.handle} · {peer.area}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className={styles.disclosure}>
        {effectiveTab === "direct"
          ? `Only you and @${directPeer!.handle} can read this conversation.`
          : effectiveTab === "nearby"
            ? `Shared with signed-in players currently around ${nearbyArea}.`
            : "Anyone signed in can join this room. Messages are shared with the room."}
      </p>
      <RoomConversation
        key={draftKey}
        user={user}
        room={room}
        roomLabel={roomLabel}
        draft={drafts[draftKey] ?? emptyDraft}
        setDraft={setDraft}
      />
    </section>
  );
}

function RoomConversation({
  user,
  room,
  roomLabel,
  draft,
  setDraft,
}: {
  user: AuthUser;
  room: string;
  roomLabel: string;
  draft: ChatDraft;
  setDraft: (draft: ChatDraft) => void;
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
          const page = await fetchChatPage(
            room,
            timeline.current.cursor,
            controller.signal,
          );
          if (!active) return;
          publish(timeline.current.acceptPage(page));
          hasMore = page.hasMore;
          setLoadError(null);
          setSendError((failure) => (failure?.status === 401 ? null : failure));
          setReady(true);
          if (!hasMore || document.hidden) break;
        }
      } catch (error) {
        hasMore = false;
        if (!active || (requestController.signal.aborted && !timedOut)) return;
        const failure = errorMessage(error);
        setLoadError(failure);
        halted = failure.status === 401 || failure.status === 403;
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
  }, [room, user.id]);

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
    if (sendingRef.current || loading || !ready || sessionExpired) return;
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
      const message = await sendChatMessage(room, attempt, controller.signal);
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
              <strong>A place. A conversation. A plan.</strong>
              <p>
                Travellers and locals can turn the map into shared plans. Ask
                about {roomLabel}, find a coffee buddy, or plan a city walk.
              </p>
              <span>Be the first to leave a message here.</span>
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
                    <strong>{own ? "You" : `@${message.author.handle}`}</strong>
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
          onClick={() => prompt(`Anyone up for a coffee around ${roomLabel}?`)}
        >
          <Coffee size={13} /> Coffee buddy
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() =>
            prompt(`Would anyone like to plan a city walk around ${roomLabel}?`)
          }
        >
          <Globe2 size={13} /> City walk
        </button>
      </div>
      <form className={styles.composer} onSubmit={send}>
        <div className={styles.composerHeading}>
          <label htmlFor={composerId}>Posting as @{user.handle}</label>
          <span data-over={count > CHAT_CHARACTER_LIMIT}>{count}/1,000</span>
        </div>
        <textarea
          ref={composer}
          id={composerId}
          rows={2}
          maxLength={CHAT_CHARACTER_LIMIT * 2}
          value={draft.body}
          placeholder={`Say something about ${roomLabel}…`}
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
