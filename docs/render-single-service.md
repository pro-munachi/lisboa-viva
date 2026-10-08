# One Render service for the client and server

The [single-service Dockerfile](../deploy/Dockerfile.single) runs Next.js and Go in one container. Render exposes Next.js on port 10000. Go listens only on `127.0.0.1:18080` (or `18081` when the public port is `18080`), and Next.js forwards its `/api/` routes to Go. PostgreSQL is still a separate database; it can be your existing staging database or a Render database.

## Deploy with the Blueprint

1. Push `main` with these files to GitHub.
2. In Render, choose **New → Blueprint**, select `pro-munachi/lisboa-viva`, and set the Blueprint path to `deploy/render.single.yaml`.
3. Review the new `lisboa-viva-single` web service. Provide its `DATABASE_URL` through Render's secret prompt using the database's connection string. Do not commit this value.
4. Apply the Blueprint. Open the service's generated `https://...onrender.com` URL after the health check passes.

The Blueprint follows `main`, so subsequent pushes deploy the client and server together as one image. The Go process applies SQL migrations when it starts. `COOKIE_SECURE=true` requires HTTPS, which Render provides at its public URL.

## Use an existing Render web service

If you prefer to update an existing web service instead of creating `lisboa-viva-single`, set its repository to `pro-munachi/lisboa-viva` on `main`, leave **Root Directory** blank, select **Docker** runtime, set **Dockerfile Path** to `./deploy/Dockerfile.single`, and set **Docker Build Context Directory** to `.`. Add `DATABASE_URL`, `COOKIE_SECURE=true`, and `PORT=10000` under **Environment**, then deploy the latest commit. Set its health check path to `/`.

Do not set the service root to `apps/web`: the combined Docker build needs access to `apps/web`, `services/game`, and `db` from the repository root.
