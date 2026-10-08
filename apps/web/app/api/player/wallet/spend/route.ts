import { forwardBackend } from "../../../../../lib/backend";

export const POST = (request: Request) =>
  forwardBackend(request, "/v1/player/wallet/spend");
