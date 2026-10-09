# Beach discovery

ROAM now includes 24 named coastal beach features in its Lisbon-region hotspot directory. The **Beaches** filter, name search, nearby map bubbles and coordinate-based Google Maps links use the same records. Examples include Praia do Tamariz, Praia da Conceição, Praia da Duquesa, Praia de Santo Amaro, Praia de Paço de Arcos and Praia de São Pedro do Estoril. Beaches remain outdoor destinations; they do not open a business interior.

The features were extracted from `natural=beach` nodes/ways in the same cached BBBike OpenStreetMap PBF used for the original world, timestamp **2026-10-02T23:00:00Z**. Every record retains its exact OSM type/ID, feature URL and mapped name. This snapshot supplies polygon-centre map focuses, rounded to six decimal places; these are approximate geographic focuses, not surveyed entrances. Adjacent same-name beach polygon parts within 500 metres are deduplicated. The 24 beaches are appended to the existing 600 businesses, preserving every existing business record and chat-room identity. The named directory now contains 624 records and the authenticated room allowlist contains 645 rooms.

The existing world covers **[-9.435, 38.683, -9.085, 38.832]**. Beach centres outside that rectangle are excluded, including Carcavelos, Guincho, Costa da Caparica and western Sintra beaches. They have not been moved inward or represented as inland scenery. Expanding the region requires its actual coastline, terrain and map geometry.

The current beach scenery uses `city-beach-life.js` to place original shade plots directly on actual mapped sand near the active camera, rather than limiting a named hotspot to one umbrella tableau. Each loaded chunk requests up to **40 arrangements** and **32 scenic visitors on desktop or 24 on narrow/mobile views**, within 160 metres of the focus. Arrangements include striped parasols, fabric canopies, paired loungers, towels and picnic belongings. Beach visitors have sunhats and holiday outfits, with seated, lounging and chatting poses, elders and accompanied children. Up to **six beach walkers per chunk** use checked shoreline routes. These are budgets, not guaranteed counts or live beach attendance.

Complete shade plots and walking routes must fit within source sand polygons and outside any mapped holes. Placement checks source buildings, road and walking corridors, actual water, terrain variation and existing reservations. Furniture reserves its space for subsequent pedestrians and landscaping. Half-open geographic chunk ownership prevents duplicate plots or walkers on shared chunk boundaries. Static furniture and resting visitors are merged into two vertex-colour meshes per chunk; moving visitors retain animated rigs. Pause and reduced motion freeze walking, and updates create no geometry or materials. Only the existing bounded set of loaded city chunks is retained.

The local venue directory still allows up to 24 named destinations per chunk. Beach map bubbles remain available when a coarse source focus has no safe sand placement; no artificial sand island or beachfront building is created. Current geometry probes for Tamariz and Conceição each produce 40 shade plots, 80 loungers and 32 visitors, including six canopies and six animated walkers. See [lively city scenes](lively-city-scenes.md) for the review record.

The directory is an open-data discovery list, with no invented visitor counts, ratings or reviews. It does not report live water quality, lifeguards, weather, opening status or approved bathing conditions. Municipal pages provide further visitor information: [Cascais beach directory](https://www.cascais.pt/praias-de-cascais), [Cascais Ambiente beach directory](https://ambiente.cascais.pt/pt/espacos/praias), and [Praia da Duquesa visitor access](https://www.cascais.pt/descobrir/praia-da-duquesa). Coordinates and geometry remain from the [BBBike Lisbon OSM extract](https://download.bbbike.org/osm/bbbike/Lisbon/), covered by the repository's ODbL attribution.

The decorative crowds above are original simulation scenery, separate from real multiplayer characters and the sourced directory. They do not represent customers, employees or other travellers currently at a beach. The models are approximate procedural art rather than photogrammetry or surveyed furniture.

Rebuild with the same offline source:

```sh
PYTHONPATH=/path/to/osmium python3 scripts/venues-build.py --osm /path/to/Lisbon.osm.pbf
node --import ./apps/web/node_modules/tsx/dist/loader.mjs scripts/chat-rooms-build.cjs
```

`--limit` continues to limit business sampling. Up to 64 named beaches are appended separately so adding coast destinations does not remove previously mapped businesses. Focused tests check accent-insensitive beach search, source identity, outdoor classification, bounds and distance from the mapped coastline, plus scenery placement and rendering bounds.
