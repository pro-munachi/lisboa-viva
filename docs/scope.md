# ROAM Lisbon pilot

The PRD in PR #1 is the product direction. The accepted Lisbon ROAM visualization is the visual direction: compact original 3D rooms/outdoor scenes, a traveller avatar, warm Lisbon materials, navy controls, a navigation rail, a needs card, and object interactions. This intentionally overrides the PRD's initial “no 3D character system” constraint without copying Lagos Life or its assets.

## Delivered

Guest setup; 3/5-day trips; activity budget and exclusions; styles; base; avatar colour; six scenes; 30 versioned scenarios; preview and consequence; budget/time/energy rules; unique experiences; optional challenges; actual-choice journal/recap; private downloadable itinerary; local save/resume; earlier runs; restart; deletion; cultural sources/review date and map links; accessibility fallback; deterministic automated checks.

The initial public release has no backend. It is a self-contained guest pilot. Repository write access and pull requests are the restricted content publishing workflow. A server-backed account/editor system can be added when cross-device storage or external authoring is needed.

## Deliberate simplifications

- A day runs from 09:00 to 22:00 in simulated Europe/Lisbon time, without calendar dates or daylight-saving conversions.
- Travel costs/durations are fixed illustrative assumptions rather than a real route planner. Overnight rest returns to the fictional loft at the selected base. Loft geometry is shared across bases.
- Scenarios are handcrafted, two-choice experiences. There is no generated venue data or LLM in the loop.
- A scenario can be completed once per trip, avoiding duplicate memory counts. Rest and overnight are always free. Inspiration and connection are game meters, not a universal score or real-person counts.
- Local persistence retains five runs. Content version mismatch rejects an incompatible save; the user receives a visible message. Content migrations are needed before an upgrade with active public users.
- Itinerary export is private text, derived from the actual action ledger, with unconfirmed/fictitious activities labelled. No public sharing endpoint exists to revoke.

## Remaining before full PRD R1 sign-off

Authenticated content editor, cross-device accounts, server-backed private trips, explicit revocable public sharing, verified production cost estimates, richer content/seasonal variety, physical mobile performance measurements, full WCAG 2.2 AA audit and user evaluation of itinerary usefulness.

R2 social discovery, groups, chat, reporting/blocking and moderation remain out of scope. No real player presence is fabricated. The removed legacy database and APIs do not remain exposed.
