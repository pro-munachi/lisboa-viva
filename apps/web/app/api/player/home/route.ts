import { forwardBackend } from "../../../../lib/backend";

export const GET = (request: Request) =>
  forwardBackend(request, "/v1/player/home");
export const PATCH = (request: Request) =>
  forwardBackend(request, "/v1/player/home");
