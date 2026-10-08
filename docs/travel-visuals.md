# Transport visuals: aircraft and airport

ROAM's flight scene uses an original small airliner and authored airside scenery. Lagos Life is a reference for readable travel transitions; ROAM keeps its own cobalt, coral and mint identity. No aircraft, terminal model, imagery or branding is copied from the reference app.

## Aircraft and scenery

The tapered airframe is about 37 metres long with a roughly 37-metre wingspan, swept wings, raised winglets, two recessed turbofan intakes with animated fans, stabilizers, cockpit glazing, forty cabin windows and six landing-gear tyres. The white body has a cobalt underside, coral stabilizers and original ROAM lettering/compass tail marks. General airliner proportions and winglet function were checked against [Airbus's A320 technical reference](https://www.aircraft.airbus.com/en/aircraft/a320-family/a320ceo) and [its winglet explanation](https://www.airbus.com/en/newsroom/news/2017-02-winglets-a-tip-top-solution-for-more-efficient-aircraft). This is a generic ROAM aircraft, not an Airbus reproduction or operator's livery.

The runway has threshold ladders, a centreline, touchdown blocks, edge bands and warm edge lights. An apron adds stand/taxiway guides, baggage carts, floodlight masts, jet bridges, a glazed terminal and a control tower. Subtle coarse-ground variation, weathered apron/runway surfaces and nineteen simple perimeter building masses add depth beyond the immediate runway. Terminal/perimeter massing is illustrative; the tableau does not claim to reconstruct Lisbon Airport. Its geographic anchor remains the route's mapped airport, and the final shot returns to the existing geographic city model.

Static airport furniture is merged by material. Runway and grass remain separate readable surfaces; fans and landing gear remain separate animated parts. The implementation uses shared geometry, original lettering and deterministic native texture maps for paint, fabric, carpet, asphalt and coarse ground. Textured batches retain their UVs. Aircraft paint has clearcoat, dark glazing has a smoother finish and upholstery stays rough.

Daylight sky and subtle reflections use the locally bundled [Poly Haven Kloofendal partly cloudy pure-sky HDR](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), released as CC0. Its authors, source, license and checksum are recorded in [the asset provenance](../apps/web/public/textures/travel/LICENSE.txt). This artistic sky is not Lisbon photography or live weather. The local HDR loads once per runtime, survives journey changes and disposes on teardown, including a late load after disposal. Night or failed sky loading retains the generated gradient backdrop.

## Flight sequence

Arrival lasts 10.5 seconds:

| Time       | Shot        | Visible behaviour                                                                |
| ---------- | ----------- | -------------------------------------------------------------------------------- |
| 0–3.0 s    | Approach    | Aircraft descends toward the runway; the camera follows above its front quarter. |
| 3.0–4.4 s  | Flare       | The camera lowers and the nose rises gently as descent slows.                    |
| 4.4–5.4 s  | Touchdown   | Main tyres meet the runway first, followed by the nose settling.                 |
| 5.4–8.2 s  | Rollout     | The aircraft decelerates while the camera widens to show the airside setting.    |
| 8.2–10.5 s | City reveal | A cut above the real destination becomes a zoom into its mapped position.        |

Departure starts with a short ground movement, accelerates along the runway, rotates, climbs and retracts the gear before the same destination reveal. Tyre contact compensates for the rotated main-wheel centre so nose-up touchdown does not push the tyres through the runway. Camera distance adapts to portrait screens to retain the full wing/airframe silhouette.

The public boarding/travelling/arriving events remain unchanged. Skip completes once, replacement/cancel disposes the old scene, and a static reduced-motion preview cuts to the destination within one second. Visual stages do not create bookings or additional trip charges. Saved character appearance continues into transport scenes.

The runtime accepts a bounded snapshot of the city time of day. Night reduces the warm key light while retaining enough fill to read the aircraft, and runway/navigation lights remain emissive. `city-scene.js` supplies its existing time-of-day value.

Flight models and lights use a private camera layer so city lights do not wash out the aircraft/interior. A bounded 1024px shadow light follows the aircraft for runway contact. The original camera layer mask and field of view return on skip, cancel, replacement and mapped-city reveal.

## Outside, cabin and seat views

The runtime starts in `outside`. `setView("outside" | "cabin" | "seat")` switches the camera immediately and returns a Boolean; `view` exposes the current selection. Invalid/non-flight selections and selections during the final mapped-city reveal return false. Switching does not restart elapsed time, trigger another phase, book a trip or charge again. The same aircraft trajectory continues while its exterior is hidden.

The original cabin is built once, on its first use, with thirty rounded navy/teal seats arranged 3+3, warm off-white overhead bins, a continuous curved ceiling, oval sky windows, warm ceiling strips and two local fill lights. Seven colourful decorative passengers and a standing crew member/trolley make the cabin readable; these are illustrations rather than live multiplayer users. Shared actor materials keep their added draw count bounded. The saved traveller sits at 3A with the same outfit, hair, skin and colours used outside.

The `cabin` camera sits at eye level inside the aisle and shows the occupied rows. `seat` looks diagonally through the full oval surround from the same window seat and hides the traveller's own body to avoid head/camera clipping. A small original wing and ground panorama provides a landing cue and shifts with flight progress; it is not imagery of the actual destination. The seat view uses a wider field of view and adapts its distance on portrait screens. Furniture and decorative actors are merged by material.

Both view changes remain static with reduced motion. The final city reveal takes priority over all three flight views. Lazy cabin resources are included in skip, replacement, cancel and completion cleanup.

## Verification

The focused suites pass 26 tests: 23 travel tests and three procedural-material tests. They cover finite geometry for every transport mode, desktop/portrait flight/cabin subjects, main-before-nose touchdown contact, departure acceleration/gear retraction, lighting input validation and exactly-once disposal/completion. Cabin tests verify saved seated appearance, clear crew/window sight lines, stable time/phases across view changes, final-map priority and cleanup under reduced motion. Environment tests verify sharing across journeys, failed-load fallback and late-load disposal. Camera tests check restoration of both layer mask and field of view. TypeScript checking passes.

The initial outside tableau contains 185 meshes, 61 unique geometries, 62 materials and 20,319 unique vertices. Regression limits cap this at 200 meshes, 64 geometries/materials and 25,000 unique vertices. Once the optional cabin is created, the complete scene (including the hidden exterior) contains 274 meshes, 132 unique geometries, 113 materials and 180,255 unique vertices, bounded by tests at 280 meshes, 160 geometries, 130 materials and 200,000 vertices. Rounded upholstery adds vertices while shared actor materials reduce draw/material counts. Only the selected exterior or interior is displayed.

The ten 128px procedural maps occupy 640 KiB of source pixels; bump and roughness share packed scalar textures. The separately owned 1K HDR is 1.44 MB on disk. These are scene/resource checks, not measured device frame rates or total renderer memory.

The integrated web suite passes all 277 tests, and the typechecked production build passes. Browser review verified the finished exterior, landing, cabin and window views on desktop and an occupied cabin at 390px width. All three view buttons retained 44px targets in one row. Natural completion, Skip and reload preserved the trip ledger without replaying the journey; captured browser checks had no warnings or errors.

Durable review screenshots: [exterior](review-assets/flight-exterior.png), [landing](review-assets/flight-landing.png), [cabin](review-assets/flight-cabin.png), [window seat](review-assets/flight-seat.png), and [phone cabin](review-assets/flight-cabin-phone.png).
