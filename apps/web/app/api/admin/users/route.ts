import { forwardBackend } from "../../../../lib/backend";

export async function GET(request: Request) {
  return forwardBackend(request, "/v1/admin/users");
}
