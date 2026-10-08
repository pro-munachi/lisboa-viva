# Place-connected chat

ROAM combines the playable city, mapped places and a travel community. This chat foundation takes inspiration from [Nomadtable’s shared travel plans](https://www.nomadtable.app/) and [Lagos Life’s conversations alongside the game](https://lagoslife.app/), with ROAM’s own interface and account service.

Open **Chats** from the game controls. **Nearby** is a group conversation for accounts sharing live presence in the same ROAM area. **Lisbon** is the city room. Select a mapped hotspot or enter a public venue/transport interior, then choose **Here** for that place’s room. Private homes, custom Maps pins and arbitrary street-search results do not create shared rooms. Anyone signed in can select a public room; this does not establish their real location or physical presence.

Click another real player’s character, choose **Find nearby players**, or click their sender name in a conversation. ROAM opens that person’s action card; **Message** opens a direct conversation. **Find on map** is available only when that account appears in the current visible presence roster. These actions use authenticated player identities, not the simulated pedestrians or authored encounters. The interaction is inspired by Lagos Life’s player actions and message inbox, expressed through ROAM’s own account, map and visual design.

The permanent nearby control opens an **Around you** directory instead of displaying a roster over the map. Nearby means within 2 km of the current shared ROAM location (a public venue visit or arrival point), plus players in the same canonical public venue. Panning, searching or looking at another player does not move the published visit. The directory shows each real player’s current shared venue or area, with **Message**, player options and **Join them** for a supported public interior. A new nearby identity can trigger a dismissible 12-second notice; the first successful roster is silent, refreshes do not repeat notices, and notices are limited to one per 30 seconds without queueing a burst. Hiding presence removes nearby identities from this directory.

Choose **Messages** in the chat panel to find and respond to direct conversations, even when the other person is elsewhere or has stopped sharing map presence. The inbox shows each person’s latest message, with the newest conversation first. A conversation appears in both participants’ inboxes after its first stored message. **Back to message inbox** returns from a thread; selecting **Lisbon** or **Here** switches back to shared room chat. The direct view explicitly names both participants and its private scope. Messages are plain text; there are no invented replies, typing indicators, online badges or read receipts.


Conversation starters fill the composer with a question for a local, a coffee invitation or a city-walk idea. They never send automatically. Messages come only from authenticated accounts. Simulated residents and authored encounters do not post, and no online counts or fabricated conversations are shown.

## Account and storage boundary

All chat endpoints use Go’s existing session middleware and active-account checks. Go derives the author from the session; the browser cannot submit a username, role or user ID. Public identity contains only account ID, username and tourist/local category. Emails, session tokens and roles are excluded.

Migration `004_chat.sql` creates PostgreSQL message storage through the ordered, checksum-checked startup runner. Go embeds `services/game/chat_rooms.json`: one Lisbon room plus 644 mapped-place rooms, including 24 beaches. A parity test checks this against the frontend directory. After changing the mapped directory, regenerate it with:

```sh
node --import ./apps/web/node_modules/tsx/dist/loader.mjs scripts/chat-rooms-build.cjs
```

Messages persist across sessions/devices connected to the same database. Drafts stay in the open panel’s memory, scoped by account and room or selected direct-message recipient. Switching tabs or people preserves that conversation’s draft and retry UUID; closing the panel discards its unsent drafts. Trips, character movement and custom map pins retain their existing storage boundary; chat does not synchronize or expose them to other players.

## API

Browser requests use `/api/chat/messages`. Next.js forwards to `/v1/chat/messages`, preserving the session and enforcing the existing write-origin and 16 KiB body limits. Responses are uncached.

- `GET ?room=lisbon:city&limit=50` returns the newest 50 messages in ascending ID order. With `after=123`, it returns newer messages in ascending order. Limits are 1–50. IDs/cursors are decimal strings preserving 64-bit precision. The response is `{messages, hasMore, nextCursor}`; `hasMore` applies to forward pages, not older history.
- `POST {room, body, clientId}` returns `{message}` with HTTP 201 for new messages or 200 for identical retries. The account’s `clientId` is a UUID; changing text or room with an existing UUID returns 409. The UI retains the UUID after an uncertain network result to avoid duplicates.
- A message is `{id, room, body, sentAt, author: {id, handle, userType}}`; timestamps are UTC. Public rooms are `lisbon:city` or `lisbon:hotspot:<canonical mapped ID>`. The authenticated nearby and legacy direct room forms are described below; other rooms are rejected.
- Nearby rooms use `nearby:<current area>`. Go checks an unexpired `player_presence` row and requires the requested area to match it before every read or send. Hiding from multiplayer or allowing the 45-second heartbeat to expire removes access.
- The existing room API also accepts legacy direct rooms using `direct:<other user UUID>`. Go combines the authenticated account and requested peer into one sorted internal pair key. Responses retain the caller-facing room name and never reveal the internal key. A third account derives a different key and cannot read the pair’s messages.
- Bodies are trimmed, nonempty plain text with at most 1,000 Unicode code points. The composer caps pasted input at 2,000 UTF-16 units, allowing 1,000 emoji while keeping the stricter code-point validation. Line feeds and tabs are allowed; other controls are rejected. React displays text without interpreting HTML. Unknown JSON fields and malformed/duplicate query parameters are rejected.

Posting is limited to 20 valid attempts/minute per verified account, with a bounded in-memory limiter. It is per API instance, not a distributed quota. Room transactions lock before allocating IDs so polling cannot miss a lower ID that commits late. Account/attempt locking makes retries safe across rooms.

The open panel polls every five seconds while visible, drains newer pages, and cancels requests on room or recipient changes/close. POST acknowledgements do not advance the polling cursor. A bounded message window and a new-message button preserve the reader’s scroll position. Connection failures preserve the draft; expired sessions offer sign-in again.

### Direct conversations

Browser requests use `/api/chat/direct/messages` and `/api/chat/direct/conversations`, forwarded to matching `/v1/chat/direct/...` endpoints with the same session, write-origin and body-size protections. Authentication and participation checks remain in Go; the proxy does not accept a viewer identity from the browser.

- `GET /messages?peer=<account UUID>&limit=50` returns the newest 50 messages between the authenticated account and the selected peer, in ascending ID order. `after=<cursor>` retrieves newer messages with the same cursor format and pagination contract as public rooms.
- `POST /messages {recipientId, body, clientId}` stores a direct message; the sender comes from the session. The existing 1,000-code-point plain-text rules and idempotent retry contract apply. Identical retries return the stored message; a reused UUID with changed text or recipient returns 409.
- `GET /conversations` returns `{conversations: [{peer: {id, handle, userType}, lastMessage}]}`. It is scoped to the authenticated account, includes at most 50 distinct peers, and sorts by latest message ID descending. There is no unread count or read status.
- Message payloads retain the existing shape, with `room: direct:<other account UUID>` computed from the authenticated viewer’s perspective. Neither messages nor inbox items expose account emails, roles, sessions or appearance metadata.
- Self-messaging, malformed peers, unknown or unavailable accounts are rejected. A third account cannot retrieve either direction of someone else’s conversation. Suspended/deleted account checks apply to both participants.

The private UI uses the dedicated direct endpoints and inbox. Legacy `direct:<UUID>` room requests remain supported for API compatibility and use the same direct conversation store. Migration `008_legacy_direct_messages.sql` imports previously stored room-API private messages into that store, preserving participants, text, retry UUIDs and timestamps. Dedicated message IDs are reassigned in legacy order; legacy polling cursors should reset on upgrade. The migration aborts on incompatible retry UUIDs or malformed pairs rather than dropping those messages.

Migration `006_direct_messages.sql` stores sender and recipient IDs separately from public room messages. Both directions serialize on the same account-pair lock before allocating a message ID so forward polling cannot skip a late lower-ID commit. Storage also rechecks account eligibility. Direct-message authors and selected recipients are validated again in the browser before rendering; responses for a different pair are rejected.

The inbox polls while open and visible. Selecting a thread cancels its inbox poll and starts the conversation poll; returning to the inbox reloads its latest messages. Requests time out and cancel on navigation. The direct composer focuses when its initial history is ready; names and bodies render as text. Message options are keyboard accessible, and mobile controls have at least 44 px targets.

## Muna’s verification

Pull `feat/arrival-and-city-experience` and rebuild both web and Go services. Starting only the web app leaves the previous API without chat routes. With Docker, use `docker compose up --build`. For native development, run `npm run local:stop`, then `npm run local:start` in a normal Terminal, and restart the web app.

1. Use separate browser profiles or a normal/private window. Create a traveller and a local account, share multiplayer presence in the same area, and open **Chats** in each.
2. Send from both accounts in **Nearby**. Check sender identities, five-second updates, reload persistence and plain-text rendering. Hide one account from multiplayer and confirm nearby access ends. Check the public **Lisbon** room separately.

3. Select the same mapped café/landmark and choose **Here**. Check its conversation independently of city chat; change places to check room/draft isolation.
4. Open **Messages**, select the other nearby player, send from both accounts, and confirm a third account cannot see the pair’s messages. Sign out and confirm the API rejects reading/posting without a valid session. A suspended account must also lose access.
5. Retry the same POST/UUID to verify one stored message. Changed text/room must return 409. Test empty/overlong bodies, invented rooms and attempts to submit another author’s identity.
6. Share map presence with the two accounts. Click the other real character or open **Find nearby players** and pick the account; confirm the action card opens without immediately moving the camera. Choose **Message**, send a direct message and verify its two-person disclosure. In the second browser, open **Messages**, select the new conversation and reply. Return to the inbox, reload and confirm persistence.
7. Write different unsent drafts in the city room and in two direct conversations. Switch between them; verify each draft stays with its account/conversation. Send with an uncertain network result and retry with the same UUID; the database should contain one message. Switching people during a request must not put the old response in the new conversation.
8. Use a third account to request the first pair’s messages; it should only ever see its own pair with the requested peer. Verify self-message, unavailable peer, signed-out and suspended-account failures. Confirm the public sender-name action opens that same account’s options, rather than sending automatically.
9. At phone width, check nearby discovery/directory, action-card, inbox, Back, composer, Send and close controls. Navigate with keyboard and Escape; verify focus returns to the previous live control after closing chat. The initial nearby roster should not produce a popup; a newly nearby account should appear once, with a working dismiss/menu action. Enter a public café/gym and verify its name in the directory; **Join them** should enter that canonical place. Private homes and custom pins must never offer a shared venue or join action. Changing to another city/room must not publish or restart a direct message.

This increment supplies shared room conversations, presence-authorized nearby groups, private two-person messages, an inbox, player action cards and planning prompts. The merged multiplayer slice supplies short-lived map presence and saved character appearance; see [multiplayer scope](multiplayer.md). Structured activities/RSVPs, invitations, blocking/reporting, moderation tools, read receipts and typing indicators require later implementation before a broader public community launch.
