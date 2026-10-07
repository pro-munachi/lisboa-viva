# Verification — ROAM Lisbon geographic pilot

Checks recorded on 7 October 2026 on macOS with Node 24.14.0, Next.js 16.3.8, React 19.2.4, TypeScript 5.9.3 and Three.js 0.160.0. The project supports Node 22 or newer; GitHub Actions is configured for Node 22.

## Automated checks

**33 tests passed** with `npm test`. The direct Node/tsx loader is also available:

```sh
node --import ./node_modules/tsx/dist/loader.mjs --test tests/*.test.ts
```

The normal command is `npm test`. This entry point avoids the `tsx` command-line IPC socket restriction in the local sandbox and executes the same files.

Coverage includes all 45 scenarios and both choices of each; nine destinations; exact-once/retry protection and conflicting payloads; budget/energy/day boundaries; rest recovery; corrupt/forged/incompatible saves; private itinerary derivation; Cais/Benfica/Sintra replay; Sintra train costs and blocked tram routes; long-walk/cycle constraints; geographic projection round trips; terrain interpolation/edges; adult character dimensions, finite geometry, gait and resource cleanup; safe Maps URL parsing; labelled coordinate links; bounded/forged pin storage; and hotspot coverage.

`npm run typecheck`, `npm run build` (including TypeScript compilation) and `git diff --check` passed for the continuous world. The latest regression tests also cover surface grounding against the rendered DEM triangles, preventing characters from being buried on steep terrain. The earlier dependency audit reported zero known production vulnerabilities; dependencies are unchanged in this update.


## Geographic bundle

The compressed manifest and terrain files were read successfully. The manifest records 273,347 building footprints, 123,185 roads/paths, 16,377 surfaces and 83 chunks. The 86 `.json.gz` files total **19,331,582 bytes (19.33 MB)**. Terrain is a 193 × 193 grid. The OSM source timestamp is 2 October 2026 at 23:00 UTC; acquisition was 7 October 2026. Provenance and the reproducible validator command are in `docs/geography.md`.

The bundled world and coordinate-link pins need no Google credential. Google 3D/Places live validation has not been performed because no key is configured. No paid Google requests were made during these checks.

## Browser verification

The production preview runs at `http://127.0.0.1:3017` in the in-app browser. Desktop and 390 × 844 layouts render the geographic world and four original character variants. The character gallery isolates models from geographic occlusion; Street level and Whole region return to the city. Camera zoom/rotation and camera mode selection were exercised. Region loading, named hotspot search, coordinate-link pin creation/removal, pin reload persistence, trip resume, Sintra train travel (€6, 65 minutes) and a confirmed activity/journal were verified. No warning/error logs were captured in the successful render checks. Temporary viewport overrides were reset.

Canvas drag and full walking/collision behaviour have not received automated end-to-end verification. The itinerary button was clicked, but the in-app browser did not produce a downloadable-file event; file delivery remains unverified in this browser. The engine's exported itinerary text is covered by automated tests. Modal opening and its initial close-button focus were observed; full keyboard/screen-reader coverage remains pending. A camera interaction briefly timed out during a large regional render; distant actor rendering/shadows are now suppressed to reduce that load. Physical-device performance remains unmeasured.

The development watcher previously reached macOS's open-file limit (`EMFILE`); the production build/start path was usable. This is a local tooling constraint rather than a deployment requirement.

## Limits

Automated/desktop browser checks do not replace physical-device performance, screen-reader testing, a full WCAG 2.2 AA audit or itinerary user research. Actual footprint coordinates do not establish exact heights/facades, current street conditions or live traffic. NPCs and vehicles are simulated.

Docker configuration has not been built in this session. Earlier GitHub Actions push/PR events reported `startup_failure` before creating jobs ([recorded run](https://github.com/pro-munachi/lisboa-viva/actions/runs/37604590966)); its reason was unavailable. Current hosted CI remains to be checked after the update. No production deployment or migration of legacy accounts/data has been performed.
