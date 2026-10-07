# ROAM Lisbon pilot

The preserved `docs/PRD.md` and PR #1 establish the tourist trip simulation. The accepted ROAM design supplies the warm Lisbon palette, navy controls, trip panels and original traveller identity. The later city brief expands the world into one rotatable, draggable and interactive geographic region with Cais do Sodré, Benfica and Sintra, moving locals/vehicles and adult-proportioned characters. This supersedes the PRD's original “no 3D character system” restriction. No reference-game assets are copied.

## Delivered

The default Three.js world uses real mapped streets and footprints across Lisbon and Sintra, with public elevation data for the hills. The dataset contains **273,347 building footprints**, **123,185 roads/paths**, **16,377 surfaces** and **83 geographic chunks**. Its 86 deterministic gzip files total **19.33 MB**. Nearby chunks load detail on demand; distant buildings use a coarse geographic overview. These are rendering partitions within one coordinate space, not separate district islands.

The camera supports Rotate, Pan, zoom, Street level and Whole region views, mouse/touch gestures and labelled control buttons. The opening waterfront places a visible crowd in front of the player, while People, Beaches and Lisbon bridge provide focused views of the original character variants, a stylised Carcavelos/Atlantic scene and the Ponte 25 de Abril. Walk mode lets the traveller choose a nearby ground target. Original articulated characters use adult proportions, varied skin tones, four outfits and four hair variants. Simulated NPCs, cars and yellow trams move on local mapped paths; ambient movement can be paused.

Seventeen curated hotspots carry geographical coordinates, official cultural references and Maps links. Local landmark search and validated coordinate-link pins work without a Google key. Players can add, inspect and remove up to 16 custom pins; saved pins are revalidated from their Maps URLs. Google Places content is not scraped or bundled. An optional official Google 3D renderer is available when a restricted browser key is configured; the project currently uses open data because no key has been supplied.

The trip game includes guest setup; 3/5-day trips; euro budget/exclusions; traveller style/base/shirt; **nine destinations, 45 scenarios and 90 choices**; preview/consequence; budget/time/energy rules; unique experiences; three optional challenges; passport; journal/recap from confirmed choices; private itinerary download; local save/resume; earlier runs; restart/deletion; cultural references/review dates; and activity controls that remain usable if WebGL fails.

The pilot has no backend. Repository write access and reviewed pull requests provide the restricted content publishing workflow. Server-backed accounts/editor can be added for cross-device trips or external authoring. Legacy database and APIs remain removed from the active application.

## Deliberate simplifications

- **Geographic accuracy has limits.** Footprints/streets use the OSM snapshot; heights are tagged, derived from storeys or estimated defaults. Facades, roofs and vehicle appearances are stylised. Terrain is a 193 × 193 grid and does not reproduce pavement-level slopes, steps, bridges or retaining walls. Courtyard holes and some surface holes are omitted. There is no exact architectural or photorealistic claim.
- **Actors are simulations.** Pedestrians/traffic follow short local paths, without real departures, live traffic, full traffic rules or complete navigation/collision meshes. Free camera exploration does not spend trip time/money; confirmed choices and travel do. Walk targets are constrained near the traveller and aligned to available mapped paths, without full route planning.
- **Travel is illustrative.** Fixed costs/durations are not live routes/fares. Sintra is a separate municipality and uses the train option or substantially longer walk/cycle estimates; a tram cannot travel there. Overnight rest returns the trip to the chosen home neighbourhood. Accommodation is a fictional base, not a modelled real interior or booking.
- **Content is authored.** Scenarios have two choices and can be completed once per trip. There is no LLM-generated venue data. Rest/overnight are free. Inspiration/connection are game meters, not a universal score or real-person counts.
- **Persistence is local.** Five trips and at most 16 custom pins remain in the same browser. Content version mismatch rejects an incompatible save visibly. Upgrade migrations remain necessary before a public service with active users.
- **Exports stay private.** Itinerary text derives from the action ledger and labels simulated/unconfirmed activities. There is no public sharing endpoint to revoke.

## Remaining before full PRD R1 sign-off

Authenticated content editor, cross-device accounts/server-backed trips, explicit revocable public sharing, verified production cost estimates, richer seasonal content, physical mobile performance measurements, full WCAG 2.2 AA audit and itinerary usefulness evaluation.

Architectural fidelity needs better facade/roof models, surveyed height detail, richer terrain and collision/navigation data. Google imagery or another licensed photogrammetry source would be a separately configured provider, subject to its coverage/terms. The open-data world remains usable without that dependency.

R2 social discovery, groups, chat, reporting/blocking and moderation remain outside this delivery. No real player presence is fabricated.
