# Authentication and authorization

The account service is a Go HTTP service backed by PostgreSQL. Next.js exposes same-origin browser routes under `/api/auth/*` and forwards them to Go through `API_INTERNAL_URL`. The browser never receives a database credential or the raw session-token hash.

## Browser screens

- `/register` creates an adult account and requires `tourist` or `local`.
- `/login` accepts a handle or email and password.
- The protected play route is redirected to `/login` when no session cookie exists, then validates the session through the protected `me` endpoint before rendering the city.
- The account control identifies the active handle and user type and provides logout.

All authored authentication copy defaults to English. European Portuguese remains a supported account locale.

## Endpoints

| Browser endpoint | Go endpoint | Authorization | Purpose |
| --- | --- | --- | --- |
| `POST /api/auth/register` | `POST /v1/auth/register` | Public, rate limited | Create a user, password credential, `player` role, and session. |
| `POST /api/auth/login` | `POST /v1/auth/login` | Public, rate limited | Verify a handle/email and password and create a session. |
| `POST /api/auth/logout` | `POST /v1/auth/logout` | Session optional | Revoke the presented session and expire its cookie. |
| `GET /api/auth/me` | `GET /v1/auth/me` | Valid session | Return the current account and roles. |
| `PATCH /api/auth/me` | `PATCH /v1/auth/me` | Valid session | Change `userType` or `preferredLocale`. |
| `GET /api/admin/users` | `GET /v1/admin/users` | `admin` role | Return up to 100 account summaries. |
| — | `GET /v1/health` | Public | Check database connectivity. |

Unknown JSON fields and multiple JSON values are rejected. The browser proxy streams at most 16 KiB before forwarding and cancels oversized bodies with HTTP 413; Go independently rejects bodies above the same limit, including trailing whitespace. Mutating browser proxy requests reject cross-origin `Origin` values. Each protected Go endpoint performs its own session or role check; the Next.js route gate is not treated as authorization.

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

## Render and staging database

Configure these as secrets or environment variables rather than committing them:

- Go service: `DATABASE_URL`, `PROJECT_ROOT=/app`, `LISTEN_ADDR=0.0.0.0:8080`, `COOKIE_SECURE=true`.
- Next.js service: `API_INTERNAL_URL` set to the private/internal URL of the Go service.
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

`server-account.ts` supplies a server-side guard for additional API handlers. Missing or empty session cookies reject with HTTP 401 before fetching. A nonempty cookie must pass Go's `GET /v1/auth/me` check; rejected sessions remain 401, while backend failures become 503. The check leaves the caller's request body unread.

Before correction, an isolated upstream snapshot passed four mocked proxy checks: same-origin cookie/status forwarding, cross-origin rejection, service-unavailable responses and the oversized-body buffering reproduction. Go 1.26.0 passed seven source-only checks: the three upstream normalization/token tests, invalid-input and missing-session HTTP responses, secure cookie flags, the shared-proxy rate-limit reproduction, and the trailing-data limit reproduction. The reproduction tests established baseline bugs and were not proof of a fix. These checks make no calls to an external account service or database; they do not prove registration, login, SQL migrations or role enforcement against PostgreSQL.

After correction, 11 web checks cover account namespaces, bounded streaming/cancellation, cookie/status forwarding, origin rejection and validated-session API guards. All 13 Go tests pass, along with the race detector and `go vet`; these include outage classification, strict JSON limits, checksums, rollback and a simulated concurrent migration waiter. Those migration tests use transaction doubles, not PostgreSQL. The shared-proxy rate limit remains a documented deployment limitation.

At the reviewed revision, both the [checks run](https://github.com/pro-munachi/lisboa-viva/actions/runs/37634596146) and [staging migration run](https://github.com/pro-munachi/lisboa-viva/actions/runs/37634618662) ended with `startup_failure`. Neither is evidence of passing tests or successful database migration. No staging database credentials were used, no external migrations were run, and no end-to-end PostgreSQL registration/login test was performed during this review.
