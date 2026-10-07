# Place-connected chat

ROAM combines the playable city, mapped places and a travel community. This chat foundation takes inspiration from [Nomadtable’s shared travel plans](https://www.nomadtable.app/) and [Lagos Life’s conversations alongside the game](https://lagoslife.app/), with ROAM’s own interface and account service.

Open **City chat** from the game controls. **Nearby** is a group room for signed-in players publishing live presence in the same in-world area. **Private** starts a two-person conversation with a player who appeared nearby; that conversation remains available for the browser session after the player leaves the nearby roster. **Lisbon** is the public city room. Select a mapped hotspot or enter a public venue/transport interior, then choose **Here** for that place’s public room. Private homes, custom Maps pins and arbitrary street-search results do not create shared rooms.

Conversation starters fill the composer with a question for a local, a coffee invitation or a city-walk idea. They never send automatically. Messages come only from authenticated accounts. Simulated residents and authored encounters do not post, and no online counts or fabricated conversations are shown.

## Account and storage boundary

Both endpoints use Go’s existing session middleware and active-account checks. Go derives the author from the session; the browser cannot submit a username, role or user ID. Public identity contains only account ID, username and tourist/local category. Emails, session tokens and roles are excluded.

Migration `004_chat.sql` creates PostgreSQL message storage through the ordered, checksum-checked startup runner. Go embeds `services/game/chat_rooms.json`: one Lisbon room plus 644 mapped-place rooms, including 24 beaches. A parity test checks this against the frontend directory. After changing the mapped directory, regenerate it with:

```sh
node --import ./apps/web/node_modules/tsx/dist/loader.mjs scripts/chat-rooms-build.cjs
```

Messages persist across sessions/devices connected to the same database. Drafts stay in the open panel’s memory, scoped by account and room. Trips, character movement and custom map pins retain their existing storage boundary; chat does not synchronize or expose them to other players.

## API

Browser requests use `/api/chat/messages`. Next.js forwards to `/v1/chat/messages`, preserving the session and enforcing the existing write-origin and 16 KiB body limits. Responses are uncached.

- `GET ?room=lisbon:city&limit=50` returns the newest 50 messages in ascending ID order. With `after=123`, it returns newer messages in ascending order. Limits are 1–50. IDs/cursors are decimal strings preserving 64-bit precision. The response is `{messages, hasMore, nextCursor}`; `hasMore` applies to forward pages, not older history.
- `POST {room, body, clientId}` returns `{message}` with HTTP 201 for new messages or 200 for identical retries. The account’s `clientId` is a UUID; changing text or room with an existing UUID returns 409. The UI retains the UUID after an uncertain network result to avoid duplicates.
- A message is `{id, room, body, sentAt, author: {id, handle, userType}}`; timestamps are UTC. Rooms are `lisbon:city` or `lisbon:hotspot:<canonical mapped ID>`. Unknown rooms are rejected.
- Nearby rooms use `nearby:<current area>`. Go checks an unexpired `player_presence` row and requires the requested area to match it before every read or send. Hiding from multiplayer or allowing the 45-second heartbeat to expire removes access.
- Direct rooms use `direct:<other user UUID>`. Go combines the authenticated account and requested peer into one sorted internal pair key. Responses retain the caller-facing room name and never reveal the internal key. A third account derives a different key and cannot read the pair’s messages.
- Bodies are trimmed, nonempty plain text with at most 1,000 Unicode code points. The composer caps pasted input at 2,000 UTF-16 units, allowing 1,000 emoji while keeping the stricter code-point validation. Line feeds and tabs are allowed; other controls are rejected. React displays text without interpreting HTML. Unknown JSON fields and malformed/duplicate query parameters are rejected.

Posting is limited to 20 valid attempts/minute per verified account, with a bounded in-memory limiter. It is per API instance, not a distributed quota. Room transactions lock before allocating IDs so polling cannot miss a lower ID that commits late. Account/attempt locking makes retries safe across rooms.

The open panel polls every five seconds while visible, drains newer pages, and cancels requests on room changes/close. POST acknowledgements do not advance the polling cursor. A bounded message window and a new-message button preserve the reader’s scroll position. Connection failures preserve the draft; expired sessions offer sign-in again.

## Muna’s verification

Pull `feat/arrival-and-city-experience` and rebuild both web and Go services. Starting only the web app leaves the previous API without chat routes. With Docker, use `docker compose up --build`. For native development, run `npm run local:stop`, then `npm run local:start` in a normal Terminal, and restart the web app.

1. Use separate browser profiles or a normal/private window. Create a traveller and a local account, join multiplayer in the same area, and open **City chat** in each.
2. Send from both accounts in **Nearby**. Check sender identities, five-second updates, reload persistence and plain-text rendering. Hide one account from multiplayer and confirm nearby access ends.
3. Select the same mapped café/landmark and choose **Here**. Check its conversation independently of city chat; change places to check room/draft isolation.
4. Select the other nearby player under **Private**, send from both accounts, and confirm a third account cannot see the pair’s messages. Sign out and confirm the API rejects reading/posting without a valid session. A suspended account must also lose access.
5. Retry the same POST/UUID to verify one stored message. Changed text/room must return 409. Test empty/overlong bodies, invented rooms and attempts to submit another author’s identity.

This increment supplies public rooms, presence-authorized nearby groups, two-person private conversations, and planning prompts. The multiplayer slice supplies short-lived map presence and saved character appearance; see [multiplayer scope](multiplayer.md). Structured activities/RSVPs, invitations, blocking/reporting, moderation tools, read receipts and typing indicators require later implementation before a broader public community launch.
