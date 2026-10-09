import { forwardBackend } from "../../../../lib/backend";

export const GET = (request: Request) =>
  forwardBackend(request, "/v1/player/scenery");
export const POST = (request: Request) =>
  forwardBackend(request, "/v1/player/scenery");
