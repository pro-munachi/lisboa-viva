# Lisboa Viva — first playable architecture

Next.js 16.3.8 / TypeScript presents a pt-PT map, venue panel and phone. Go 1.26 owns all rules; PostgreSQL 16 owns all state. Same-origin /v1 requests proxy to Go. Passwords use bcrypt; opaque sessions are hashed in storage. Mutations require an allowed Origin and a session cookie with HttpOnly and SameSite=Strict. Production requires HTTPS and Secure cookies.

An initial low-volume single-world implementation serializes game transactions with a PostgreSQL advisory transaction lock. This deliberately favors inspectable correctness over throughput. Money uses integer cents, nonnegative player wallets, balanced deferred ledger constraints, atomic operations and per-user idempotency keys tied to request hashes. System sources/sinks are explicit ledger accounts.

Durable actions have deadlines and a partial unique index permitting one running action per player. Workers claim due work under the same transaction lock. Completion effects and outbox events commit with completion status. WebSocket events only signal snapshot refresh; the authenticated snapshot is the authority. Reconnect and periodic snapshots recover missed events. Presence uses recent authenticated heartbeat timestamps, never invented counts. Player messages persist with IDs, private-message permissions and bilateral blocking checks.

World time accelerates at one game minute per real second, independent of real-time deadlines and protection windows. Needs decay only on access and cap at 30 minutes offline; no offline debt. Content definitions live in content/world.json; research references are separate from simulated fares and schedules. All movement, including local venue entry, completes as a durable journey.

Crime requires mutual opt-in, shared unsafe venue, newcomer and victim protection checks, availability and 24-hour pair cooldown. A pending encounter offers defensive choices, resolves once, limits cash loss and records server evidence. NPC justice has a visible history, automatic decision, independent appeal and community service. No player police powers exist in release one.

Local preview uses existing Homebrew PostgreSQL on a dedicated port. Docker Compose provides the reproducible contributor path. Sites hosting was inspected but is not used: its Worker runtime cannot host the explicitly requested Go/PostgreSQL stack.

## Initial milestones
- [x] Architecture, original content manifest, balancing assumptions
- [x] Auth, character creation, persistence, secure sessions
- [x] Durable actions, transport, ledger and inventory
- [x] Jobs, school, leisure and NPC quest
- [x] Presence, venue chat, offline DM and transfers
- [x] Eligible robbery and NPC justice/appeal
- [x] Moderation and audited admin adjustments
- [x] Responsive pt-PT map/phone experience
- [x] PostgreSQL integration tests, browser journeys and setup documentation

## Balance assumptions
Starting cash €35 and bank €100. Starter shifts earn €18–26 in 20 seconds for this accelerated prototype. Food €2.50; coffee €1; fares €1.50–2.20; surf €6. All values are fictional. Newcomer protection lasts 10 real minutes; robbery transfers at most 10% cash capped at €100; victim protection lasts an hour. Tests inject time rather than weakening these rules. Housing starts as a free shared room; rental billing and item trading are release-two work. No real-money features.
