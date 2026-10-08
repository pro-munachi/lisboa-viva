# Shared activities — Lisbon pilot

The Phone's **Activities** app connects a player-created plan, its private group conversation and a shared visit in the geographic city. The idea combines travel community planning with playful venue interactions. The interface, gestures and scenery are original ROAM work.

## Player journey

1. Open **Phone → Activities**, browse the category filters, or choose **Create activity**.
2. Add a title, category, intended travellers, mapped venue, start time and group size. The five categories are Nightlife, Coffee, Outdoors, Culture and Wellness. Traveller choices are Everyone, Tourist, Nomad, Expat and Local. Starts may be now or planned within thirty days; capacity is two to twelve, including the host.
3. Creating a plan enrolls its host. Other signed-in players choose **Join activity**, then enter its protected room. **Plan**, **Chat** and **Happenings** are views inside the same Phone app. The traveller label describes the invitation; it does not restrict which active player may join.
4. Members can plan in the group conversation before travelling. **Go to venue** closes the Phone and visits the corresponding mapped location. Each player chooses when to visit; joining the activity does not move anyone automatically.
5. The **Shared outing** panel remains over the world while the Phone is closed. It distinguishes members who joined the plan from live players at the meeting place, shows the latest confirmed happening and reopens **Chat & activities**. **Exit venue** leaves the physical scene; **Leave activity** revokes membership. The host's **Close activity** closes the room for everyone.
6. At a café or bar, members can use simulated credits for drinks and choose friendly gestures. Fresh shared venue presence is required for actions. A saved membership or a panned camera is insufficient.

The Phone now has nine apps: Profile, Messages, **Activities**, Nearby, Journey, Journal, Wallet, Home and City guide. Existing direct/public chat remains in Messages; an activity's group chat stays in Activities. An account-scoped store above the active Phone app keeps separate creation, conversation and action drafts. Unsent text, creation fields and unconfirmed action payloads retain their exact retry UUIDs through Phone home and app changes during the current page session. Closing an app aborts its request without discarding that pending attempt; reopening exposes the intentional retry. These drafts do not persist through page refresh or sign out.

## Venues and actual players

The first catalog is deliberately bounded to ten canonical mapped venues from the existing OSM snapshot: A Tasca do Chico, Musicbox, A Paródia, Café Janis, A Flor da Selva, Casa das Histórias - Paula Rego, Auditório Eunice Muñoz, ABHYASA YOGA LISBON, Praia da Conceição and Praia de Santo Amaro. Their IDs are checked against the shared venue room catalog. Categories determine which venues are available in the creation form. Arbitrary map links, private homes and custom pins cannot become shared activity venues in this slice.

The scene uses existing live presence and saved character appearances. Joining a roster does not create a new avatar. Players appear together only when their current public venue matches the same canonical place ID; scenic pedestrians remain separate. Presence means the location chosen inside ROAM, with a forty-five-second heartbeat lifetime. It is not device GPS or evidence that someone is at the real business.

Mapped business names and positions come from the bundled source. Rooms, furnishings, menus, drink prices and playful actions are original simulation choices. Creating a plan makes no business reservation, transport booking or real purchase. There is no claim that these scenes reproduce a surveyed interior or current venue availability.

## Credits, gestures and consent

Each account receives **200 ROAM credits once** when its server wallet is first used. The Phone Wallet shows this balance separately from the trip's simulated euro budget. Credits have no cash value, cannot be redeemed and are not connected to payments.

| Activity venue | Available drink | Cost |
| --- | --- | --- |
| Café | Coffee | 8 credits |
| Bar | Mocktail | 12 credits |
| Bar | Beer | 15 credits |

The server validates the venue menu and balance. A confirmed drink event, wallet deduction and ledger entry commit together. Repeating the same action UUID and payload returns its original event with the current balance; changing a payload for that UUID is rejected. Concurrent spending cannot take the wallet below zero. A failed or interrupted action retains its payload/UUID outside the mounted room view and appears as a saved request with **Retry** in Happenings. Exact confirmation clears only that attempt. A stale completion from a closed app cannot erase a newer draft, and reopening after an uncertain response can safely retry the original request.

Wave, compliment and dancing are free. Targeted actions require both participants to be current members with fresh presence at the activity's venue. **Allow friendly flirting** is off by default; a flirt additionally requires both people to opt in. Leaving clears that preference.

A bar **Playful showdown** begins with an invitation. Only the receiver may accept or decline; acceptance requires both people still at the venue. The receiver may decline after leaving the scene. Invitations expire after ten minutes, resolve once and become invalid when either member leaves and rejoins. Acceptance triggers a brief cartoon shadowboxing pose for the two actual present characters, with no contact, injury, damage, teleportation or positional change.

Confirmed events produce brief waving, sipping, dancing or friendly poses on existing characters. Opening a room establishes its previous events as history; old events are not replayed as new activity. The scene deduplicates confirmed event IDs, respects reduced motion and releases gesture state on room/peer disposal.

## API and storage contract

All routes require an authenticated active account. The Next.js proxy forwards the existing session cookie to the Go API without accepting a client-supplied actor ID.

| Go route | Request | Response |
| --- | --- | --- |
| `GET /v1/wallet` | — | `{wallet}` |
| `GET /v1/activities` | — | Public summaries, venue catalog and own wallet |
| `POST /v1/activities` | `title`, `category`, `travellerType`, `venueId`, UTC `startsAt`, `capacity`, UUID `clientId` | Member room and wallet; 201, or 200 for an exact retry |
| `GET /v1/activities/{id}` | — | Member-only room and wallet |
| `POST /v1/activities/{id}/join` | `socialOptIn` (defaults false) | Member room and wallet |
| `POST /v1/activities/{id}/leave` | `{}` | `{left:true}` |
| `POST /v1/activities/{id}/messages` | Plain-text `body`, UUID `clientId` | Trusted-author message; 201, or 200 for an exact retry |
| `POST /v1/activities/{id}/actions` | `kind`, optional `item`, `targetId` or `inviteId`, UUID `clientId` | Confirmed event and wallet; 201, or 200 for an exact retry |

Message bodies retain the existing 1,000 Unicode code-point limit. Unknown fields, query parameters and unsupported IDs/actions are rejected. Discovery contains at most sixty public summaries; it does not expose member lists, protected messages or event history. A protected room contains at most twelve current members, fifty recent messages and thirty recent events. The UI polls the open room approximately every three seconds, serially, and aborts it on unmount. With the Phone closed, the selected outing has its own serial three-second poll.

Migration [`010_activities.sql`](../db/migrations/010_activities.sql) stores activities, membership sessions, group messages, action events, invitations, wallets and the credit ledger. Transactions lock activity rows before membership/capacity changes, and serialize action UUIDs and wallet deductions. Leaving removes read/write authority, including retrying an old send. Closed rooms return 410. Inactive hosts disappear from discovery; inactive participants and their authored/targeted content are excluded from room responses. Reclaiming an inactive member's seat ends that membership session and opt-in, so reactivation requires an explicit join and cannot silently exceed capacity or restore an old invitation.

The initial feature uses bounded polling and recent snapshots. It does not yet provide persistent notification delivery, complete chat-history pagination, moderator tools or a city-wide activity directory beyond the mapped pilot catalog. Actual test and browser evidence is recorded in [verification.md](verification.md).
