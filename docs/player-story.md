# ROAM Lisbon player story

## The promise

As a newcomer to Lisbon, I want to arrive as my own character, find something worth doing, discover another part of the city, and keep the memory of my choices, so I feel that I lived a small, coherent story rather than opened a collection of unrelated tools.

Tourists begin at the airport and choose a simulated ride to their home base. Locals begin at home in third-person view. After that, both follow the same open-ended first chapter. Real people, nearby chat, shared activities, and radio enrich the chapter, but no one must be online for it to progress.

For example, a tourist lands, pays for a simulated ride, and reaches their home base. They choose a café experience, search the map for another area, confirm transport if it is too far to walk, make a second memory there, and end with a recap of those actual choices. A local skips the airport and starts this path from home. At any point either player may look for nearby people, chat, join an outing, or listen to radio without turning those optional actions into required checkpoints.

## First playable chapter

| Beat | Player intent | Existing mechanic | Completion signal |
| --- | --- | --- | --- |
| 1. Settle in | Reach the city or start at home | Arrival, transport, saved home | Journey is in the city with no pending ticket or hub |
| 2. Make a memory | Choose a meaningful experience | Place scenarios and choice ledger | First confirmed scenario choice |
| 3. See another side | Travel to another area and do something there | Map search, location preview, paid transport outside walking range, scenarios | Confirmed choice at a different place |
| 4. Keep the story | Reflect on the chapter | Journal, recap, itinerary | Trip is finished |

The guide derives progress from existing trip history. It never charges the wallet, changes the trip, invents a meeting, or marks an unconfirmed action complete. It remains available from the world and phone. Its primary action opens the existing screen that can advance the current beat. If no scenario is available at the current place, it opens map search; the current location popup still handles transport choices and arrival.

## Acceptance criteria

1. A new tourist sees arrival as the next step; a new local starts with the first memory.
2. After a confirmed choice, the guide asks for a choice in another area and opens travel or nearby experiences according to the current place.
3. Paid transport remains the only path for a non-walkable change of area. The story guide never bypasses fare confirmation.
4. Completing a chapter opens the recap. Reloading recalculates the same story position from saved trip history.
5. Nearby players are an optional branch. Empty presence does not stall the story.
6. All story copy distinguishes simulation from real bookings, meetings, and visits.

## Build sequence

1. **Now:** A visible next-step prompt and a single story guide, wired to arrival, experiences, travel, nearby discovery, and recap.
2. **Next:** Make home, venue actions, and shared outings create durable, server-validated memories so the story recognizes more than scenario cards.
3. **Then:** Save the chapter itself across devices, replacing the current browser-scoped trip storage without losing existing saves; keep wallet charges in the authoritative ledger.
4. **Later:** Add authored local and tourist chapters with choices and consequences, plus social goals that require mutual participation rather than merely seeing another avatar.

The earlier [PRD](PRD.md) describes the original simulation MVP. This story reflects the later accepted 3D world, local accounts, transport, wallet, and multiplayer work. It is the player-facing path for organizing those systems; it does not replace their data and safety contracts.
