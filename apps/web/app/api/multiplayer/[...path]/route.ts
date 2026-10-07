import { forwardBackend } from "../../../../lib/backend";

async function forward(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const query = new URL(request.url).search;
  return forwardBackend(request, `/v1/multiplayer/${path.join("/")}${query}`);
}

export const GET = forward;
export const PUT = forward;
export const DELETE = forward;
