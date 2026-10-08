import {
  ChatRequestError,
  chatBodyError,
  parseChatMessage,
  parseChatPage,
  type ChatAttempt,
  type ChatMessage,
  type ChatPage,
} from "./chat-client";

export type ChatPeer = {
  id: string;
  handle: string;
  userType: "tourist" | "local";
};
export type DirectConversation = {
  peer: ChatPeer;
  lastMessage: ChatMessage;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cursor = /^(0|[1-9][0-9]{0,18})$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function directRoom(peerId: string) {
  if (!uuid.test(peerId) || peerId === "00000000-0000-0000-0000-000000000000")
    throw new ChatRequestError("Choose a valid ROAM account to message.");
  return `direct:${peerId}`;
}

function participants(message: ChatMessage, peerId: string, viewerId: string) {
  if (message.author.id !== peerId && message.author.id !== viewerId)
    throw new ChatRequestError("Messages belong to a different conversation.");
  return message;
}

export function parseDirectConversations(
  value: unknown,
  viewerId: string,
): DirectConversation[] {
  if (
    !record(value) ||
    !Array.isArray(value.conversations) ||
    value.conversations.length > 50
  )
    throw new ChatRequestError("Messages returned an unreadable inbox.");
  const peers = new Set<string>();
  let previous: bigint | null = null;
  return value.conversations.map((item) => {
    if (
      !record(item) ||
      !record(item.peer) ||
      typeof item.peer.id !== "string" ||
      !uuid.test(item.peer.id) ||
      item.peer.id === viewerId ||
      peers.has(item.peer.id) ||
      typeof item.peer.handle !== "string" ||
      !item.peer.handle ||
      item.peer.handle.length > 100 ||
      (item.peer.userType !== "local" && item.peer.userType !== "tourist")
    )
      throw new ChatRequestError("Messages returned an unreadable contact.");
    const peer: ChatPeer = {
      id: item.peer.id,
      handle: item.peer.handle,
      userType: item.peer.userType,
    };
    const lastMessage = participants(
      parseChatMessage(item.lastMessage, directRoom(peer.id)),
      peer.id,
      viewerId,
    );
    const id = BigInt(lastMessage.id);
    if (previous !== null && id >= previous)
      throw new ChatRequestError("Messages returned an out-of-order inbox.");
    previous = id;
    peers.add(peer.id);
    return { peer, lastMessage };
  });
}

async function check(response: Response) {
  if (response.ok) return;
  const messages: Record<number, string> = {
    400: "This account or message is not available. Check it and retry.",
    401: "Your session has expired. Sign in again to continue chatting.",
    403: "This account cannot use messages right now.",
    404: "This person is no longer available to message.",
    409: "This retry no longer matches the original message. Edit your draft and send again.",
    413: "Your message is too long to send.",
    429: "You are sending messages quickly. Wait a moment, then retry.",
  };
  throw new ChatRequestError(
    messages[response.status] ||
      "Messages are temporarily unavailable. Your draft is still here.",
    response.status,
  );
}

export async function fetchDirectConversations(
  viewerId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<DirectConversation[]> {
  const response = await fetcher("/api/chat/direct/conversations", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  await check(response);
  return parseDirectConversations(
    await response.json().catch(() => null),
    viewerId,
  );
}

export async function fetchDirectPage(
  peerId: string,
  viewerId: string,
  after: string | null,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChatPage> {
  const room = directRoom(peerId);
  if (peerId === viewerId)
    throw new ChatRequestError("Choose another person to message.");
  if (
    after !== null &&
    (!cursor.test(after) || BigInt(after) > BigInt("9223372036854775807"))
  )
    throw new ChatRequestError("The message cursor is invalid.");
  const query = new URLSearchParams({ peer: peerId, limit: "50" });
  if (after !== null) query.set("after", after);
  const response = await fetcher(`/api/chat/direct/messages?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  await check(response);
  const page = parseChatPage(
    await response.json().catch(() => null),
    room,
    after,
  );
  page.messages.forEach((message) => participants(message, peerId, viewerId));
  return page;
}

export async function sendDirectMessage(
  peerId: string,
  viewerId: string,
  attempt: ChatAttempt,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChatMessage> {
  const room = directRoom(peerId);
  if (peerId === viewerId)
    throw new ChatRequestError("Choose another person to message.");
  const error = chatBodyError(attempt.body);
  if (error) throw new ChatRequestError(error);
  const response = await fetcher("/api/chat/direct/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ recipientId: peerId, ...attempt }),
    signal,
  });
  await check(response);
  const value = await response.json().catch(() => null);
  const message = participants(
    parseChatMessage(record(value) ? value.message : null, room),
    peerId,
    viewerId,
  );
  if (message.author.id !== viewerId)
    throw new ChatRequestError(
      "Messages returned an unreadable send confirmation.",
    );
  return message;
}
