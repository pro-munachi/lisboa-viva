import { forwardBackend } from "../../../../lib/backend";

async function forward(
  request: Request,
  context: RouteContext<"/api/auth/[...path]">,
) {
  const { path } = await context.params;
  return forwardBackend(request, `/v1/auth/${path.join("/")}`);
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
