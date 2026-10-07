# Verification — ROAM Lisbon pilot

Verified on 7 October 2026 on macOS with Node 22-compatible tools, Next.js 16.3.8, React 19.2.4, TypeScript 5.9.3, and Three.js 0.160.0.

## Automated checks

- `npm test`: 12 deterministic tests passed. Includes all 30 authored scenarios and both options of each, six destination state transitions, double-tap/retry protection, conflicting idempotency payloads, insufficient funds/energy/time, unique experiences, 3/5-day boundaries, rest recovery, corrupted/forged/version-incompatible saves, private itinerary derivation, and prototype-key rejection.
- `npm run typecheck`: passed.
- `npm run build`: passed; the app prerenders the home and not-found routes successfully.
- `git diff --check`: passed.
- `npm audit --omit=dev`: zero known vulnerabilities at verification time.

## Browser verification

The production preview runs at `http://127.0.0.1:3017`. Chrome automation was blocked by an open extension popup before interaction checks could run. Browser screenshot, responsive layout, WebGL rendering, reload persistence, modal focus, and itinerary download verification remain pending until the popup is dismissed.

The development watcher reached macOS's local open-file limit (`EMFILE`). The production build/start path works without that watcher. This is a local tooling issue, not a deployment requirement.

## Limits

Automated state tests do not substitute for physical-device performance, screen-reader testing, a full WCAG 2.2 AA audit, or itinerary user research. Docker configuration is provided but was not built in this session. GitHub Actions reported `startup_failure` for both push and PR events before creating any jobs/check runs ([run](https://github.com/pro-munachi/lisboa-viva/actions/runs/37604590966)). The workflow YAML passes syntax/format validation locally. The available API did not expose the startup reason, so hosted CI has not been verified. No production deployment or migration of legacy accounts/data has been performed.
