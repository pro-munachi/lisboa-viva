# Multiplayer presence

The first multiplayer slice lets authenticated players see who else is active in the Lisbon–Sintra world. It deliberately covers presence and meeting on the map; chat, friendships, blocking, trading and durable social history remain separate milestones.

## Behavior

- Opening `/play` publishes the account handle, tourist/local type, current in-world map coordinate and area label.
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

Every endpoint requires a valid active session. Coordinates must remain inside the bundled Lisbon–Sintra map and query radii are capped at 25 km. Responses expose only account ID, handle, tourist/local type, coarse in-world location, approximate distance and last-seen time. Email, roles, session information and real device location are never returned.

Presence uses bounded HTTP polling for the first playable release. Durable chat and higher-frequency movement should use the planned authorized WebSocket/outbox design rather than increasing the polling rate.
