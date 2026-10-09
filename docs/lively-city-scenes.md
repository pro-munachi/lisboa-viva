# Lively Lisbon city scenes — 9 October 2026

This change gives the Lisbon pilot recognizable market exteriors, busier nearby streets and furnished beaches. The city retains its actual OpenStreetMap footprints, road positions, terrain and coastline. The added architecture, furniture and crowds are original approximate simulation art, not photogrammetry, surveyed interiors or live attendance. Scenic NPCs remain separate from authenticated multiplayer characters and messaging.

## What changed

- **Mercado da Ribeira, OSM building 39729235:** a covered market hall with three terracotta roof naves, arched entrances, stonework, readable signage, a loading shutter, clock and cupola. Its mapped footprint and height envelope remain intact.
- **Mercado de Benfica, OSM building 146533532:** a distinct circular brick market with a concrete shell roof, clerestory and three decorated entrances. The unrelated apartment building 737906969 keeps its generic treatment; the market identity is exact.
- **Busy streets:** up to 64 scenic pedestrians on desktop or 48 on narrow/mobile views, with a 72-profile hard cap. Both safe pavements populate near the current location. Shoppers, vendors, café workers, commuters, visitors, elders, companion pairs and accompanied families have different clothing, props, paces and pause patterns. Water, buildings and furniture remain excluded from walking sections. Position samples are reused during animation.
- **Decorative traffic:** up to 26 nearby cars on desktop or 18 on narrow/mobile views, with a separate 32-vehicle hard cap. Traffic uses source carriageways and keeps pedestrian paths, cycleways and rail/tram routes out of the car selector. These vehicles are decorative simulation traffic, not live operator data.
- **Beaches:** each loaded chunk requests up to 40 furnished shade plots and 32 desktop or 24 mobile scenic visitors on mapped sand within 160 metres. Striped parasols, fabric canopies, paired loungers, towels and belongings accompany seated, lounging and chatting visitors. Up to six checked shoreline walkers per chunk remain animated; static scenery is batched. Half-open chunk ownership prevents duplication at boundaries.
- **Crowd rendering:** street NPCs beyond 55 metres from the camera use one merged mesh of their original posed body, clothing and role props, with no shadow pass. Their route positions and headings continue moving. The articulated rig returns inside 45 metres, keeping nearby gait and gestures detailed and avoiding rapid switching at the boundary. Distant limbs hold their baked pose; this optimisation does not change account characters or live peers.

The root scene retains only its existing bounded set of geographic chunks. Budgets depend on safe mapped space and do not establish physical-device frame rates. Existing transport costs, accounts, public presence and chat permissions are unchanged.

## Architecture references

Ribeira's market-hall character draws on the [Lisboa municipal magazine, page 12](https://www.lisboa.pt/fileadmin/informacao/publicacoes/revista_lisboa/Revista_Lisboa_08.pdf) and the [municipal Ribeira publication](https://blx.cm-lisboa.pt/product/mercado-da-ribeira/). Benfica's circular nave draws on the [Benfica heritage guide](https://www.jf-benfica.pt/wp-content/uploads/2017/05/Footsteps_site.pdf). These references inform original geometry; their photographs, drawings and textures are not copied into ROAM.

## Actual mapped-geometry probes

Street probes use the bundled terrain, nearest loaded chunks, source roads and buildings, the mapped coastline and generated café, park and beach furniture reservations. Counts below describe generated scenic profiles, not people currently at these places.

| Focus | Desktop / mobile street NPCs | Mapped roads used | Roads with both pavements | NPCs within 100 m |
| --- | ---: | ---: | ---: | ---: |
| Mercado da Ribeira | 64 / 48 | 31 | 10 | 62 |
| Mercado de Benfica | 64 / 48 | 26 | 17 | 58 |
| Café Janis | 64 / 48 | 29 | 16 | 59 |
| Praia do Tamariz | 64 / 48 | 22 | 8 | 32 |

The two mercado focuses are source coordinates inside large market halls; the nearest safe street pedestrian starts approximately 39 metres from each centre. Café Janis has a safe pedestrian 3.4 metres from its source focus. Families and companion pairs remain on their shared safe sections instead of appearing inside a building to inflate density.

Tamariz and Conceição geometry probes each produce **40 arrangements, 80 loungers and 32 beach visitors**, including **six canopies, 34 parasols, 26 resting visitors and six animated walkers**. Tamariz's street/promenade population above is separate from those sand-based beach visitors. Placement preserves source sand and rejects buildings, water, road corridors, unsuitable slopes and reserved furniture space.

## Review evidence

Actual browser views were checked at Mercado da Ribeira, Mercado de Benfica, Café Janis and Praia do Tamariz. The market halls retain distinct silhouettes, source positions and exterior lettering; street views show café terraces, pedestrians on the pavements and cars on the carriageway; beach views show the furnished sand, different resting poses and walkers. Camera arrivals retain the visitor and foot circle. Browser console inspection reported no errors or warnings during these checks. Final automated verification is recorded below.

- [Mercado da Ribeira](review-assets/roam-mercado-ribeira.png)
- [Mercado de Benfica](review-assets/roam-mercado-benfica.png)
- [Tamariz beach life](review-assets/roam-beach-life.png)
- [Café Janis street life](review-assets/roam-busy-street.png)

Final checks: **388 web tests passed**, including exact market identity/geometry/resource bounds, sand and shoreline placement, route clearance and family water safety, traffic selection, and the crowd rendering visibility, identity and lifecycle checks. The production build passed compilation, TypeScript and page generation. The 388-test suite and `git diff --check` passed again when preparing the GitHub review snapshot. A separate read-only review found no material blockers in selection/payment races or scene cleanup.

This review snapshot also includes the [location arrival flow](location-arrival-flow.md). The requested next work on city fixtures, interactive scenery, collision-aware player movement, traffic behaviour and detailed vehicles is separate from this snapshot.

Earlier increment verification remains in [city-refresh.md](city-refresh.md), [beach coverage](beaches.md) and [location arrival flow](location-arrival-flow.md).
