# Multiplayer presence

The first multiplayer slice lets authenticated players see who else is active in the Lisbon–Sintra world. Presence and meeting on the map work alongside [shared city/place chat](chat.md). Friendships, blocking, trading and durable social history remain separate milestones.

## Behavior

- Opening `/play` publishes the account handle, tourist/local type and current ROAM location: a visited public venue or trip arrival point, with its area label. Panning, searching and inspecting another player change the camera without moving that published location. This is in-app presence, not device GPS or continuous walking-position tracking.
- The browser sends a heartbeat and refreshes nearby players every 10 seconds.
- Presence expires after 45 seconds without a heartbeat, so a closed tab or lost connection disappears without a reliable unload request.
- Logout deletes the current account's presence immediately.
- The permanent **Find nearby players** control opens an **Around you** directory. Its eye control can hide the player by deleting presence, and can rejoin without signing out. A failed leave request remains labelled as pending/retrying until acknowledged.
- Nearby discovery shows players within 2 km of the current ROAM location, plus anyone visiting the same canonical public venue. It shows the current public venue or area, **Message**, player options and **Join them** for supported public interiors. Join resolves the account's newest live venue again before entering it.
- A genuinely new nearby identity can produce a dismissible 12-second popup. The first roster is silent; refreshes and brief departures do not repeat notices. Notices are capped at one per 30 seconds, without queueing a burst, and remain available while a keyboard reader focuses their actions.
- Other players appear as original 3D ROAM characters with `@handle` labels. Outdoor peers do not have a room identifier. Players visiting public rooms appear only in that same room's scene, using their saved appearance, instead of being duplicated outdoors. Private homes and arbitrary custom pins do not publish shared room identifiers.
- Public rooms render up to twelve live peer characters. The directory still lists the eligible nearby players; a crowded room does not allocate an unbounded number of 3D actors. Joining a player already in the same room keeps the current local activity and camera.
- Clicking a real character or directory entry opens its action card. **Message** starts a private conversation, **Find on map** explicitly moves the camera, and **Join them** enters the public venue when available. Passive roster polling never reframes the city or interior camera. Simulated pedestrians do not have messaging actions.

## API

| Browser endpoint                   | Go endpoint                       | Purpose                                                            |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `PUT /api/multiplayer/presence`    | `PUT /v1/multiplayer/presence`    | Upsert the signed-in player's current coarse in-world position.    |
| `DELETE /api/multiplayer/presence` | `DELETE /v1/multiplayer/presence` | Leave multiplayer immediately.                                     |
| `GET /api/multiplayer/nearby`      | `GET /v1/multiplayer/nearby`      | List active players within a bounded radius, excluding the caller. |

Every endpoint requires a valid active session. Coordinates must remain inside the bundled Lisbon–Sintra map and query radii are capped at 25 km. Responses expose only account ID, handle, tourist/local type, coarse in-world location, optional canonical public `placeId`, approximate distance, last-seen time and saved character appearance. Email, roles, session information and real device location are never returned. The optional place ID must identify a bundled public place; coordinate bounds and place IDs are validated independently. The first-party UI publishes a public venue's source coordinate when entering it. Unknown IDs, private homes and arbitrary user pins are rejected as shared rooms. The browser validates this public identity and location boundary again before rendering peers.

Presence uses bounded HTTP polling for the first playable release. Higher-frequency movement should use the planned authorized WebSocket/outbox design rather than increasing the polling rate. Transport scenes defer peer rebuilding and hide the nearby panel until the destination returns, so presence polling cannot take over the journey camera. The local trip palette overrides the traveller's top colour while saved outfit, hair, skin, trousers and shoes remain consistent in the city, rooms and transport scenes; nearby peers display their account's saved appearance.
