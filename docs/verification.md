# Verification record — 2026-10-05

## Passed
- Next.js production build and strict TypeScript check.
- Real PostgreSQL 16 integration suite, including Go race detector: all seven tests passed.
- Content validation: 10 connected hubs, 26 usable venues, 28 activities, six represented transport modes and complete pt-PT API error mapping.
- Browser, desktop: login to local demo account; start Amélia quest; accessible venue list; travel to café; arrival changes available actions; practical shift decision; €18 wage; recipient identity review; €2.50 transfer to offline Tomás; receipt and updated balance; durable private message.
- Original city map rendered on desktop and narrow screens. Responsive venue panel and banking form inspected at 390 × 844; Portuguese copy fits, inputs remain usable, and the browser reports no errors. Map buttons changed from image semantics to grouped keyboard-accessible controls; western map cropping corrected. Fastest/cheapest route selection added. Pending request keys survive reloads and unrelated operations to preserve retry identity.

## Automated database evidence
`TestNewPlayerJourneyAndRestart`: work/food/course/quest/rest/gym, simulated API worker restart during a shift, exactly-once wage, train/beach, ferry, bank movements and logout/resume.

`TestConcurrentMoneyAndRetries`: 20 concurrent transfer attempts against one balance, one debit/credit per accepted operation, same-key retries, key/body conflicts, negative amounts rejected, deferred ledger constraint rejects unbalanced transactions.

`TestSocialOfflineAndAuthorization`: two independently authenticated sessions, real presence, room chat, idempotent messages, offline messages and funds, third-party privacy, blocking, expired sessions, forged travel and forbidden admin corrections.

`TestRobberyProtectionDefenseJustice`: newcomer and safe-area protection, opt-in, defense, capped cash transfer, protected bank funds, no repeated settlement, NPC evidence and appeal, unrelated case rejection, victim and pair cooldowns.

`TestAdminAuditAndDetentionExpiration`: authorized ledger adjustment and audit, temporary activity suspension and offline detention expiry.

`TestOpeningsAndCSRF`: cross-midnight openings, forged Origins rejected, assessment answers omitted from public content.

`TestWebSocketOriginAndRecovery`: authenticated socket, initial snapshot signal, committed outbox notification and cross-origin rejection.

## Limits
Container configuration is validated separately from a full container build. No internet deployment, load test or production claim. Browser testing is interactive verification, not a checked-in automated browser suite. Some systems in the broad brief remain unfinished and are explicitly listed in README/backlog.
