# Location arrival flow — 9 October 2026

## Interaction

Selecting a street hotspot or search result first opens a white, rounded location popup. It offers a 360° preview and the existing simulated transport modes: Walk, Bus, Tram and Taxi. Walking remains free within 2 km; the existing euro-wallet fares remain €3, €4 and €12. Choices display their distance and availability. Failed or unconfirmed payments retain their existing retry behavior. Free movement cannot bypass an unresolved payment attempt.

A 360° preview changes the camera without purchasing transport or changing shared venue presence. A transport choice dismisses the popup and plays the existing journey camera. On arrival, the city loads the destination geography and frames the character outside the location. Only then does the second location popup open. It exposes the actual shared activity IDs for an enterable café, gym, bar, shop or gallery. Unknown map pins, beaches and landmarks offer scenery and map actions without inventing a business interior. Transit places retain their transport-card, ticket and boarding flow.

Selecting a concrete room activity closes the popup, enters the room and starts that local simulation once. The room card starts compact, keeping the activity status visible. Entering without choosing an activity simply opens the room. Room corner choices and Perform also minimise the room panel; Room activities reopens it. Successful trip actions and explicit personal outing actions dismiss their action panels. Chat, multistep forms, music controls and unsaved appearance edits retain their explicit-close flows.

## Camera and lifecycle

The 650 ms destination camera movement is interruptible. A reusable blue circle pulses gently below the character’s feet and remains after dismissing the location popup. Paused or reduced-motion scenes show a steady marker. The circle clears on travel, entering an interior, unrelated navigation or walking away. It follows the current character after appearance replacement and releases its geometry and material on teardown. Portrait arrivals shift the camera projection to keep the complete character and circle above the bottom sheet; landscape, travel and interior views restore the normal projection.

Arrival placement uses mapped facade information, building footprints, water, terrain, driving lanes and furniture clearances. Camera choices avoid nearby tree canopies and search around the safe visitor when a neighbouring building obstructs the view. The scene remains approximate and source data is unchanged. Rapid selection, cancelled camera movement and stale asynchronous loads cannot reopen an older location popup. Opening Phone or another primary flow cancels a pending location popup. Interrupted framing exposes a retry message; devices without 3D retain the location options.

## Verification

Automated coverage checks transport versus arrival option stages, valid venue activity IDs, transit gating, safe source URLs, initial room corner selection, camera timing, unsafe-placement rejection, stale selections, interrupted loading, reduced motion and resource disposal.

The final production build passes. All **366 web tests pass** with no failures or skipped tests. The portrait projection test checks head and foot-circle visibility at 390 × 844 and 360 × 800, plus viewport rotation and clearing the arrival view. `git diff --check` passes.

Browser review uses an existing local QA account. Selecting Café Janis opens transport choices before moving the camera. The 360° preview dismisses that popup and opens the activity popup after framing the character outside the mapped café. A free walking journey also completes into that arrival popup without changing the euro wallet. Choosing Try a pastry enters the café, walks to the pastry case and completes once (1/3 corners explored). Room activities reopens the compact card; selecting Espresso bar minimises it again.

The 390 × 844 mobile layout has no horizontal overflow. The location popup is 370 px wide, with 44 px or larger action targets. The final mobile browser capture confirms the character and circle remain above the popup. Screenshots are actual browser captures:

- [Transport choices](review-assets/roam-location-plan.png)
- [Street arrival and activity popup](review-assets/roam-location-arrival.png)
- [Mobile arrival](review-assets/roam-location-arrival-mobile.png)
- [Compact room activities](review-assets/roam-location-activity-compact.png)

This flow is included in the city-life review snapshot alongside the [market, street and beach changes](lively-city-scenes.md). The earlier social graphics and interior work was merged in PR #8.
