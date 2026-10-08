import { forwardBackend } from "../../../../../lib/backend";

export function GET(request: Request) {
  return forwardBackend(
    request,
    `/v1/chat/direct/conversations${new URL(request.url).search}`,
  );
}
