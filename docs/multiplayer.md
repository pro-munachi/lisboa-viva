# Multiplayer presence

The first multiplayer slice lets authenticated players see who else is active in the Lisbon–Sintra world. Presence and meeting on the map work alongside [shared city/place chat](chat.md). Friendships, blocking, trading and durable social history remain separate milestones.

## Behavior

- Opening `/play` publishes the account handle, tourist/local type, current viewed in-world map coordinate and area label. This is map-view presence, not device GPS or continuous walking-position tracking.
- The browser sends a heartbeat and refreshes nearby players every 10 seconds.
- Presence expires after 45 seconds without a heartbeat, so a closed tab or lost connection disappears without a reliable unload request.
- Logout deletes the current account's presence immediately.
- The nearby panel can hide the player by deleting presence, and can rejoin without signing out.
- Other players appear as original 3D ROAM characters with `@handle` labels. Selecting a nearby player in the panel moves the camera to their reported area.

## API

| Browser endpoint                   | Go endpoint                       | Purpose                                                            |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `PUT /api/multiplayer/presence`    | `PUT /v1/multiplayer/presence`    | Upsert the signed-in player's current coarse in-world position.    |
| `DELETE /api/multiplayer/presence` | `DELETE /v1/multiplayer/presence` | Leave multiplayer immediately.                                     |
| `GET /api/multiplayer/nearby`      | `GET /v1/multiplayer/nearby`      | List active players within a bounded radius, excluding the caller. |

Every endpoint requires a valid active session. Coordinates must remain inside the bundled Lisbon–Sintra map and query radii are capped at 25 km. Responses expose only account ID, handle, tourist/local type, coarse in-world location, approximate distance, last-seen time and saved character appearance. Email, roles, session information and real device location are never returned.

Presence uses bounded HTTP polling for the first playable release. Higher-frequency movement should use the planned authorized WebSocket/outbox design rather than increasing the polling rate. Transport scenes defer peer rebuilding and hide the nearby panel until the destination returns, so presence polling cannot take over the journey camera. The local trip palette overrides the traveller's top colour while saved outfit, hair, skin, trousers and shoes remain consistent in the city, rooms and transport scenes; nearby peers display their account's saved appearance.
