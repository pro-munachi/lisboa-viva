# Isolated Render staging

The prepared configuration is [deploy/render.staging.yaml](../deploy/render.staging.yaml). It has not been deployed. No staging URL is recorded here; Render assigns the public URLs when the services are created.

This review environment uses two free Docker web services and a fresh free PostgreSQL database in Frankfurt. It uses the `feat/arrival-and-city-experience` branch and the repository root as both Docker build contexts. The containers include the bundled Lisbon map data; Google Maps and AI credentials are optional. Without those keys, the open-data city and authored profile recommendations remain available.

## Create the review environment

1. Connect the intended Render account and select the intended workspace. Give its GitHub integration access to `pro-munachi/lisboa-viva`.
2. Inspect existing resources before syncing. The proposed names are `roam-review-web`, `roam-review-auth` and `roam-review-db`. If any name already belongs to another environment, choose distinct names and update every matching reference in the YAML. Render can update an existing resource when its name matches a Blueprint entry.
3. Check whether the workspace already has a free PostgreSQL instance. Render allows one per workspace. Use a workspace with free capacity or explicitly revise the configuration for a separate staging database; this file does not reuse application accounts or an existing database.
4. Choose **New → Blueprint**, select the repository and `feat/arrival-and-city-experience` branch, and specify **`deploy/render.staging.yaml`** as the Blueprint path. Review the three resources and free plans before the first sync. This file is intentionally outside the default root `render.yaml` path.
5. Let the database and account service become healthy, then wait for the web deployment. Open the web service's assigned HTTPS URL from its Render dashboard; that is the staging link to share.

Both services have automatic deploys disabled. For later reviews, manually deploy the intended branch commit after reviewing changes. A manual Blueprint sync can still apply infrastructure changes, so inspect its proposed updates first.

## Service wiring

| Resource           | Image source               | Runtime configuration                                                                                           | Readiness check                                   |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `roam-review-db`   | Render PostgreSQL          | Fresh database; `ipAllowList: []` disables external database access                                             | Render database status                            |
| `roam-review-auth` | `services/game/Dockerfile` | Database connection injected by `fromDatabase`; `PROJECT_ROOT=/app`; `LISTEN_ADDR=0.0.0.0:8080`; secure cookies | `GET /v1/health`, including database connectivity |
| `roam-review-web`  | `apps/web/Dockerfile`      | Next.js listens on `PORT=3000`; `API_INTERNAL_URL` references the account service's public HTTPS URL            | `GET /`                                           |

The account service copies its Render-generated `RENDER_EXTERNAL_URL` into `PUBLIC_URL`. The web service copies that value into `API_INTERNAL_URL`. This is a server-side runtime variable. Browser auth requests stay on the frontend's `/api/auth/...` routes; the proxy forwards cookies and account responses to Go. Secure cookies are scoped to the frontend by the browser because the proxy forwards the response there.

The public HTTPS API URL is required for this free configuration: free web services can send private requests to PostgreSQL, but cannot receive private network traffic from the frontend. The Blueprint therefore does not use `fromService.property: host` or `hostport` for auth. A paid account service in the same region can instead use its private HTTP address, with corresponding configuration changes.

The account service applies the checked SQL migrations before opening its HTTP listener. Its connection points only to the new review database. No separate migration job, administrator bootstrap or existing staging database secret is included.

If Blueprint validation cannot resolve the URL reference, stop before deploying the web service and inspect the account service's generated URL. Configure `API_INTERNAL_URL` with that HTTPS URL through Render, then redeploy the frontend; do not substitute the private hostname for a free account service.

## Verify before sharing

- Confirm the auth service's assigned `/v1/health` endpoint returns HTTP 200 with `{"ok":true}`.
- Confirm the frontend landing page loads, create an explicitly named staging test account, and verify login, protected `/play`, profile updates and logout through the frontend.
- Confirm the map loads its local `/data/` assets and the recent room, travel and character controls work.
- Confirm the session cookie has `HttpOnly`, `Secure` and `SameSite=Lax`. Do not copy cookies or connection strings into screenshots, logs or documentation.

The frontend's `/` health check verifies its HTTP server, so it does not replace the account-flow checks above.

## Free-plan limits

Free web services sleep after 15 minutes without inbound traffic and can take about a minute to wake. Both the frontend and auth service can need to wake; open the auth health endpoint and wait for readiness before an idle staging session. The workspace shares 750 free web-service hours each month.

The free PostgreSQL database expires 30 days after creation and has no backups. This is a temporary review environment. Preserve any needed test data or approve a database upgrade before expiration; never treat this database as the production account store.

Render references: [Docker deployment](https://render.com/docs/docker), [Blueprint service references](https://render.com/docs/blueprint-spec#referencing-service-properties), [default URL variables](https://render.com/docs/environment-variables), [free-service networking and database limits](https://render.com/docs/free).
