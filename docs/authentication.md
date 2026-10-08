# Authentication and authorization

The account service is a Go HTTP service backed by PostgreSQL. Next.js exposes same-origin browser routes under `/api/auth/*` and forwards them to Go through `API_INTERNAL_URL`. The browser never receives a database credential or the raw session-token hash.

## Browser screens

- `/register` creates an adult account, requires `tourist` or `local`, and saves the player's selected Male/Female character model, outfit, hair and colours.
- `/login` accepts a handle or email and password.
- `/` is a public map-led landing page. `/play` redirects to `/login` when no session cookie exists, then validates the session through the protected `me` endpoint before rendering the city.
- The account control identifies the active handle and user type, provides logout and opens **Your wardrobe** through **Edit character**. **Save look** validates the account and returned appearance before updating the city and presence; Cancel discards the draft.

All authored authentication copy defaults to English. European Portuguese remains a supported account locale.

## Endpoints

| Browser endpoint                   | Go endpoint                       | Authorization        | Purpose                                                         |
| ---------------------------------- | --------------------------------- | -------------------- | --------------------------------------------------------------- |
| `POST /api/auth/register`          | `POST /v1/auth/register`          | Public, rate limited | Create a user, password credential, `player` role, and session. |
| `POST /api/auth/login`             | `POST /v1/auth/login`             | Public, rate limited | Verify a handle/email and password and create a session.        |
| `POST /api/auth/logout`            | `POST /v1/auth/logout`            | Session optional     | Revoke the presented session and expire its cookie.             |
| `GET /api/auth/me`                 | `GET /v1/auth/me`                 | Valid session        | Return the current account and roles.                           |
| `PATCH /api/auth/me`               | `PATCH /v1/auth/me`               | Valid session        | Change `userType` or `preferredLocale`.                         |
| `PATCH /api/auth/appearance`       | `PATCH /v1/auth/appearance`       | Valid session        | Replace the player's validated appearance.                      |
| `PUT /api/multiplayer/presence`    | `PUT /v1/multiplayer/presence`    | Valid session        | Publish a bounded in-world location heartbeat.                  |
| `DELETE /api/multiplayer/presence` | `DELETE /v1/multiplayer/presence` | Valid session        | Leave multiplayer immediately.                                  |
| `GET /api/multiplayer/nearby`      | `GET /v1/multiplayer/nearby`      | Valid session        | List active nearby players without private account fields.      |
| `GET /api/admin/users`             | `GET /v1/admin/users`             | `admin` role         | Return up to 100 account summaries.                             |
| —                                  | `GET /v1/health`                  | Public               | Check database connectivity.                                    |

Unknown JSON fields and multiple JSON values are rejected. The browser proxy streams at most 16 KiB before forwarding and cancels oversized bodies with HTTP 413; Go independently rejects bodies above the same limit, including trailing whitespace. Mutating browser proxy requests reject cross-origin `Origin` values. Each protected Go endpoint performs its own session or role check; the Next.js route gate is not treated as authorization.

Each account has one `character_appearances` row linked by `user_id` with `ON DELETE CASCADE`. Its eight saved fields are `bodyType`, `outfitStyle`, `topColor`, `bottomColor`, `hairStyle`, `hairColor`, `skinTone` and `shoeColor`. The Male model offers Casual, Jacket and Explorer; Female also offers Dress. Both retain four stable hairstyle IDs and five existing colour palettes, with distinct hair labels and model geometry. Changing models preserves compatible clothes, hair and colours; selecting Male from Dress changes only the draft outfit to Casual. Registration and appearance updates reject Male + Dress. The API returns the approved saved fields in authenticated account and nearby-player responses so every client renders the same look.

Additive migration `009_character_body_type.sql` supplies `body_type='male'` for existing accounts and enforces the two supported values. Earlier migration files and checksums are unchanged. Missing `bodyType` in an older appearance request/response defaults to male; an explicitly unsupported, empty or null value is rejected. Browser account and peer normalization applies that compatibility rule while copying only approved fields. Current registration and wardrobe requests send all eight fields.

An older saved Dress may therefore read as Male + Dress after the additive default. Reading that account remains valid and does not rewrite its identity or outfit in the database. The character renderer and initial wardrobe draft show Casual for that combination; only an explicit **Save look** stores a compatible choice. The request schema (`AppearanceInput`) applies the stricter new-save rule separately from the legacy-compatible response schema (`Appearance`).

## Session and password rules

- Passwords use a 10–72-byte UTF-8 limit and are stored as bcrypt hashes in `password_credentials`. The browser form currently describes this as a character limit; multibyte characters count toward the byte limit on the server.
- Session tokens contain 256 bits from the operating system random source.
- Only the SHA-256 token hash is stored in PostgreSQL.
- Cookies are `HttpOnly`, `SameSite=Lax`, scoped to `/`, and expire after seven days.
- Set `COOKIE_SECURE=true` for HTTPS staging and production.
- Account status must be `active` for login and authenticated access.
- Roles are normalized in `user_roles`; gameplay professions never grant admin or moderator authorization.

## Local environment

```sh
cp .env.example .env
docker compose up --build
```

The local stack uses PostgreSQL on `127.0.0.1:55433`, Go on `127.0.0.1:8080`, and Next.js on `127.0.0.1:3000`.

For native development without Docker, use PostgreSQL 17 and Go 1.26, then run these commands in a normal terminal from the repository root:

```sh
npm run local:start
npm run dev
```

The helper initializes an isolated cluster, creates the `lisboa` development database, builds the account service and waits for its database-backed health check. PostgreSQL listens only on `127.0.0.1:55433`; Go listens only on `127.0.0.1:8080`. An existing Next.js preview can stay running on its current port because its default API target is already `http://127.0.0.1:8080`.

All database data, binaries, build caches, PID files and logs stay under ignored `work/local/`. The helper discovers the project-local PostgreSQL and Go installations, then Homebrew PostgreSQL 17/16 or tools on `PATH`. Set `PGBIN` to a PostgreSQL bin directory or `ROAM_GO_BIN` to a Go executable to override discovery. PostgreSQL must match an existing cluster’s major version. This setup uses the repository’s fixed development credentials and never reads the staging database URL.

The current workspace has PostgreSQL 17.11 compiled from the official source release under `work/local/postgresql/` and the verified Go 1.26.0 toolchain under `work/local/go/`. These ignored installations are discovered automatically and are not part of the repository. Another checkout must install these prerequisites or provide the tool overrides. They do not create a login-time service.

Some Codex execution sandboxes block PostgreSQL shared-memory initialization and process inspection. If `initdb` reports an operating-system `Operation not permitted` error, run `npm run local:start` from a normal terminal. Installing the binaries alone does not start the database or make signup available; the helper must finish its health check first.

Use `npm run local:status` to check the managed services and `npm run local:stop` to stop them. Stopping retains accounts and database data; it does not install a system service or stop an unrelated API process. Startup applies the checked migrations through Go. Logs are `work/local/postgres.log` and `work/local/auth.log`.

## Render and staging database

For a fresh isolated review environment, use [the prepared Render staging Blueprint and guide](staging.md). That configuration has not yet been deployed and does not reuse existing application accounts or staging secrets.

Configure these as secrets or environment variables rather than committing them:

- Go service: `DATABASE_URL`, `PROJECT_ROOT=/app`, `LISTEN_ADDR=0.0.0.0:8080`, `COOKIE_SECURE=true`.
- Next.js service: `API_INTERNAL_URL` set to the Go service's public HTTPS URL when the Go service uses Render's free plan. Free web services cannot receive private network requests. For a paid Go service in the same region, the private HTTP URL can be used instead.
- Railway proxy target supplied for staging: `zephyr.proxy.rlwy.net:25979`.

After the first administrator creates an ordinary account, set `BOOTSTRAP_ADMIN_HANDLE` to that exact lowercase handle and restart the Go service once. Startup grants the existing account the `admin` role idempotently. Clear the variable afterward. There is deliberately no public role-grant endpoint.

The complete PostgreSQL URL still needs the staging database name, username, password, and SSL mode. Its expected shape is:

```text
postgres://USER:PASSWORD@zephyr.proxy.rlwy.net:25979/DATABASE?sslmode=require
```

The Go service applies checked, ordered migrations at startup. Rotate the staging password in Railway after sharing it through any temporary channel, and update only Render's secret `DATABASE_URL`.

For a separate Render migration job, use the same Go image and set `MIGRATE_ONLY=true`. The process applies pending migrations, verifies checksums for previously applied files, and exits without opening the HTTP listener.

The private GitHub repository stores the full staging URL as the encrypted Actions secret `STAGING_DATABASE_URL`. Collaborators with permission to run Actions can open **Actions → Staging database migrations → Run workflow**. The workflow tests the Go service, applies only pending checked migrations, and never prints the secret. GitHub does not allow collaborators to reveal an existing secret value; grant direct database access through the Railway project when a collaborator needs an interactive SQL connection.

## Review and verification boundary

The authentication review used the exact upstream revision [`ac43624d2d7e91ea7ba142964b31c15f1899e955`](https://github.com/pro-munachi/lisboa-viva/commit/ac43624d2d7e91ea7ba142964b31c15f1899e955), including the account service, browser gate, proxy, roles, migrations and English locale changes. Registration creates the user, bcrypt credential, `player` role and hashed session in a transaction. Session and admin authorization run in Go; checking whether a cookie exists in Next.js is only an initial navigation gate.

The baseline review identified shared browser trip/pin keys, database failures reported as expired sessions, a migration lock ordering race, and incomplete body-size checks. Corrections now scope browser progress to the authenticated account and city, distinguish expired sessions from database errors, lock before migration ledger creation/read, and enforce 16 KiB limits at both proxy and Go boundaries. Legacy shared browser saves are retained and are not silently assigned to an account. Existing databases that had migration `001_users.sql` applied manually still need an explicit baseline plan; the checked runner must not blindly recreate that schema.

The proxy currently forwards neither a trusted client identity nor a client IP. Go limits registration to 10 attempts and login to 15 attempts per minute using its connection's `RemoteAddr`. Consequently, browser users sharing one Next.js proxy share these limits. Forwarded headers must not be trusted without a defined trusted-proxy boundary.

`server-account.ts` supplies the verified-account guard used by the recommendation endpoint. Its cost-bearing rate bucket uses a hash of a verified opaque session rather than trusting forwarded IP headers. The limit is local to one process, so production-wide enforcement still requires shared storage. The helper also supplies a guard for additional API handlers. Missing or empty session cookies reject with HTTP 401 before fetching. A nonempty cookie must pass Go's `GET /v1/auth/me` check; rejected sessions remain 401, while backend failures become 503. The check leaves the caller's request body unread.

Before correction, an isolated upstream snapshot passed four mocked proxy checks: same-origin cookie/status forwarding, cross-origin rejection, service-unavailable responses and the oversized-body buffering reproduction. Go 1.26.0 passed seven source-only checks: the three upstream normalization/token tests, invalid-input and missing-session HTTP responses, secure cookie flags, the shared-proxy rate-limit reproduction, and the trailing-data limit reproduction. The reproduction tests established baseline bugs and were not proof of a fix. These checks make no calls to an external account service or database; they do not prove registration, login, SQL migrations or role enforcement against PostgreSQL.

After correction, 11 web checks cover account namespaces, bounded streaming/cancellation, cookie/status forwarding, origin rejection and validated-session API guards. All 13 Go tests pass, along with the race detector and `go vet`; these include outage classification, strict JSON limits, checksums, rollback and a simulated concurrent migration waiter. Those migration tests use transaction doubles, not PostgreSQL. The shared-proxy rate limit remains a documented deployment limitation. Logout now reports failed database revocation and the browser stays on the current account with a retry message instead of claiming successful sign-out.

At the reviewed revision, both the [checks run](https://github.com/pro-munachi/lisboa-viva/actions/runs/37634596146) and [staging migration run](https://github.com/pro-munachi/lisboa-viva/actions/runs/37634618662) ended with `startup_failure`. Neither is evidence of passing tests or successful database migration. No staging database credentials were used and no external migrations were run. PostgreSQL registration/login had not been checked at that baseline stage; the later local verification below records the real database test.


A later default Go run passes 14 source tests and explicitly skips the opt-in PostgreSQL integration test. `auth_integration_test.go` rejects remote/effective/fallback hosts and uses a unique temporary schema for real migrations, registration, login, session revocation, account suspension and role checks. Run it only after the prepared loopback database is healthy, with `ROAM_TEST_DATABASE_URL` set to that local database URL. The schema is removed after the test. Compilation is not evidence that the database check has run.


## Live local verification

After the user ran `npm run local:start` in a normal Terminal, the database-backed API health check returned `{"ok":true}`. SQL confirmed migrations `001_users.sql`, `002_auth.sql` and `003_default_locale_en.sql` in the isolated project cluster. Registration through the Next.js browser proxy returned 201 and an ordinary `player` account; browser login reached protected `/play`. No staging database was accessed.

The root's network-authorized context ran the complete Go race suite with the explicit loopback PostgreSQL URL: all 16 top-level tests passed, including the opt-in real database test. An independent SQL check confirmed that no temporary integration-test schemas remained. Child-agent network restrictions had prevented an earlier attempt before schema creation; that failed attempt is not counted as successful verification. `go vet` also passed. A named QA account and its demo trip were retained when the preview state changed during checks.
