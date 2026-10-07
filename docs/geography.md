# ROAM geographic world

The continuous world covers a single WGS84 rectangle from **-9.435, 38.683** to **-9.085, 38.832**. Cais do Sodré, central Lisbon, Benfica, Belém, and Sintra occupy their real geographic positions. Sintra is a separate municipality, not a Lisbon neighbourhood. Palácio Fronteira is in São Domingos de Benfica, a different parish from Benfica. There are no artificial district islands or repeated procedural street grids.

## Bundled data and limits

`apps/web/public/data/lisbon-manifest.json.gz` is the initial 318 KB compressed geographic overview (1.55 MB after decompression). It contains 8,135 major road/rail/tram ways, 82 large water/wood/park/sand surfaces, mapped coastline paths, and an index of 83 geographic chunks. The chunks preserve all 273,347 mapped building rings, 123,185 roads and paths, and 16,377 surfaces across the region. They are a geographic grid of approximately 2.2 × 2.8 km, rather than scenes assembled around named places. Nearby chunks load street and footprint detail on demand; the largest compressed chunk is approximately 776 KB (4.3 MB after decompression). The complete compressed bundle, including the overview LOD and terrain, takes **19.33 MB** across 86 files.

`lisbon-overview.json.gz` contains 273,347 distant-view building tuples `[x,z,width,depth,height]` in whole metres relative to `GEO_ORIGIN`. These boxes approximate the bounding boxes of actual footprint rings. They are only a distant level of detail; nearby geometry uses polygon footprints. It is a lazy 1.77 MB compressed fetch (6 MB after decompression), not the startup map.

Footprints and street geometry are real OSM data. **This is not an exact architectural or photorealistic digital twin.** Facades, materials, roof forms, widths when untagged, traffic, and pedestrian behaviour are stylised or simulated. Road paths use Douglas–Peucker simplification at roughly 1–2 metres. Coordinates are rounded to six decimal places. The local equirectangular projection is suitable for this display, not turn-by-turn navigation or surveying.

## City appearance

The nearby city uses six original procedural facade textures with limewash, azulejo-inspired tilework, sash windows, shutters, balcony rails and ground-floor shopfronts. Hip roofs follow each footprint's triangulation, with terracotta tile texture; industrial and tall buildings retain flat roofs. These decorative roofs stay within the recorded overall height. Facade and roof geometry is merged per material, with seven shared texture atlases rather than separate draw calls for each building.

Mapped park and woodland outlines receive bounded, instanced rounded trees, cypress and palms. Iron lanterns, benches, cafe umbrellas and terracotta planters follow actual street margins. Placement rejects building footprints, road corridors, mapped water and overlapping furniture; nearby streets receive priority when a detail chunk loads. Individual trees and furniture are illustrative placements, not surveyed OSM objects. Each chunk has at most 600 trees, 100 lamps, 48 benches, 18 cafe shades and 42 planters; street decoration is hidden at distant camera ranges.

Five monuments have original simplified architecture at their mapped footprints: Rua Augusta's arch, the Sé, Belém Tower, the National Palace of Sintra and Pena Palace. The separate Sintra chimney footprints and Pena's mapped component buildings are preserved. Decorative dimensions, silhouettes and details are approximate. References: [Visit Lisboa's Rua Augusta arch](https://www.visitlisboa.com/pt-pt/locais/arco-da-rua-augusta), [Belém Tower](https://www.visitlisboa.com/pt-pt/locais/torre-de-belem), and [Parques de Sintra's Pena Palace history](https://www.parquesdesintra.pt/en/parks-monuments/park-and-national-palace-of-pena/history/). No downloaded reference models or textures are used.

Warm sunlight, a shaded sky gradient, distance haze and a procedural Tagus water surface complete the scenery. Ambient pause and reduced motion stop water movement along with traffic. Streets have textured calçada-style paving, sidewalk borders, selected lane markings and metallic tram rails. Regional building boxes use facade variation and terracotta top faces while keeping their actual mapped centres.

The Tagus and Atlantic surface is derived from the manifest's 64 directed OSM coastline ways, with land on their left. Clipping the coast to the coverage boundary produces two water regions and ten land regions; seven closed island rings remain holes in the surrounding water. Mainland Lisbon and the portion of Almada inside the bounds remain land. Terrain is rendered only within the land regions, so it cannot hide the river. Park/wood/sand polygons are clipped into the same triangular DEM cells as the terrain, avoiding floating green planes across Sintra's hills. Docks already inside coastal water reuse the river surface; inland water uses an approximate local DEM level.

Building height provenance is explicit in every detailed record:

| Source | Building rings | Treatment |
| --- | ---: | --- |
| `height` | 11,121 | OSM metres when available |
| `building:levels` | 19,485 | Storeys × 3.2 metres |
| `estimated` | 242,741 | Defaults based on building type |

All defaults are estimates. Individual heights are clamped to 2–200 metres. Building polygons retain the outer ring only; courtyard/inner holes are omitted. Non-coastal surface polygons likewise retain outer rings; coastal water preserves the island holes described above. OSM can have missing or outdated mapping. NPCs and vehicles are simulations, with no live traffic or visitor tracking.

`lisbon-terrain.json.gz` contains a 193 × 193 sample grid across the complete region. Twenty public z12 Terrarium tiles supply EU-DEM elevations, ranging from -2.2 to 505.6 metres in this snapshot. Samples are approximately 159 metres east–west and 86 metres north–south. Bilinear interpolation produces the hills, but this resolution does not capture street-level steps, retaining walls, precise pavement slopes or bridges. Source tiles were published in 2017; the fetch date is not a survey date.

The large geographic geometry datasets are stored as deterministic gzip (`mtime=0`), with `.json.gz` chunk URLs in the manifest. Browser loading fetches the compressed bytes, pipes them through `new DecompressionStream("gzip")`, and parses the resulting JSON. Gzip is lossless: the geometry, coordinate precision and data schema remain unchanged. The smaller named-venue and location-name directories described below are published as uncompressed JSON and imported by their typed loaders.

The typed schema and `projectGeo`, `unprojectGeo`, `containsGeo`, and `elevationAt` helpers are in `apps/web/lib/geography.ts`. `GEOGRAPHIC_HOTSPOTS` provides 17 curated landmarks with official cultural references, source coordinates, source-review dates, and explicit links that open Google Maps. Prices/opening hours are not copied into these records.

## Named venues and nearby life

`apps/web/public/data/lisbon-venues.json` adds **600 actual named OSM venues** in a 181,629-byte directory: 160 cafés, 80 gyms/studios, 160 restaurants, 90 bars/nightlife venues, 70 shops and 40 cultural venues. They are selected from 8,757 eligible named features in the same Lisbon–Sintra bounds and source snapshot. Category quotas and a round-robin of 0.0125-degree geographic cells distribute the sample across the region instead of filling it entirely with central Lisbon listings. Same-name/category node and way duplicates within approximately 20 metres are omitted. Individual outdoor exercise machines are excluded from the gym category. This is a sample, not a complete business directory or recommendation.

Each record retains its mapped name, OSM node/way type and ID, exact OSM feature link, category, coordinate provenance and available OSM street/city tags. Node positions retain the mapped point, rounded to six decimal places. Closed-way positions use an approximate polygon centroid; open-way positions use the mean of their mapped vertices. These way positions are **not surveyed entrances**. `apps/web/lib/venues.ts` provides typed records, accent-insensitive name/address search, nearby metre-distance ordering and coordinate-based Google Maps links. These links open Google Maps; Google does not supply the directory.

Nearby detail chunks can depict up to 24 named venues with original category signs, awnings and café seating. A sign is placed along a suitable nearby mapped facade edge when one is available; otherwise the venue retains an approximate sign at its mapped position. Names and source locations are real; facade placement, lettering, awning dimensions, seating and storefront appearance are illustrative. No exact business exterior or interior is claimed, and decorative geometry does not establish a venue's current operation.

Local views populate up to 28 nearby simulated NPCs on mapped pedestrian paths. They are original animated characters, not live visitors or identifiable representations of actual locals, staff or customers. Nearby population, cars and trams make the city feel inhabited; ambient pause and reduced motion stop their movement. Mapping a café or gym does not establish that it is currently open, accepting visitors or offering the simulated game's activity.

Only individual HTTPS website URLs tagged in OSM are retained; malformed addresses, embedded credentials, IP hosts and local hosts are excluded. Website ownership, opening status, opening hours, prices, bookings and accessibility have not been verified. The dataset's limitations and source metadata remain published alongside the records.

## Typed location search and Maps links

`apps/web/public/data/lisbon-locations.json` adds **1,500 mapped location names** in 627,553 bytes: 1,100 named streets/paths and 400 towns, suburbs, neighbourhoods and other locality labels. The source contains 42,181 eligible named street ways; joining same-name ways at shared OSM nodes yields 19,661 available street groups. The place sample is selected from 1,122 deduplicated mapped place labels. Geographic-cell sampling prioritises major/pedestrian streets, towns/suburbs and core tourist district/street names. The index is a sample, **not an exhaustive address geocoder**.

Each record includes its actual OSM name, type/ID, feature source link, coordinate provenance and an explanation of its map focus. A street focus is an actual point along a mapped route near the length-weighted route centroid. A place node retains its mapped position; a place way uses an approximate centroid. None establishes a specific house number or surveyed entrance. `apps/web/lib/map-locations.ts` provides accent-insensitive local search; exact-name matches rank first, then distance from the current map position distinguishes separate same-name streets. Examples present in the source index include Rua Augusta, Avenida da Liberdade, Avenida da Índia, Alfama, Cais do Sodré, Benfica and Sintra. Local name search combines these locations with the 600 venue records and 17 curated landmarks without querying an external geocoder.

Full HTTPS Google Maps links containing supported coordinates are parsed locally and work without a key or network expansion. Destination coordinates take precedence over camera coordinates; an `@latitude,longitude` camera-only URL remains labelled as a map view. The final position must be inside the published Lisbon–Sintra world bounds.

Supported short links can use the bounded `/api/map-link` resolver. It follows only explicit HTTP redirects between exact approved Google Maps hosts and Maps paths, with a maximum of four requests and a six-second total timeout. Redirect loops, unrelated destinations, embedded credentials and non-HTTPS URLs are rejected. Response bodies are cancelled; page HTML is never scraped and coordinates are never guessed from it. The client revalidates the returned expanded coordinate URL before accepting a pin, and saves that expanded URL so later pin restoration works locally. No Places API or API credential is required for redirect expansion.

A short or name-only link that ends at a page without URL coordinates cannot be resolved by this route. A Place ID alone is also insufficient. The app asks for an expanded coordinate link or a mapped place name instead of inventing a position. Submitting a short link sends that URL through the application server to the approved Google Maps redirect hosts; trip, budget and character data are not included.

## Sources and attribution

The OSM extract came from [BBBike's public Lisbon export](https://download.bbbike.org/osm/bbbike/Lisbon/). Its OSM replication timestamp is **2026-10-02T23:00:00Z**, downloaded on **2026-10-07**. The input PBF is not committed. The derived geometry, named-venue directory and street/locality name index in `public/data` remain under the **Open Database License 1.0**. ROAM code and simulation logic do not change this data license. Show the visible attribution **© OpenStreetMap contributors** linked to [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright), and make the downloadable derived database available with that license. The compressed geography, `lisbon-venues.json` and `lisbon-locations.json` are covered by `public/data/LICENSE.txt`. [ODbL 1.0 text](https://opendatacommons.org/licenses/odbl/1-0/).

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

The named-venue directory uses the same input PBF and only needs `osmium`:

```sh
/tmp/roam-geography-venv/bin/python scripts/venues-build.py --osm /path/to/Lisbon.osm.pbf
```

The default `--limit` is 600; an explicit limit up to 2,500 is supported. Extraction and sampling are offline, and the script records candidate/selected category counts, selection method, acquisition date and the PBF's source timestamp. Venue regression checks run with the application's normal test suite.

The street/locality index likewise uses the same cached PBF and `osmium`:

```sh
/tmp/roam-geography-venv/bin/python scripts/map-locations-build.py --osm /path/to/Lisbon.osm.pbf
```

Its default `--limit` is 1,500. Rebuilds preserve feature provenance and the distinction between mapped place points and approximate street/locality focuses. The application does not make external geocoding requests while searching this index.

## Google Maps integration route

Google's [Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles) can provide a photographed architectural surface, where covered, through a proper 3D Tiles renderer. [Map Tiles API setup](https://developers.google.com/maps/documentation/tile/get-api-key) requires a configured Google Cloud project, enabled API, billing and restricted API key. [Renderer guidance](https://developers.google.com/maps/documentation/tile/create-renderer) and [policies](https://developers.google.com/maps/documentation/tile/policies) require Google branding and per-tile source attribution. Regional availability and EEA billing-address terms must be checked before choosing this provider. This bundle does not download or redistribute Google's 3D tiles.

For real searchable Google hotspots, use authorised [Places API setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key), autocomplete/place selection and a Place ID, rather than scraping Maps. [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) limit storing/caching content and govern displaying results on maps. [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id) are an allowed storage exception. Because the base scene is an OSM-derived scene, confirm Google display requirements before placing Google Places content on it. The current curated links use [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), which need no API key and only open the selected place in Google Maps.
