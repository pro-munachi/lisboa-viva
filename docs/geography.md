# ROAM geographic world

The continuous world covers a single WGS84 rectangle from **-9.435, 38.683** to **-9.085, 38.832**. Cais do Sodré, central Lisbon, Benfica, Belém, and Sintra occupy their real geographic positions. Sintra is a separate municipality, not a Lisbon neighbourhood. Palácio Fronteira is in São Domingos de Benfica, a different parish from Benfica. There are no artificial district islands or repeated procedural street grids.

## Bundled data and limits

`apps/web/public/data/lisbon-manifest.json.gz` is the initial 318 KB compressed geographic overview (1.55 MB after decompression). It contains 8,135 major road/rail/tram ways, 82 large water/wood/park/sand surfaces, mapped coastline paths, and an index of 83 geographic chunks. The chunks preserve all 273,347 mapped building rings, 123,185 roads and paths, and 16,377 surfaces across the region. They are a geographic grid of approximately 2.2 × 2.8 km, rather than scenes assembled around named places. Nearby chunks load street and footprint detail on demand; the largest compressed chunk is approximately 776 KB (4.3 MB after decompression). The complete compressed bundle, including the overview LOD and terrain, takes **19.33 MB** across 86 files.

`lisbon-overview.json.gz` contains 273,347 distant-view building tuples `[x,z,width,depth,height]` in whole metres relative to `GEO_ORIGIN`. These boxes approximate the bounding boxes of actual footprint rings. They are only a distant level of detail; nearby geometry uses polygon footprints. It is a lazy 1.77 MB compressed fetch (6 MB after decompression), not the startup map.

Footprints and street geometry are real OSM data. **This is not an exact architectural or photorealistic digital twin.** Facades, materials, roof forms, widths when untagged, traffic, and pedestrian behaviour are stylised or simulated. Road paths use Douglas–Peucker simplification at roughly 1–2 metres. Coordinates are rounded to six decimal places. The local equirectangular projection is suitable for this display, not turn-by-turn navigation or surveying.

Building height provenance is explicit in every detailed record:

| Source | Building rings | Treatment |
| --- | ---: | --- |
| `height` | 11,121 | OSM metres when available |
| `building:levels` | 19,485 | Storeys × 3.2 metres |
| `estimated` | 242,741 | Defaults based on building type |

All defaults are estimates. Individual heights are clamped to 2–200 metres. Building polygons retain the outer ring only; courtyard/inner holes are omitted. Surface polygons likewise retain outer rings, so islands and courtyards may be filled. OSM can have missing or outdated mapping. NPCs and vehicles are simulations, with no live traffic or visitor tracking.

`lisbon-terrain.json.gz` contains a 193 × 193 sample grid across the complete region. Twenty public z12 Terrarium tiles supply EU-DEM elevations, ranging from -2.2 to 505.6 metres in this snapshot. Samples are approximately 159 metres east–west and 86 metres north–south. Bilinear interpolation produces the hills, but this resolution does not capture street-level steps, retaining walls, precise pavement slopes or bridges. Source tiles were published in 2017; the fetch date is not a survey date.

All public generated JSON is stored as deterministic gzip (`mtime=0`), with `.json.gz` chunk URLs in the manifest. Browser loading fetches the compressed bytes, pipes them through `new DecompressionStream("gzip")`, and parses the resulting JSON. No raw generated `.json` files are published. Gzip is lossless: the geometry, coordinate precision and data schema remain unchanged.

The typed schema and `projectGeo`, `unprojectGeo`, `containsGeo`, and `elevationAt` helpers are in `apps/web/lib/geography.ts`. `GEOGRAPHIC_HOTSPOTS` provides 17 curated landmarks with official cultural references, source coordinates, source-review dates, and explicit links that open Google Maps. Prices/opening hours are not copied into these records.

## Sources and attribution

The OSM extract came from [BBBike's public Lisbon export](https://download.bbbike.org/osm/bbbike/Lisbon/). Its OSM replication timestamp is **2026-10-02T23:00:00Z**, downloaded on **2026-10-07**. The input PBF is not committed. The derived geometry in `public/data` remains under the **Open Database License 1.0**. ROAM code and simulation logic do not change this data license. Show the visible attribution **© OpenStreetMap contributors** linked to [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright), and make the downloadable derived database available with that license. [ODbL 1.0 text](https://opendatacommons.org/licenses/odbl/1-0/).

Terrain comes from the [AWS Terrain Tiles public dataset](https://registry.opendata.aws/terrain-tiles/) maintained by the Mapzen/Tilezen project. Lisbon tiles declare `eudem/eudem_dem_5deg_n35w010.tif` as their source. Use this attribution in the map credits:

> Produced using Copernicus data and information funded by the European Union — EU-DEM layers.

The [Tilezen attribution guide](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) gives the source-provider requirements. The [Tilezen service documentation](https://github.com/tilezen/joerd/blob/master/docs/use-service.md) describes Terrarium's encoding `R × 256 + G + B / 256 − 32768`. The derived grid is sampled/downscaled data, not newly surveyed elevation.

Hotspot coordinates come from mapped OSM nodes, way footprint/path centroids, a mapped MAAT relation, and the [official Parques de Sintra visitor brochure](https://www.parquesdesintra.pt/media/2igfi41g/pena_en.pdf) for the National Palace of Sintra. Official cultural descriptions are linked per record: Visit Lisboa, Câmara Municipal de Lisboa, MAAT, CP, Parques de Sintra, and Fundação CulturSintra. Clicking a Google Maps link does not imply Google supplied the bundled map data.

## Refresh and verify

Use Python 3 with `osmium` and `Pillow`, and `curl` for verified HTTPS downloads. A temporary virtual environment is sufficient; these are data build tools, not browser dependencies.

```sh
python3 -m venv /tmp/roam-geography-venv
/tmp/roam-geography-venv/bin/pip install osmium Pillow
/tmp/roam-geography-venv/bin/python scripts/geography-build.py --cache /tmp/roam-geography
python3 scripts/geography-validate.py
```

To use a pre-downloaded BBBike PBF, pass `--osm /path/to/Lisbon.osm.pbf`. `--terrain-only` rebuilds only the height grid. Refresh deliberately; the application never queries public Overpass servers on player requests. The script uses the source extract's OSM timestamp and records the acquisition date independently. Keep attribution, limitations and source links with every redistributed dataset.

## Google Maps integration route

Google's [Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles) can provide a photographed architectural surface, where covered, through a proper 3D Tiles renderer. [Map Tiles API setup](https://developers.google.com/maps/documentation/tile/get-api-key) requires a configured Google Cloud project, enabled API, billing and restricted API key. [Renderer guidance](https://developers.google.com/maps/documentation/tile/create-renderer) and [policies](https://developers.google.com/maps/documentation/tile/policies) require Google branding and per-tile source attribution. Regional availability and EEA billing-address terms must be checked before choosing this provider. This bundle does not download or redistribute Google's 3D tiles.

For real searchable Google hotspots, use authorised [Places API setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key), autocomplete/place selection and a Place ID, rather than scraping Maps. [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) limit storing/caching content and govern displaying results on maps. [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id) are an allowed storage exception. Because the base scene is an OSM-derived scene, confirm Google display requirements before placing Google Places content on it. The current curated links use [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), which need no API key and only open the selected place in Google Maps.
