import { forwardBackend } from "../../../../../lib/backend";

export function GET(request: Request) {
  return forwardBackend(
    request,
    `/v1/chat/direct/messages${new URL(request.url).search}`,
  );
}

export function POST(request: Request) {
  return forwardBackend(request, "/v1/chat/direct/messages");
}
