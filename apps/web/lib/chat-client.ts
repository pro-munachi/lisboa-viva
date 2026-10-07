export const CHAT_CHARACTER_LIMIT = 1000;
export const CHAT_HISTORY_LIMIT = 300;

export type ChatMessage = {
  id: string;
  room: string;
  body: string;
  sentAt: string;
  author: { id: string; handle: string; userType: "tourist" | "local" };
};
export type ChatPage = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
};
export type ChatAttempt = { clientId: string; body: string };
export type ChatDraft = { body: string; attempt: ChatAttempt | null };

export class ChatRequestError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

export function chatCharacterCount(body: string) {
  return Array.from(body).length;
}

export function normalizeChatBody(body: string) {
  // Match Go strings.TrimSpace, including NEXT LINE but excluding a BOM.
  const whitespace =
    "[\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
  return body.replace(new RegExp(`^${whitespace}+|${whitespace}+$`, "g"), "");
}

export function chatBodyError(body: string): string | null {
  const normalized = normalizeChatBody(body);
  if (!normalized) return "Write a message first.";
  if (chatCharacterCount(normalized) > CHAT_CHARACTER_LIMIT)
    return "Keep your message to 1,000 characters.";
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(normalized))
    return "Remove unsupported control characters from your message.";
  return null;
}

export function chatAttempt(
  body: string,
  previous: ChatAttempt | null,
  uuid: () => string = () => crypto.randomUUID(),
): ChatAttempt {
  const error = chatBodyError(body);
  if (error) throw new ChatRequestError(error);
  const normalized = normalizeChatBody(body);
  return previous?.body === normalized
    ? previous
    : { clientId: uuid(), body: normalized };
}

function isCursor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9][0-9]{0,18})$/.test(value) &&
    BigInt(value) <= BigInt("9223372036854775807")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChatMessage(value: unknown, room: string): ChatMessage {
  if (
    !isRecord(value) ||
    !isCursor(value.id) ||
    value.id === "0" ||
    value.room !== room ||
    typeof value.body !== "string" ||
    chatBodyError(value.body) ||
    typeof value.sentAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value.sentAt) ||
    !Number.isFinite(Date.parse(value.sentAt)) ||
    !isRecord(value.author) ||
    typeof value.author.id !== "string" ||
    !value.author.id ||
    typeof value.author.handle !== "string" ||
    !value.author.handle ||
    (value.author.userType !== "tourist" && value.author.userType !== "local")
  )
    throw new ChatRequestError("Chat returned an unreadable message.");
  return {
    id: value.id,
    room,
    body: value.body,
    sentAt: value.sentAt,
    author: {
      id: value.author.id,
      handle: value.author.handle,
      userType: value.author.userType as "tourist" | "local",
    },
  };
}

export function parseChatPage(
  value: unknown,
  room: string,
  after: string | null,
): ChatPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.messages) ||
    value.messages.length > 50 ||
    typeof value.hasMore !== "boolean" ||
    !(value.nextCursor === null || isCursor(value.nextCursor))
  )
    throw new ChatRequestError("Chat returned an unreadable update.");
  const messages = value.messages.map((item) => parseChatMessage(item, room));
  let previous = after === null ? BigInt(0) : BigInt(after);
  for (const message of messages) {
    const id = BigInt(message.id);
    if (id <= previous)
      throw new ChatRequestError("Chat returned an out-of-order update.");
    previous = id;
  }
  if (
    (messages.length > 0 &&
      value.nextCursor !== messages[messages.length - 1].id) ||
    (value.hasMore && messages.length === 0) ||
    (after !== null &&
      value.nextCursor !== null &&
      BigInt(value.nextCursor) < BigInt(after))
  )
    throw new ChatRequestError("Chat returned an invalid message cursor.");
  return {
    messages,
    hasMore: value.hasMore,
    nextCursor: value.nextCursor,
  };
}

export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
  limit = CHAT_HISTORY_LIMIT,
): ChatMessage[] {
  const room = current[0]?.room ?? incoming[0]?.room;
  const byId = new Map<string, ChatMessage>();
  for (const message of [...current, ...incoming]) {
    if (message.room !== room)
      throw new ChatRequestError("Messages belong to a different room.");
    byId.set(message.id, message);
  }
  return [...byId.values()]
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
    .slice(-limit);
}

/** The poll cursor describes GET history, never the latest locally sent ID. */
export class ChatTimeline {
  cursor: string | null = null;
  messages: ChatMessage[] = [];

  private insert(incoming: ChatMessage[]) {
    const existing = new Set(this.messages.map((message) => message.id));
    const added = incoming.filter(
      (message) => !existing.has(message.id),
    ).length;
    this.messages = mergeChatMessages(this.messages, incoming);
    return { messages: this.messages, added };
  }

  acceptPage(page: ChatPage) {
    const update = this.insert(page.messages);
    this.cursor = page.nextCursor ?? this.cursor ?? "0";
    return update;
  }

  acceptSent(message: ChatMessage) {
    return this.insert([message]);
  }
}

async function checkResponse(response: Response) {
  if (response.ok) return;
  const messages: Record<number, string> = {
    400: "This room or message is not available. Check your message and retry.",
    401: "Your session has expired. Sign in again to continue chatting.",
    403: "This account cannot use chat right now.",
    413: "Your message is too long to send.",
    409: "This retry no longer matches the original message. Edit your draft and send again.",
    429: "You are sending messages quickly. Wait a moment, then retry.",
  };
  throw new ChatRequestError(
    messages[response.status] ||
      "Chat is temporarily unavailable. Your draft is still here.",
    response.status,
  );
}

export async function fetchChatPage(
  room: string,
  after: string | null,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChatPage> {
  if (after !== null && !isCursor(after))
    throw new ChatRequestError("The message cursor is invalid.");
  const query = new URLSearchParams({ room, limit: "50" });
  if (after !== null) query.set("after", after);
  const response = await fetcher(`/api/chat/messages?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  await checkResponse(response);
  const value = await response.json().catch(() => null);
  return parseChatPage(value, room, after);
}

export async function sendChatMessage(
  room: string,
  attempt: ChatAttempt,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChatMessage> {
  const error = chatBodyError(attempt.body);
  if (error) throw new ChatRequestError(error);
  const response = await fetcher("/api/chat/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ room, ...attempt }),
    signal,
  });
  await checkResponse(response);
  const value = await response.json().catch(() => null);
  return parseChatMessage(isRecord(value) ? value.message : null, room);
}
