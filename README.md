# ROAM — Lisbon. Your way.

A playable tourist trip simulator with original miniature 3D Lisbon scenes. Choose a three- or five-day chapter, a euro activity budget, a home base, and a traveller style. Explore six places, make choices across 30 authored scenarios, and keep an itinerary made from the activities you actually tried.

This replaces the earlier Lisboa Viva multiplayer life simulation. The old Go/PostgreSQL economy, authentication, jobs, transfers, policing, and chat are removed from the active project. Git history retains the previous implementation. The product direction comes from [PR #1](https://github.com/pro-munachi/lisboa-viva/pull/1); the approved ROAM design adds compact 3D scenes to that document’s trip simulation.

## Run

Node 22 or newer. From the repository root:

```sh
npm --prefix apps/web ci
npm run dev
```

Open http://127.0.0.1:3000. No database, account, external API, or secret is required.

```sh
npm test
npm run typecheck
npm run build
npm start
```

Or run `docker compose up --build` and open http://localhost:3000. The root scripts delegate to `apps/web`; the lockfile lives there.

## What is playable

- Original Three.js scenes for a loft, fictional Alfama atelier, Baixa café, Graça lookout, Belém waterfront, and fictional Santos listening room. Click the floor to walk or an object to select a scenario. Every activity is also available through keyboard-accessible buttons.
- Trip setup: 3/5 days, €30–€5,000 activity budget, Graça/Baixa/Alfama base, three traveller styles, four avatar colours. Style prioritizes matching scenarios. The loft reflects the chosen base; travel is deliberately simplified.
- 30 scenarios with two choices each, including food, craft, viewpoints, stories, music, and restful moments. Availability depends on location and morning/afternoon/evening. Each scenario yields one unique experience per run.
- Choice previews, exact-once action handling, bounded energy/inspiration/connection, nonnegative remaining money, and non-overlapping simulated time. Free breaks and overnight rest always provide a route forward.
- Travel by walk/cycle/tram, district passport, three optional challenges, journal, completion recap, early finish, and a downloadable private itinerary.
- Validated same-browser save/resume, current trip plus four earlier chapters, replay/new trip, and explicit deletion. A bad/incompatible save is not silently treated as a valid trip. A new trip replaces a corrupt save only when the player starts it.
- Responsive layouts, native modal focus management, reduced-motion support, semantic meters, and a playable fallback when WebGL fails.

## Accuracy and privacy

All euro costs, durations, routes, and activities are illustrative game assumptions, **not current prices, live timetables, availability, or bookings**. Fictional venues and characters are labelled. Official Visit Lisboa references support neighbourhood and cultural context, with a content review date. A neighbourhood map link is not an endorsement of a fictional venue.

The activity budget excludes flights and accommodation. No server stores trips. No analytics, live location, real social presence, accounts, or public sharing are implemented. Downloading an itinerary creates a local text file; it does not publish a trip. Clearing browser storage erases guest progress.

## Source

- `apps/web/app`: Next.js/TypeScript interface and CSS.
- `apps/web/components`: modal and lazy-loaded 3D host.
- `apps/web/lib/content.ts`: typed, versioned scenario catalogue and cultural sources.
- `apps/web/lib/engine.ts`: deterministic state transitions, replay validation, itinerary.
- `apps/web/lib/scene.js`: original procedural Three.js artwork and resource cleanup.
- `apps/web/tests`: deterministic engine regression tests.
- `docs/PRD.md`: original product document; `docs/scope.md`: current delivery and remaining milestones.

Content publishing currently happens through reviewed repository changes, protected by GitHub write permissions. Changes to canonical content must bump `CONTENT_VERSION` and consider save migration. There is no publicly writable editor.

See `docs/verification.md` for checks and limits. This is a playable pilot; cross-device accounts, real social features, revocable public links, an authenticated content editor, verified pricing, a physical-device accessibility audit, and recorded mobile performance targets remain future work.
