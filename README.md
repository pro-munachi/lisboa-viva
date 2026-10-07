# ROAM — Every city. Your story.

A colourful city journey simulator with Lisbon–Sintra as its first playable region. The ROAM identity uses cobalt, coral, mint and lime; the city registry keeps each region’s time zone, currency and data bundle explicit. Lisbon is the only bundled city today. Rotate, drag, zoom and explore real mapped streets, building footprints and hills. Choose a tourist, digital nomad or expat profile, interests, arrival style, 1–30-day calendar dates, accommodation style, a euro journey budget and a character colour. Nine trip destinations provide 45 authored scenarios and 90 choices; your journal and itinerary come from confirmed actions.

The default world works without a Google API key. It bundles OpenStreetMap geography and EU-DEM terrain, with original adult-proportioned characters, simulated pedestrians, cars and trams. The 273,347 building footprints retain real mapped positions; facades, roofs and most heights are approximate. This is a geographic game world, not an exact architectural or photorealistic replica.

This replaces the earlier Lisboa Viva multiplayer life simulation. Its wider economy, jobs, transfers, policing and chat remain outside the active client, while a new Go/PostgreSQL account service now provides registration, login, sessions and role authorization. Git history retains the broader earlier implementation. [PR #1](https://github.com/pro-munachi/lisboa-viva/pull/1) supplies the tourist trip requirements. The accepted ROAM design and later continuous-city brief extend its original 3D scope. The reference game's character assets have not been copied.

## Run

Docker Desktop is the simplest way to run the authenticated application:

```sh
cp .env.example .env
docker compose up --build
```

Open [the development app](http://127.0.0.1:3000) to preview the city map, then create a tourist or local account and enter the protected experience at `/play`. The Compose stack runs PostgreSQL, the Go account API, and Next.js. PostgreSQL is exposed only on `127.0.0.1:55433`; the Go API is exposed on `127.0.0.1:8080` for local diagnostics.

For native local development, install PostgreSQL 17 and Go 1.26, run `npm run local:start`, then `npm run dev`. The helper starts an isolated database and account API on the same loopback ports, with data and logs under ignored `work/local/`. `npm run local:stop` stops the managed services and retains accounts. See [native setup and tool overrides](docs/authentication.md#local-environment).

For split local development, start `db` and `game` with Compose, then run the Next.js watcher:

```sh
docker compose up --build db game
npm --prefix apps/web ci
npm run dev
```

```sh
npm test
npm run typecheck
npm run build
npm start
```

Root npm scripts delegate to `apps/web`; the lockfile lives there. Run `go test ./...` from `services/game` for the account service. Optional Google 3D imagery setup is in [docs/google-maps.md](docs/google-maps.md); no key is included or required for the open-data world.

## What is playable

- **One geographic region:** central Lisbon, Cais do Sodré, Benfica, Belém and Sintra keep their real relative positions. Sintra is a separate town. Streets and buildings continue between named areas rather than forming isolated scene islands. The dataset contains 273,347 building footprints, 123,185 roads/paths and 16,377 surfaces across 83 geographic chunks. The complete deterministic gzip bundle is 19.33 MB; nearby detail loads on demand.
- **An interactive city:** floating category icons identify cafés, gyms, shops, landmarks and other mapped hotspots. Select an icon to open its place card; names appear on hover, keyboard focus or selection. Drag in Rotate or Pan mode, scroll/pinch to zoom, use camera buttons, and choose Street level or Whole region. Walk mode moves the traveller toward a nearby selected ground location. Pedestrians and vehicles animate along mapped ways; ambient movement can be paused. Characters provides a close view of four original outfit/hair variants.
- **Places and pins:** local search covers 17 curated landmarks, 600 named OSM venues and 1,500 mapped street/locality names. Type a mapped name or paste a supported Google Maps link. Full coordinate links resolve locally; supported short links use bounded Google-only redirects without scraping page HTML. Save up to 16 pins, inspect them in 3D, reopen their Maps links or remove them. No paid search is required.
- **Original interiors:** enter your imagined Lisbon home or a sourced café/restaurant, gym, shop, cultural venue or bar to explore six original social room kinds, plus three original airport/station/bus-stop scenes. Eighteen free social-room activities cover resting, breakfast, planning, café breaks, workouts, browsing, art and lounge visits. Your character walks around furniture, uses a short activity pose and returns to a clear floor position. Rooms include original props, azulejo/wood/cork materials and simulated residents. Room visits use scene time without changing the trip's budget, time, energy, journal or saves.
- **City time and music:** live Lisbon time, trip time, daylight/golden-hour/night previews, warm street lamps and lit windows. Interiors use warm night lamps; the bar has gentle coloured fixtures and an original 108 BPM synthesized mix. Play/Stop and volume are explicit; pausing, exiting or changing bars stops audio. No venue broadcast or licensed artist track is bundled.
- **Arrival profiles:** tourist, digital nomad or expat; airport, station, bus stop or settled-home arrival; six interests; a calendar range of 1–30 days; hotel, hostel, apartment or coliving style; a €30–€5,000 journey budget; Graça/Baixa/Alfama base; and eight character colours. Accommodation is an imagined style, with no room reservation.
- **Transport journeys:** begin at a mapped airport, station or bus-stop anchor. Prepare a simulated card, book one ticket and explicitly board a metro, bus, train or departure flight. Initial arrivals continue into the city before ordinary trip travel. Booking charges the game fare once; boarding changes destination, time and energy once. A ready ticket stays protected until boarding or an explicit trip finish. Operator references supply context; these are authored game routes, fares and durations.
- **Profile recommendations:** interests and category produce authored chapter suggestions locally. Optional AI ranks only existing chapter IDs; it cannot invent venues or prices. The server returns the same profile-based suggestions if no key is configured or AI is unavailable.
- **Choices and consequences:** 45 scenarios with two choices each across food, craft, stories, music, viewpoints and rest. Previews show cost, duration and energy. Exact-once actions keep money nonnegative, energy bounded and simulated activities from overlapping. Each scenario supplies one unique experience per run.
- **Travel and memories:** illustrative walk/cycle/tram travel, with an intercity train option and longer walk/cycle estimates for Sintra. Tram travel is unavailable for Sintra. District passport, three optional challenges, confirmed-action journal, recap, early finish and private itinerary download remain playable. Free breaks and overnight rest provide a route forward.
- **Saved progress:** validated account-scoped same-browser save/resume, the current trip plus four earlier chapters, replay/new trip and explicit deletion. Invalid saves receive a visible message. Custom pins are separately validated and capped at 16.
- **Authenticated access:** English registration and login screens distinguish tourists from locals. Opaque seven-day sessions use HttpOnly cookies; the Go service owns password hashing, session validation and role checks. The app route verifies the session before rendering.
- **Accessible alternatives:** responsive layouts, native modal focus management, reduced-motion support, semantic meters, camera buttons and list-based hotspot/activity selection. Trip experiences remain available if 3D cannot load.

## Accuracy and privacy

Street positions and footprints come from the bundled OpenStreetMap snapshot; terrain comes from a coarse public elevation grid. Tagged heights are used where available, storeys are converted to estimates, and untagged heights use defaults. Stylised exteriors, approximate slopes, omitted courtyard holes and simplified roads limit fidelity. NPCs and traffic are simulated, with no live people, departures or traffic information. See [docs/geography.md](docs/geography.md) for provenance, coverage, dates, limitations, attribution and refresh instructions.

All euro costs, durations, route choices and activities are illustrative game assumptions, **not current prices, live timetables, availability or bookings**. Fictional venues and conversations are identified in their content. Cultural sources support context rather than prices or opening hours. Enterable room layouts are original imagined scenes, not surveyed business interiors or evidence of actual services, inventory, access or opening status. Custom pins, street/locality searches and unclassified Google places do not infer an enterable room from a name alone. Personal coordinate pins are unverified locations; a Maps link does not establish that a fictional venue exists.

The budget excludes the arrival flight and accommodation; a booked simulated departure flight is explicitly charged to the game budget. Accounts are stored in PostgreSQL, but no server stores trips, map pins, analytics, live location, real social presence or public sharing. Downloading an itinerary creates a local text file. Clearing browser storage erases trip progress and saved pins. Opening an external Maps/source link takes the user to that provider.

Optional AI recommendations use the [OpenAI Responses API with structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Set `OPENAI_API_KEY` in the server's ignored `apps/web/.env.local`; `OPENAI_MODEL` optionally selects a compatible model (default `gpt-4.1-mini`). Credentials are never exposed to the browser. Clicking the AI button sends only profile choices, duration and budget to the model; exact calendar dates, avatar colour, trip history and custom pins are omitted. Responses are bounded, uncached and validated against the chapter catalog. No live AI request has been verified without a configured key.

## Source

- `apps/web/app`: Next.js/TypeScript interface and CSS.
- `apps/web/components`: dialogs, continuous-world host and optional Google imagery renderer.
- `apps/web/lib/content.ts` and `engine.ts`: versioned scenarios, deterministic transitions, save replay and itinerary.
- `apps/web/lib/journey.ts`, `JourneyPanel` and `TripCalendar`: arrival profiles, transport card/tickets, hub context and calendar selection. `recommendations.ts` and `/api/recommendations` provide curated picks and optional AI ranking.
- `apps/web/lib/geography.ts`, `city-scene.js` and `characters.js`: geographic schema/projection, streamed Three.js world, original characters and resource cleanup.
- `apps/web/lib/world-state.ts` and `google-maps.ts`: geographic focus, validated coordinate pins and optional official Google integration.
- `apps/web/lib/interiors.ts`, `city-interiors.js`, `city-interior-runtime.js` and `city-room-navigation.js`: original room catalog, geometry, local activity poses and furniture-aware walking. `InteriorPanel` supplies the room controls.
- `apps/web/public/data`: compressed derived database; `scripts/geography-build.py` and `geography-validate.py`: acquisition and validation.
- `apps/web/tests`: engine, geography, character and pin regression checks.
- `services/game`: Go authentication API, session and role authorization; `db/migrations`: PostgreSQL account schema.
- [docs/authentication.md](docs/authentication.md): endpoints, security boundary, local setup and staging configuration.
- `docs/PRD.md`: preserved original requirements; [docs/scope.md](docs/scope.md): current scope; [docs/verification.md](docs/verification.md): checks and limits.
- [docs/backend-schema-plan.md](docs/backend-schema-plan.md): feature inventory and staged PostgreSQL schema boundary for rebuilding the persistent Lisboa Viva backend.

The derived OSM database is licensed under ODbL 1.0 and credited in the map. Terrain credits identify Copernicus/EU-DEM. Repository write permissions and reviewed pull requests provide the current restricted content workflow. Content changes must consider `CONTENT_VERSION` and save migration. Cross-device trip synchronisation, real social features, revocable public links, a dedicated authenticated editor, verified pricing and full accessibility/performance sign-off remain future work.
