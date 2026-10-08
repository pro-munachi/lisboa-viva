import { forwardBackend } from "../../../../lib/backend";
async function forward(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  if (
    path.length > 2 ||
    path.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment))
  )
    return Response.json(
      { error: "invalid_activity_path" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  return forwardBackend(
    request,
    `/v1/activities${path.length ? `/${path.join("/")}` : ""}${new URL(request.url).search}`,
  );
}
export const GET = forward;
export const POST = forward;
