# ROAM — Lisbon. Your way.

A playable tourist trip simulator in one continuous 3D Lisbon–Sintra region. Rotate, drag, zoom and explore real mapped streets, building footprints and hills. Choose a three- or five-day trip, a euro activity budget, a home neighbourhood and a traveller style. Nine trip destinations provide 45 authored scenarios and 90 choices; your journal and itinerary come from the activities you actually tried.

The default world works without a Google API key. It bundles OpenStreetMap geography and EU-DEM terrain, with original adult-proportioned characters, simulated pedestrians, cars and trams. The 273,347 building footprints retain real mapped positions; facades, roofs and most heights are approximate. This is a geographic game world, not an exact architectural or photorealistic replica.

This rebuilds the earlier Lisboa Viva multiplayer life simulation in working slices. The Go/PostgreSQL service now provides accounts, sessions, role authorization and short-lived player presence; the wider economy, jobs, transfers, policing and chat remain outside the active client. Git history retains the broader earlier implementation. [PR #1](https://github.com/pro-munachi/lisboa-viva/pull/1) supplies the tourist trip requirements. The accepted ROAM design and later continuous-city brief extend its original 3D scope. The reference game's character assets have not been copied.

## Run

Docker Desktop is the simplest way to run the authenticated application:

```sh
cp .env.example .env
docker compose up --build
```

Open [the development app](http://127.0.0.1:3000) to preview the city map, then create a tourist or local account and enter the protected experience at `/play`. The Compose stack runs PostgreSQL, the Go account API, and Next.js. PostgreSQL is exposed only on `127.0.0.1:55433`; the Go API is exposed on `127.0.0.1:8080` for local diagnostics.

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
- **An interactive city:** drag in Rotate or Pan mode, scroll/pinch to zoom, use camera buttons, choose Street level or Whole region, and select labelled hotspots. Walk mode moves the traveller toward a nearby selected ground location. Pedestrians and vehicles animate along mapped ways; ambient movement can be paused. Characters provides a close view of four original outfit/hair variants.
- **Places and pins:** local search covers 17 curated landmarks, 600 named OSM venues and 1,500 mapped street/locality names. Type a mapped name or paste a supported Google Maps link. Full coordinate links resolve locally; supported short links use bounded Google-only redirects without scraping page HTML. Save up to 16 pins, inspect them in 3D, reopen their Maps links or remove them. No paid search is required.
- **Original interiors:** enter your imagined Lisbon home or a sourced café/restaurant, gym, shop, cultural venue or bar to explore six original room kinds. Eighteen free activities cover resting, breakfast, planning, café breaks, workouts, browsing, art and lounge visits. Your character walks around furniture, uses a short activity pose and returns to a clear floor position. Rooms include original props, azulejo/wood/cork materials and simulated residents. Room visits use scene time without changing the trip's budget, time, energy, journal or saves.
- **Tourist trips:** 3/5 days, a €30–€5,000 activity budget, Graça/Baixa/Alfama base, three traveller styles and four shirt colours. Nine destinations cover the home base, Alfama, Baixa, Graça, Belém, Santos, Cais do Sodré, Benfica and Sintra. Style prioritizes matching scenarios; location and time of day control availability.
- **Choices and consequences:** 45 scenarios with two choices each across food, craft, stories, music, viewpoints and rest. Previews show cost, duration and energy. Exact-once actions keep money nonnegative, energy bounded and simulated activities from overlapping. Each scenario supplies one unique experience per run.
- **Travel and memories:** illustrative walk/cycle/tram travel, with an intercity train option and longer walk/cycle estimates for Sintra. Tram travel is unavailable for Sintra. District passport, three optional challenges, confirmed-action journal, recap, early finish and private itinerary download remain playable. Free breaks and overnight rest provide a route forward.
- **Saved progress:** validated same-browser save/resume, the current trip plus four earlier chapters, replay/new trip and explicit deletion. Invalid saves receive a visible message. Custom pins are separately validated and capped at 16.
- **Authenticated access:** English registration and login screens distinguish tourists from locals. Registration also saves a player appearance with outfit, hair, skin and clothing colours. Opaque seven-day sessions use HttpOnly cookies; the Go service owns password hashing, session validation and role checks. The app route verifies the session before rendering.
- **Live player presence:** signed-in players publish their current in-world area while `/play` is open. The nearby panel and 3D map show other active players with their saved appearance, with a control to leave or rejoin multiplayer. Presence expires after 45 seconds without a heartbeat and is removed on logout.
- **Accessible alternatives:** responsive layouts, native modal focus management, reduced-motion support, semantic meters, camera buttons and list-based hotspot/activity selection. Trip experiences remain available if 3D cannot load.

## Accuracy and privacy

Street positions and footprints come from the bundled OpenStreetMap snapshot; terrain comes from a coarse public elevation grid. Tagged heights are used where available, storeys are converted to estimates, and untagged heights use defaults. Stylised exteriors, approximate slopes, omitted courtyard holes and simplified roads limit fidelity. NPCs and traffic are simulated, with no live people, departures or traffic information. See [docs/geography.md](docs/geography.md) for provenance, coverage, dates, limitations, attribution and refresh instructions.

All euro costs, durations, route choices and activities are illustrative game assumptions, **not current prices, live timetables, availability or bookings**. Fictional venues and conversations are identified in their content. Cultural sources support context rather than prices or opening hours. Enterable room layouts are original imagined scenes, not surveyed business interiors or evidence of actual services, inventory, access or opening status. Custom pins, street/locality searches and unclassified Google places do not infer an enterable room from a name alone. Personal coordinate pins are unverified locations; a Maps link does not establish that a fictional venue exists.

The budget excludes flights and accommodation. Accounts and short-lived coarse in-world presence are stored in PostgreSQL; the server does not store trips, map pins, analytics, chat messages or public sharing. Presence contains a map coordinate and area label, is visible only to authenticated players, and expires after 45 seconds without a heartbeat. Downloading an itinerary creates a local text file. Clearing browser storage erases trip progress and saved pins. Opening an external Maps/source link takes the user to that provider.

## Source

- `apps/web/app`: Next.js/TypeScript interface and CSS.
- `apps/web/components`: dialogs, continuous-world host and optional Google imagery renderer.
- `apps/web/lib/content.ts` and `engine.ts`: versioned scenarios, deterministic transitions, save replay and itinerary.
- `apps/web/lib/geography.ts`, `city-scene.js` and `characters.js`: geographic schema/projection, streamed Three.js world, original characters and resource cleanup.
- `apps/web/lib/world-state.ts` and `google-maps.ts`: geographic focus, validated coordinate pins and optional official Google integration.
- `apps/web/lib/interiors.ts`, `city-interiors.js`, `city-interior-runtime.js` and `city-room-navigation.js`: original room catalog, geometry, local activity poses and furniture-aware walking. `InteriorPanel` supplies the room controls.
- `apps/web/public/data`: compressed derived database; `scripts/geography-build.py` and `geography-validate.py`: acquisition and validation.
- `apps/web/tests`: engine, geography, character and pin regression checks.
- `services/game`: Go authentication, authorization and multiplayer presence API; `db/migrations`: PostgreSQL account, appearance and presence schema.
- [docs/authentication.md](docs/authentication.md): account endpoints, security boundary, local setup and staging configuration. [docs/multiplayer.md](docs/multiplayer.md) covers presence behavior and privacy.
- `docs/PRD.md`: preserved original requirements; [docs/scope.md](docs/scope.md): current scope; [docs/verification.md](docs/verification.md): checks and limits.
- [docs/backend-schema-plan.md](docs/backend-schema-plan.md): feature inventory and staged PostgreSQL schema boundary for rebuilding the persistent Lisboa Viva backend.

The derived OSM database is licensed under ODbL 1.0 and credited in the map. Terrain credits identify Copernicus/EU-DEM. Repository write permissions and reviewed pull requests provide the current restricted content workflow. Content changes must consider `CONTENT_VERSION` and save migration. Chat, blocks, friendships, revocable public links, a dedicated authenticated editor, verified pricing and full accessibility/performance sign-off remain future work.
