# Lisboa Viva

A playable local multiplayer life-sim foundation set in Lisbon. **Next.js + TypeScript, Go, PostgreSQL**, with European Portuguese player-facing copy and original SVG city artwork. This is a development release, not a production-ready public service.

## Start with Docker

From this directory:

```sh
cp .env.example .env
# Edit POSTGRES_PASSWORD in .env (use a URL-safe development password).
docker compose up --build
```

Open **http://localhost:3000**. Create an account and an adult character. Database migrations run once under an advisory lock, with recorded checksums. Content is loaded from `content/world.json` at startup. The PostgreSQL volume preserves accounts, actions and money across restarts. Only the frontend is published, on the host loopback interface.

Docker Compose configuration is provided and validated, but its full container build has not been run on this machine because Docker Desktop was not running. The game was built and tested directly with local PostgreSQL instead.

## Run with local tools

Requirements: Node 20.9+ (tested with Node 20/24), Go 1.26, PostgreSQL 16. Exact package versions are pinned in `package-lock.json` and `go.sum`.

Create a database and provide its connection string. Example for an existing local PostgreSQL server:

```sh
createdb lisboa
export DATABASE_URL='postgres://YOUR_USER@127.0.0.1:5432/lisboa?sslmode=disable'
cd services/game
go run .
```

In another terminal, from the repository root:

```sh
cd apps/web
npm ci
npm run dev
```

Always open **http://localhost:3000**, matching `APP_ORIGIN`. Next proxies `/v1` to Go, including WebSocket upgrades. Do not open the app under a different hostname without updating `APP_ORIGIN`.

For this workspace's isolated development database, use:

```sh
export DATABASE_URL='postgres://lisboa@127.0.0.1:55432/lisboa?sslmode=disable'
```

The task started a separate PostgreSQL cluster in its `work/pgdata` directory. It is not part of the deliverable and contains only locally created game/demo data.

## Demo accounts — local development only

The browser verification used these accounts:

| Handle | Password | Character |
| --- | --- | --- |
| `ines_demo` | `LisboaDemo2026!` | Inês Martins |
| `tomas_demo` | `LisboaDemo2026!` | Tomás Costa |

Their state reflects verification gameplay. New accounts start with €35 cash, €100 bank balance, a room in Arroios and ten minutes of newcomer protection. The seed never resets an existing account. To create these accounts on a direct local API instance:

```sh
ALLOW_DEMO_SEED=true python3 scripts/seed_demo.py
```

This script is hard-coded to loopback and explicitly gated. Do not create demo accounts on an internet-facing deployment.

## What you can play

- Create a character with name, appearance colour, story, pronouns, biography and interests; sign out and resume.
- Explore 10 connected hubs and 26 usable venues through the map or keyboard-accessible list. A district selector exposes all venues in that district.
- Travel on foot, by Metro, tram, bus, train or ferry. Multi-leg trips expose each leg, with fastest/cheapest route selection. The train corridor reaches Carcavelos with final walking included; the ferry connects Cais do Sodré and Cacilhas. All fares, durations and operating windows are invented.
- Complete six short jobs with practical decisions and exactly-once wages. Buy and consume food, rest, shower, cook, exercise, play football, listen to music, dance and surf.
- Complete a short course that grants an attendance/service qualification once, unlocking the kitchen job. Follow a three-step NPC neighborhood quest.
- Manage cash/bank funds; deposit and withdraw at the bank; review recipient identity before sending virtual money, including to offline players. Both parties retain receipts.
- See recent real presence; exchange durable venue chat and private messages; use DM permissions, blocking, local muting and reports. Messages and profiles are escaped as text.
- Opt into eligible robbery encounters, make defensive choices and receive consistent cash-only settlement. Newcomer protection, safe venues, availability, co-location, victim protection and pair cooldowns are enforced server-side.
- View a detected incident's NPC investigation, evidence, hearing and decision; appeal to an independent NPC or complete community service. Brief detention expires even while offline.
- Admin accounts can look up identities, process reports, suspend accounts/activities/venues and make audited ledger corrections. There are no player-police administrative powers.

No player count or chat message is invented. NPCs are labelled. No real-money payments, gambling, real banking or private account data integration exists.

## Controls and a first session

1. Create an account, then talk to Amélia at home.
2. Select Arroios → Café da Esquina in the venue selector (or use **Lista**), then **Ir para aqui**.
3. Buy a bica, talk to Rita, and **Servir às mesas** to earn €18.
4. Visit the market for food and the school for the short course. Return to Amélia to complete the quest.
5. Use the phone dock for work, banking, messages, your inventory and case history.
6. For Carcavelos, follow the route one leg at a time through Baixa/Cais do Sodré and Belém. For Cacilhas, take the ferry from Cais do Sodré.

Money is virtual. The first room is free, so you cannot be evicted or billed into debt while offline. Needs decay has an offline cap. A failed client request never awards money or completes an action; only the Go worker does so.

## Tests and validation

```sh
python3 scripts/validate_content.py
cd apps/web
npm ci
npm run generate
npm run typecheck
npm run build
cd ../../services/game
TEST_DATABASE_URL='postgres://YOUR_USER@127.0.0.1:5432/lisboa?sslmode=disable' go test -race -v ./...
```

Integration tests create unique disposable PostgreSQL schemas and remove only those schemas. Without `TEST_DATABASE_URL`, integration tests skip. Use a dedicated development database; the test role needs schema creation permission.

The suite covers a new-player journey, restart-safe wage completion, qualified course completion, food ownership, transport arrival, bank moves, train-to-beach and ferry travel, logout/resume, simultaneous spending, retries and conflicting idempotency keys, balanced-ledger constraints, real presence, room chat, offline DM/transfer, blocking, private records, expired sessions, forged travel, forbidden administrative requests, robbery protections/defense/settlement, NPC evidence/appeal, cooldowns, detention expiration, administrative audits, cross-midnight opening hours, CSRF and authenticated/origin-checked WebSocket recovery.

Browser verification and precise limitations are recorded in `docs/verification.md`.

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `DATABASE_URL` | Local development fallback: `postgres://lisboa@127.0.0.1:55432/lisboa?sslmode=disable` |
| `PROJECT_ROOT` | `../..` when started from `services/game`; points to migrations/content |
| `LISTEN_ADDR` | `127.0.0.1:8080`; containers use `0.0.0.0:8080` internally |
| `APP_ORIGIN` | `http://localhost:3000`; exact allowed Origin for commands and sockets |
| `API_INTERNAL_URL` | `http://127.0.0.1:8080` for Next proxy; set before build for a production build |
| `COOKIE_SECURE` | `false` locally; must be `true` behind production HTTPS |
| `BOOTSTRAP_ADMIN_HANDLE` | Optional existing handle promoted on API start by the operator |
| `ALLOW_DEMO_SEED` | Must explicitly equal `true` for the loopback-only demo script |

To bootstrap an administrator, first create a local account, then restart the Go service with `BOOTSTRAP_ADMIN_HANDLE=your_handle`. Remove that variable afterward. Being a fictional officer does not grant admin access.

`GET /v1/health` verifies database connectivity. Go emits structured startup/worker/error logs. Back up with `pg_dump --format=custom "$DATABASE_URL" > backup.dump`; keep backups outside the repository and test restoration into a separate database. For a public release, add TLS termination, deployment secret management, account recovery, multi-instance rate limiting, abuse operations and a restore drill before exposing the service.

## Source layout

- `apps/web`: original map, venue scenes, accessible game interface and phone. Generated request/response types come from OpenAPI.
- `services/game`: authentication, transaction boundary, commands, worker, migrations and PostgreSQL integration tests.
- `db/migrations`: schema, relational ownership/constraints and deferred balanced-ledger checks.
- `content/world.json`: original venues, activities, transport and researched corridor references.
- `api/model.ts`, `api/openapi.json`: API model source and generated/shared contract. Run `npm run generate` after model changes.
- `docs`: architecture, balancing assumptions, research, verification and backlog.

## Known scope limits

This is a compact working foundation of the first playable release. It is not the entire master brief. English UI translation, configurable transport passes and departure frequencies, weather-driven gameplay, detailed NPC schedules, full character clothing customization and a content-management editor remain unfinished. Initial transport corridors operate around the clock; there are no real timetable claims. World time and night tint work, while the initial weather is fixed.

The NPC court resolves its documented stages automatically and uses a bounded community-service/warning outcome rather than a full legal simulation. No player officer, lawyer or judge careers are enabled. The initial home is a free shared room; leases, furniture, recurring bills, businesses, trading, friend requests and group channels are release-two/later work. English is not selectable yet; all currently authored interface and game content is pt-PT. UI strings are not yet fully extracted into translation keys, though API errors are centrally localized and content is data-driven.

Financial correctness uses a single PostgreSQL advisory lock per world. This is suitable for a small development world and deliberately trades throughput for simple correctness. Presence expires after 25 seconds. Snapshots recover missed notifications; this is not a high-throughput event streaming architecture. Load tests, automated browser regression files, email/account recovery, multi-instance shared rate limits and production security review are still needed.
