# Authentication and authorization

The account service is a Go HTTP service backed by PostgreSQL. Next.js exposes same-origin browser routes under `/api/auth/*` and forwards them to Go through `API_INTERNAL_URL`. The browser never receives a database credential or the raw session-token hash.

## Browser screens

- `/register` creates an adult account, requires `tourist` or `local`, and saves the player's chosen outfit and colours.
- `/login` accepts a handle or email and password.
- `/` is a public map-led landing page. `/play` redirects to `/login` when no session cookie exists, then validates the session through the protected `me` endpoint before rendering the city.
- The account control identifies the active handle and user type and provides logout.

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

Unknown JSON fields and oversized request bodies are rejected. Mutating browser proxy requests reject cross-origin `Origin` values. Each protected Go endpoint performs its own session or role check; the Next.js route gate is not treated as authorization.

Each account has one `character_appearances` row linked by `user_id` with `ON DELETE CASCADE`. The API accepts only the outfit, hairstyle, skin tone, and clothing colour values rendered by the client. Authenticated user responses and nearby-player responses include this appearance so every client renders the same player look.

## Session and password rules

- Passwords must contain 10–72 characters and are stored as bcrypt hashes in `password_credentials`.
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
