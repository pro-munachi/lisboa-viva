# Google 3D world and Places

ROAM has two world renderers. The default open-data city uses bundled OpenStreetMap street and building geometry and public elevation data, rendered with Three.js. Google 3D is an optional renderer using Google's geographical imagery through the official Maps JavaScript API; it can rotate, tilt, pan and zoom across Lisbon and Sintra without separate scene islands. Image detail and availability depend on Google's coverage and the device. It is an imagery view, not a claim that every building, interior or current street condition has been recreated. The open-data renderer works without a Google key; its estimated building heights and stylised facades remain approximate.

## Connect the real-world renderer

1. Choose a Google Cloud project with Maps Platform billing enabled.
2. Enable **Maps JavaScript API** and **Places API (New)**. Configure usage quotas and billing monitoring in that project before using a production key.
3. Create a **browser** API key. Restrict its application access to the intended website origins, including the development origin `http://127.0.0.1:3017` when needed. Restrict its API access to the two enabled services. The loader uses `auth_referrer_policy=origin`, so use origin restrictions without paths.
4. Set this variable in `apps/web/.env.local` (do not commit a key):

   ```dotenv
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_restricted_key
   ```

5. Restart development, or rebuild the deployment. Next.js inlines public variables at build time.

This browser key is visible in the browser by design and must be restricted. Never put a server credential in `NEXT_PUBLIC_` variables. No server Places proxy or server key is needed for this implementation. With no configured key, the app makes no Google API calls. Opening Google mode loads Maps; each submitted Places search can incur usage charges. It does not prefetch Places searches.

The integration currently uses the official weekly Maps JavaScript channel, `Map3DElement`, `Marker3DInteractiveElement`, and `Place.searchByText`. Markers have a title for keyboard and screen-reader access; Google's map controls and attribution remain visible. Reduced-motion preference skips camera flight animations.

## Hotspots and links

`searchGooglePlaces(query, center)` returns at most eight result candidates around the selected location, filtered to the pilot envelope covering Lisbon and Sintra. Search sends only the submitted query and chosen map center to Google, not the player's trip, budget or character state. There are no reviews, photos, availability or price claims in the requested fields.

Google Places result content remains in memory during the session. Do not store result names, addresses or coordinates in saved trips; place IDs may be retained and fetched again when needed. Show Places markers on the Google map, with **Google Maps** clearly associated with the result list and any returned provider credit linked beside the relevant result. Keep Google's own imagery attribution unobscured by game panels. Include a results-ranking explanation near the search UI (relevance, distance and prominence) with [Google's explanation](https://support.google.com/local-listings/answer/9851099).

`parseGoogleMapsLink(url)` reads coordinates already present in a full Google Maps URL without requesting any service. It accepts destination `!3d…!4d…` coordinates, a coordinate query optionally followed by a parenthesized place name, or an `@latitude,longitude` camera view in the pilot region. The optional label follows a complete numeric pair; arbitrary queries that merely contain coordinates are rejected. Camera views are labelled as such and must not be described as verified venue positions. `resolveGoogleMapsLink(url)` additionally requires an approved HTTPS Maps URL and a final position within the bundled world's bounds. Full coordinate URLs resolve locally, without a key or network expansion. User-pasted positions are distinct from API-derived results.

Supported `maps.app.goo.gl` and `goo.gl/maps` share links can be expanded by the application's `/api/map-link` route. It follows only Google-issued HTTP redirects between exact approved Maps hosts and paths, with at most four requests and a six-second total timeout. Each redirect is revalidated; unrelated/private destinations, credentials, non-HTTPS URLs, loops and long chains are rejected. Response bodies are cancelled, so the resolver never scrapes Google page HTML or guesses a position from it. Client code revalidates the returned expanded coordinate URL, and saves that full URL for later local pin restoration. Redirect expansion needs no Google API key or Places request.

Not every share link exposes coordinates in its final URL. Name-only and Place-ID-only links that terminate at a page without URL coordinates remain unsupported by the resolver. Copy an expanded coordinate link from Google Maps or type the mapped place name. Typed local search uses 600 named OSM venues, 1,500 mapped street/locality names and 17 curated landmarks; it is a bundled sample rather than a complete address geocoder. Short-link submission sends only the pasted URL through the application server to approved Google Maps redirect hosts, without trip, budget or character data.

## Validation and remaining dependency

The integration can be typechecked and its URL parsing tested without credentials. Live imagery, key/referrer validation, provider credits and Places search still require a configured project and browser validation. Before public rollout, add publicly accessible application terms and privacy information incorporating the applicable Google terms/privacy policy and confirm the account's regional terms. EEA billing accounts have different service terms and potentially different functionality.

Moving ROAM characters and traffic are simulated game actors in the Three.js preview. Google 3D currently displays geographical imagery and hotspots; it does not supply live moving locals, traffic or game character animation. A later actor overlay needs licensed models, ground placement and route/collision data; the API has `Model3DElement` for glTF assets, but ROAM does not pretend that imagery alone provides those systems.

## Official references

- [3D Maps overview](https://developers.google.com/maps/documentation/javascript/3d/overview)
- [3D map API reference](https://developers.google.com/maps/documentation/javascript/reference/3d-map)
- [3D marker API reference](https://developers.google.com/maps/documentation/javascript/reference/3d-map-draw)
- [Maps JavaScript loading](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)
- [Text Search (New)](https://developers.google.com/maps/documentation/javascript/place-search)
- [Place data API reference](https://developers.google.com/maps/documentation/javascript/reference/place)
- [API key restrictions](https://developers.google.com/maps/api-security-best-practices)
- [Maps JavaScript policies and attribution](https://developers.google.com/maps/documentation/javascript/policies)
- [Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)

Documentation reviewed 7 October 2026. No API credentials are included in the repository.
