# ROAM — Product Requirements Document

**Status:** Draft for Bassey and Munachi to review
**Date:** 6 October 2026
**Working name:** ROAM; final brand to be agreed
**Proposed pilot:** Lisbon
**Target market:** Travelers visiting European and US cities

## 1. Product concept

ROAM is a city life simulation for tourists. Players create a traveler, select a destination, set a budget and trip length, and experience the city through choices that affect their money, time, energy, and memories. A simulated trip can become a practical itinerary. In a later social release, travelers with overlapping trips can opt into shared activities.

**Promise:** Experience a city before you experience the city.

The concept draws inspiration from the culturally specific simulation described in Lagos Life and the traveler discovery described in Nomadtable. These are inspiration references from the initial discussion, not verified competitor research. Their launch dates, user counts, and feature claims are not assumptions behind this plan.

## 2. Problem and audience

Planning a trip often means juggling maps, recommendations, budgets, and bookings without knowing how the choices fit together. Solo travelers also need ways to discover compatible activities and people.

The initial audience is solo travelers and friends planning short city breaks. European and US destinations are the geographic focus; travelers can originate anywhere. Digital nomads, students, and people considering relocation are possible later audiences.

The hypothesis is that an enjoyable simulation will help users discover places, understand tradeoffs, and create a trip they want to take. This needs validation before broad city coverage or a full social network is built.

## 3. Core experience

1. Choose a city, trip duration, spending budget, neighborhood, and traveler style.
2. Receive a scenario with two to four meaningful choices.
3. Preview each choice's estimated cost, duration, and energy impact.
4. Make the choice and see its consequence immediately.
5. Discover a place, unlock a memory or challenge, and move to the next scenario.
6. Finish the trip and view a recap, replay, or turn the selected experiences into an itinerary.
7. In the social release, opt into finding travelers for a chosen activity.

### Example scenario

> You have arrived in Lisbon. You have three days, €300 in activity spending money, and 85 energy. It is early evening. What do you do first?
>
> - Try a neighborhood dinner.
> - Walk to a viewpoint.
> - Take a short local exploration route.
> - Rest and save your energy.

All displayed prices in prototypes must be labeled as illustrative. Production estimates require a source and a last-reviewed date.

### Simulation rules

| State | Rule |
| --- | --- |
| Money | Deduct modeled expenses once per confirmed action. Block unaffordable choices and show an alternative. |
| Time | Advance by activity and travel duration. Prevent overlaps and handle day boundaries. |
| Energy | Keep within 0–100. Activities consume energy; rest restores it. Low energy changes available choices without trapping the player. |
| Experiences | Record distinct completed experiences and progress toward optional challenges. |
| Memories | Generate a recap from actual player choices. Never imply a simulated visit occurred in real life. |

Avoid a universal score that rewards expensive travel or penalizes rest. Challenges can have explicit goals such as staying within budget or discovering several neighborhoods.

## 4. Release scope

### Release 1 — Simulation and itinerary MVP

- Mobile-first browser experience, with desktop support.
- One curated city: Lisbon, subject to joint agreement.
- Two trip lengths: three and five days.
- Three starting traveler styles: budget explorer, foodie, and culture seeker.
- Simple avatar selection; no 3D character system.
- At least 30 authored scenarios covering different trip stages and choices.
- Budget, time, energy, place discovery, and three optional challenges.
- Save and resume, restart, and replay with different choices.
- Trip recap and a private-by-default itinerary derived from selected activities.
- Place cards with neighborhood, indicative cost, duration, source, review date, and a map link.
- Explicit user action to create a shareable recap or itinerary link.
- A restricted content workflow for reviewing and publishing scenarios and place data.

Guests can play without registering. Authentication is required for cross-device saving; social participation comes later. A guest session must survive a refresh on the same browser. Explain that clearing browser storage can erase guest progress.

### Release 2 — Optional traveler connection

- Accounts, minimal profiles, trip dates, interests, and opt-in discovery.
- Matching by city, overlapping dates, and shared activity interests.
- Create or join small activity groups with capacity limits and mutual acceptance.
- Group chat, leave-group controls, blocking, reporting, and moderation tools.
- Public meeting locations and coarse city or neighborhood visibility; no live location tracking.
- No fictional users, inflated counts, or simulated meetup confirmations presented as real people.
- Proposed initial social eligibility: adults 18 and over.

Real traveler discovery remains central to the long-term concept, but it should open only when there are enough participants and moderation capacity in the pilot city. Release 1 can collect separately consented interest in the social beta.

### Outside the first two releases

Native mobile apps, open-world 3D gameplay, in-app bookings and payments, live location tracking, a global city catalog, relocation simulation, AI-generated factual venue data, and a full hotel or flight search engine.

## 5. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| FR-01 | Trip setup | Users can start either trip length with a valid budget and traveler style. Budget currency and exclusions are visible. |
| FR-02 | Choice engine | A confirmed choice updates state and history exactly once, including after retries or double taps. |
| FR-03 | Valid state | Money never becomes negative, energy stays within bounds, and activities cannot overlap. |
| FR-04 | Playable progression | Every reachable state offers a valid action, including low-money and low-energy states. |
| FR-05 | Persistent progress | Reloading restores the last confirmed action and balances; authenticated progress resumes across devices. |
| FR-06 | Traceable city content | Published place records include sources and review dates. Unknown or stale details are labeled rather than invented. |
| FR-07 | Useful itinerary | The itinerary preserves selected experiences, separates estimated spend from game state, and flags unavailable or unconfirmed activities. |
| FR-08 | User-controlled sharing | Private trips remain inaccessible to other users. Share links expose only the selected recap and can be revoked. |
| FR-09 | Replay | Restarting creates a fresh run without corrupting earlier saved trips. |
| FR-10 | Content management | Authorized editors can preview, revise, and publish content; ordinary users cannot alter it. |
| FR-11 | Social matching | In Release 2, only opted-in users with overlapping dates and shared activity interests appear. Empty results are stated honestly. |
| FR-12 | Social controls | Blocking prevents further discovery and direct interaction between the two accounts. Reports reach a review queue. |

Dates for real activities use the destination's local timezone. Social actions must handle canceled activities, changed trip dates, full groups, and users leaving or being removed.

## 6. City content and itinerary accuracy

Each city must have its own authored character. Lisbon scenarios can explore neighborhood choices, hills, viewpoints, transport, food, and day trips. Future cities need distinct content and constraints rather than renamed copies.

Separate fictional events from verified practical information. Simulation costs are estimates, not booking offers. The MVP budget covers local activities, food, and transport; flights and accommodation are excluded unless the user explicitly adds them later.

Use curated activity durations and conservative travel buffers initially. Flag opening times, reservations, and availability for verification before travel. Do not promise current routing, live weather, or real-time prices without an appropriate data source. Store a content version with each trip so updates do not silently change an ongoing game.

## 7. Main screens

1. Landing page and city selection.
2. Traveler and trip setup.
3. Simulation dashboard: scenario, choices, money, time, energy, and progress.
4. Place details and discovery history.
5. End-of-trip recap and replay.
6. Itinerary view and sharing controls.
7. Restricted content editor.
8. Later: traveler discovery, activity group, chat, and reporting.

Visual direction: playful city illustrations, clear choice cards, and readable state changes. Make the interface usable with touch, keyboard, screen readers, and reduced-motion settings.

## 8. Suggested technical approach

This is a recommendation for discussion, not a committed stack.

- A TypeScript web application with a responsive frontend and relational backend.
- A deterministic rules engine for state transitions; authored scenario content stored separately from the rules.
- Server validation for authenticated trip actions; a validated local guest state for the initial demo.
- Core entities: City, Place, Scenario, Choice, Challenge, Trip, TripAction, and User.
- Later entities: TravelerProfile, ActivityGroup, Membership, Message, Block, and Report.
- No LLM is required for the first release. Optional later narrative variation must not invent prices, venues, opening hours, or traveler identities.

Target an initial playable screen within three seconds on a representative mid-range phone and mobile connection. Establish and record the test device and connection profile before judging this target. Use WCAG 2.2 AA as the accessibility target.

## 9. Privacy and operating requirements

Collect only data required for the feature. Social visibility requires explicit opt-in; share precise trip dates only where necessary and clearly disclosed. Avoid exposing accommodation addresses. Provide account deletion, link revocation, and a documented retention policy before opening the social beta.

Before social launch, assign a moderation owner and response process. Booking partners and sponsored recommendations, if introduced, must be labeled and must not alter player choices invisibly.

## 10. Validation and success measures

Start with 15–20 target-user sessions on a playable Lisbon prototype. These are directional product tests, not statistically representative market proof.

| Metric | Definition | Proposed pilot target |
| --- | --- | --- |
| Activation | Setup completers who make at least five choices | At least 60% |
| Completion | Started runs reaching the trip recap | At least 35% |
| Replay | Activated testers starting a second run within seven days | At least 20% |
| Travel utility | Completed runs whose users save an itinerary | At least 25% |
| User feedback | Interviewed testers describing both enjoyable play and useful discovery | At least 70% |

Targets are hypotheses for joint review. Track setup completion, confirmed choices, run completion, replay, itinerary saves, and sharing. Record failures and abandonment points. Do not send chat content or precise travel details into general analytics.

Proceed to social testing when the game is useful on its own and enough opted-in travelers have overlapping pilot-city dates. Establish group participation and moderation metrics before that release.

## 11. Monetization hypotheses

Keep the initial pilot free. Later test premium city packs, themed challenges, or advanced itinerary tools. Affiliate experiences and sponsored activities are potential revenue sources after the product demonstrates travel intent. No revenue forecast is assumed, and essential blocking or reporting controls must remain free.

## 12. Delivery milestones

| Milestone | Deliverable | Exit condition |
| --- | --- | --- |
| Product agreement | Reviewed scope, pilot city, brand placeholder, and assigned responsibilities | Bassey and Munachi agree on the first release |
| Playable slice | Setup, ten scenarios, state engine, and recap | Users can complete a coherent short run without broken state |
| Simulation MVP | Full pilot content, persistence, itinerary, and content workflow | Release 1 acceptance criteria pass |
| Pilot review | User sessions and behavior analysis | Decide whether to improve the loop, expand content, or begin social beta |
| Social beta | Opt-in discovery, groups, chat, and moderation | Release 2 controls pass and operating ownership is in place |
| Expansion | A second European city, followed by a US pilot | A repeatable city content process and positive pilot evidence exist |

Dates and estimates should follow implementation review; no delivery commitment is implied here.

## 13. Decisions for Bassey and Munachi

- Confirm Lisbon as the first destination and ROAM as a temporary name.
- Agree whether social features follow the simulation pilot or enter a limited first beta.
- Assign product, engineering, city-content, design, and moderation responsibilities.
- Choose a stack, content sources, operating budget, and development schedule.
- Confirm repository, access permissions, and whether this PRD should be reviewed through a pull request.

**First build:** A mobile web simulation in which someone can complete a short Lisbon trip, see the consequences of their choices, and save a useful itinerary.
