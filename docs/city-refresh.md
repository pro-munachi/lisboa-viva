# City appearance and transport camera review

These requests extend ROAM's existing Lisbon pilot. Lagos Life is a reference for readable, playful map interactions; all models, signs and category glyphs here are original. The map continues to use the real geographic bundle rather than rearranged venue clusters.

## Request order

1. **Give buildings distinct identities.** Seven procedural façade families (historic, azulejo, townhouse, civic, modern, office and industrial), fourteen shared colour variants, four roof finishes and flat/gable/hip/mansard silhouettes. Recorded building kinds and footprint/height proportions guide the selection; untagged buildings use a stable geographic/identity seed. Source footprints and total height envelopes stay intact. Nearby balconies, cornices and chimneys regenerate around the camera in one bounded merged mesh per chunk. The far overview uses four shared roof/body prototypes instead of uniformly coloured cubes.
2. **Make hotspots colourful and inviting.** Cafés, restaurants, gyms, shops, nightlife and culture have category colours, larger 44px icon targets, named signs and distinct entry details. Street cafés have striped canopies and mixed-colour terrace seating. Selected and keyboard-focused icons have clear outlines and readable names. Trees, parks and daytime river colours are richer. These details illustrate a category; they do not claim the real business has that façade, furniture or services.
3. **Mix game and app typography.** Self-hosted Outfit gives headings, navigation and map labels a rounded character; DM Sans serves longer text, forms and chat. Both retain their SIL Open Font License files. The app makes no runtime request to Google Fonts.
4. **Show the chosen transport in the camera.** Implemented: original vehicle scenes for onboarding arrival and confirmed journeys, including airport landing, metro/train boarding and movement, bus, tram, taxi, cycling and walking. A final camera transition reveals the mapped destination. Skip and a static reduced-motion version are supported. Booking and game costs remain separate from the temporary visual sequence; completion and reload cannot charge again.
5. **Include beaches.** Implemented: 24 named beach features from the same OSM snapshot, actual coastal coordinates, a Beaches discovery filter, aqua outdoor map icons and bounded umbrellas/deck chairs on matching mapped sand. Beaches do not open a business interior. See [beach coverage and geographic limits](beaches.md).

## Art direction and limits

Original Lisbon-inspired decoration draws on [the Lisbon tourism board's azulejo route](https://www.visitlisboa.com/en/lisbon-stories/18-route-du-azulejo), [the Instituto Superior Técnico's Pombaline façade study](https://fenix.tecnico.ulisboa.pt/departamentos/decivil/dissertacao/2353642135026), [Oriente station](https://www.visitlisboa.com/pt-pt/locais/estacao-oriente) and [LX Factory](https://www.visitlisboa.com/pt-pt/locais/lx-fabricas). Their photographs and assets are not copied into ROAM.

Most source buildings have no detailed architectural tags. The extra colours, window forms and roofs are illustrative and not surveyed reconstructions. Roofs remain inside the source footprint and total height. Close ornament is bounded to 64 nearby buildings per chunk within 350 metres; only three geographic chunks are retained. Detail fades by visibility level, without changing mapped street or building positions.

## Review evidence

All 211 web tests and the typechecked production build pass. The full Go race suite, including real loopback PostgreSQL integrations, and `go vet` pass. Browser inspection showed the striped Café Janis entry, category icon and multiple façade/roof forms around Cais do Sodré. Computed browser styles confirmed both local fonts loaded; desktop content and viewport were both 1218px wide.

An isolated account preview completed an airport landing into the airport journey controls, booked a €2 metro ticket and boarded to Baixa. The boarding view showed the original train and traveller, followed by movement and destination arrival. The budget and simulated 30-minute travel charge applied once, and reload preserved the ledger without replaying the camera sequence. The Beaches filter returned 24 results; Tamariz used its recorded OSM coordinates, source link and outdoor-only controls. At 390 × 844, Beaches remained visible, page width stayed 390px and the 44px Skip button was uncovered and operable by Enter. No warning/error logs appeared in the captured checks. Screenshots are saved locally under `/private/tmp/roam-city-refresh/`.

These checks do not establish physical-device frame rates, real operator bookings, surveyed building/interior appearance or a hosted staging deployment. Plane and vehicle scenes are original illustrations; the destination camera returns to the geographic world.
