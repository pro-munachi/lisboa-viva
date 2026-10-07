# Beach discovery

ROAM now includes 24 named coastal beach features in its Lisbon-region hotspot directory. The **Beaches** filter, name search, nearby map bubbles and coordinate-based Google Maps links use the same records. Examples include Praia do Tamariz, Praia da Conceição, Praia da Duquesa, Praia de Santo Amaro, Praia de Paço de Arcos and Praia de São Pedro do Estoril. Beaches remain outdoor destinations; they do not open a business interior.

The features were extracted from `natural=beach` nodes/ways in the same cached BBBike OpenStreetMap PBF used for the original world, timestamp **2026-10-02T23:00:00Z**. Every record retains its exact OSM type/ID, feature URL and mapped name. This snapshot supplies polygon-centre map focuses, rounded to six decimal places; these are approximate geographic focuses, not surveyed entrances. Adjacent same-name beach polygon parts within 500 metres are deduplicated. The 24 beaches are appended to the existing 600 businesses, preserving every existing business record and chat-room identity. The named directory now contains 624 records and the authenticated room allowlist contains 645 rooms.

The existing world covers **[-9.435, 38.683, -9.085, 38.832]**. Beach centres outside that rectangle are excluded, including Carcavelos, Guincho, Costa da Caparica and western Sintra beaches. They have not been moved inward or represented as inland scenery. Expanding the region requires its actual coastline, terrain and map geometry.

Original decorative beach umbrellas and deck chairs render only when the selected OSM beach ID matches an existing mapped sand polygon and a clear placement fits wholly inside that footprint. They avoid buildings and road corridors. At most six nearby beach scenes share one geometry batch per loaded chunk. The existing limit of 24 local named destinations is retained. A map bubble can remain available when a coarse beach centre has no suitable sand placement; no artificial sand island or beachfront building is created.

The directory is an open-data discovery list, with no invented visitor counts, ratings or reviews. It does not report live water quality, lifeguards, weather, opening status or approved bathing conditions. Municipal pages provide further visitor information: [Cascais beach directory](https://www.cascais.pt/praias-de-cascais), [Cascais Ambiente beach directory](https://ambiente.cascais.pt/pt/espacos/praias), and [Praia da Duquesa visitor access](https://www.cascais.pt/descobrir/praia-da-duquesa). Coordinates and geometry remain from the [BBBike Lisbon OSM extract](https://download.bbbike.org/osm/bbbike/Lisbon/), covered by the repository's ODbL attribution.

Rebuild with the same offline source:

```sh
PYTHONPATH=/path/to/osmium python3 scripts/venues-build.py --osm /path/to/Lisbon.osm.pbf
node --import ./apps/web/node_modules/tsx/dist/loader.mjs scripts/chat-rooms-build.cjs
```

`--limit` continues to limit business sampling. Up to 64 named beaches are appended separately so adding coast destinations does not remove previously mapped businesses. Focused tests check accent-insensitive beach search, source identity, outdoor classification, bounds and distance from the mapped coastline, plus scenery placement and rendering bounds.
