import { forwardBackend } from "../../../../../../../lib/backend";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return Response.json(
      { error: "invalid_scenery_action" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  return forwardBackend(
    request,
    `/v1/player/scenery/fines/${encodeURIComponent(id)}/settle`,
  );
}
