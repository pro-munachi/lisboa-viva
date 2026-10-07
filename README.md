# ROAM — Lisbon. Your way.

A playable tourist trip simulator in one continuous 3D Lisbon–Sintra region. Rotate, drag, zoom and explore real mapped streets, building footprints and hills. Choose a three- or five-day trip, a euro activity budget, a home neighbourhood and a traveller style. Nine trip destinations provide 45 authored scenarios and 90 choices; your journal and itinerary come from the activities you actually tried.

The default world works without a Google API key. It bundles OpenStreetMap geography and EU-DEM terrain, with original adult-proportioned characters, simulated pedestrians, cars and trams. The 273,347 building footprints retain real mapped positions; facades, roofs and most heights are approximate. This is a geographic game world, not an exact architectural or photorealistic replica.

This replaces the earlier Lisboa Viva multiplayer life simulation. The old Go/PostgreSQL economy, authentication, jobs, transfers, policing and chat are removed from the active project; Git history retains that implementation. [PR #1](https://github.com/pro-munachi/lisboa-viva/pull/1) supplies the tourist trip requirements. The accepted ROAM design and later continuous-city brief extend its original 3D scope. The reference game's character assets have not been copied.

## Run

Node 22 or newer and a modern browser supporting WebGL and `DecompressionStream`. From the repository root:

```sh
npm --prefix apps/web ci
npm run dev
```

Open [the development app](http://127.0.0.1:3000). No database, account or external API credential is required.

```sh
npm test
npm run typecheck
npm run build
npm start
```

Or run `docker compose up --build` and open [localhost](http://localhost:3000). Root scripts delegate to `apps/web`; the lockfile lives there. Optional Google 3D imagery setup is in [docs/google-maps.md](docs/google-maps.md); no key is included or required for the open-data world.

## What is playable

- **One geographic region:** central Lisbon, Cais do Sodré, Benfica, Belém and Sintra keep their real relative positions. Sintra is a separate town. Streets and buildings continue between named areas rather than forming isolated scene islands. The dataset contains 273,347 building footprints, 123,185 roads/paths and 16,377 surfaces across 83 geographic chunks. The complete deterministic gzip bundle is 19.33 MB; nearby detail loads on demand.
- **An interactive city:** drag in Rotate or Pan mode, scroll/pinch to zoom, use camera buttons, choose Street level or Whole region, and select labelled hotspots. The opening Cais waterfront includes a visible crowd. Dedicated People, Beaches and Lisbon bridge views show the original characters, a stylised Carcavelos/Atlantic scene and the Ponte 25 de Abril. Walk mode moves the traveller toward a nearby selected ground location. Pedestrians and vehicles animate along mapped ways; ambient movement can be paused.
- **Places and pins:** 17 curated landmarks have mapped coordinates and official cultural sources. Landmark search is local. Add an expanded Google Maps link containing coordinates to save your own pin, inspect it in 3D, reopen its Maps link or remove it. No Maps scraping or paid search is required.
- **Tourist trips:** 3/5 days, a €30–€5,000 activity budget, Graça/Baixa/Alfama base, three traveller styles and four shirt colours. Nine destinations cover the home base, Alfama, Baixa, Graça, Belém, Santos, Cais do Sodré, Benfica and Sintra. Style prioritizes matching scenarios; location and time of day control availability.
- **Choices and consequences:** 45 scenarios with two choices each across food, craft, stories, music, viewpoints and rest. Previews show cost, duration and energy. Exact-once actions keep money nonnegative, energy bounded and simulated activities from overlapping. Each scenario supplies one unique experience per run.
- **Travel and memories:** illustrative walk/cycle/tram travel, with an intercity train option and longer walk/cycle estimates for Sintra. Tram travel is unavailable for Sintra. District passport, three optional challenges, confirmed-action journal, recap, early finish and private itinerary download remain playable. Free breaks and overnight rest provide a route forward.
- **Saved progress:** validated same-browser save/resume, the current trip plus four earlier chapters, replay/new trip and explicit deletion. Invalid saves receive a visible message. Custom pins are separately validated and capped at 16.
- **Accessible alternatives:** responsive layouts, native modal focus management, reduced-motion support, semantic meters, camera buttons and list-based hotspot/activity selection. Trip experiences remain available if 3D cannot load.

## Accuracy and privacy

Street positions and footprints come from the bundled OpenStreetMap snapshot; terrain comes from a coarse public elevation grid. Tagged heights are used where available, storeys are converted to estimates, and untagged heights use defaults. Stylised exteriors, approximate slopes, omitted courtyard holes and simplified roads limit fidelity. NPCs and traffic are simulated, with no live people, departures or traffic information. See [docs/geography.md](docs/geography.md) for provenance, coverage, dates, limitations, attribution and refresh instructions.

All euro costs, durations, route choices and activities are illustrative game assumptions, **not current prices, live timetables, availability or bookings**. Fictional venues and conversations are identified in their content. Cultural sources support context rather than prices or opening hours. Personal coordinate pins are unverified locations; a Maps link does not establish that a fictional venue exists.

The budget excludes flights and accommodation. No server stores trips. No analytics, live location, real social presence, accounts or public sharing are implemented. Downloading an itinerary creates a local text file. Clearing browser storage erases guest progress and saved pins. Opening an external Maps/source link takes the user to that provider.

## Source

- `apps/web/app`: Next.js/TypeScript interface and CSS.
- `apps/web/components`: dialogs, continuous-world host and optional Google imagery renderer.
- `apps/web/lib/content.ts` and `engine.ts`: versioned scenarios, deterministic transitions, save replay and itinerary.
- `apps/web/lib/geography.ts`, `city-scene.js` and `characters.js`: geographic schema/projection, streamed Three.js world, original characters and resource cleanup.
- `apps/web/lib/world-state.ts` and `google-maps.ts`: geographic focus, validated coordinate pins and optional official Google integration.
- `apps/web/public/data`: compressed derived database; `scripts/geography-build.py` and `geography-validate.py`: acquisition and validation.
- `apps/web/tests`: engine, geography, character and pin regression checks.
- `docs/PRD.md`: preserved original requirements; [docs/scope.md](docs/scope.md): current scope; [docs/verification.md](docs/verification.md): checks and limits.

The derived OSM database is licensed under ODbL 1.0 and credited in the map. Terrain credits identify Copernicus/EU-DEM. Repository write permissions and reviewed pull requests provide the current restricted content workflow. Content changes must consider `CONTENT_VERSION` and save migration. Cross-device accounts, real social features, revocable public links, a dedicated authenticated editor, verified pricing and full accessibility/performance sign-off remain future work.
