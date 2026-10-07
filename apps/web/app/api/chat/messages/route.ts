import { forwardBackend } from "../../../../lib/backend";

export function GET(request: Request) {
  const query = new URL(request.url).search;
  return forwardBackend(request, `/v1/chat/messages${query}`);
}

export function POST(request: Request) {
  return forwardBackend(request, "/v1/chat/messages");
}
