const backendURL = process.env.API_INTERNAL_URL || "http://127.0.0.1:8080";
export const MAX_BACKEND_BODY_BYTES = 16 << 10;
const noStore = { "cache-control": "no-store" };

async function boundedBody(request: Request): Promise<ArrayBuffer | Response> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BACKEND_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return Response.json(
          { error: "payload_too_large" },
          { status: 413, headers: noStore },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new ArrayBuffer(bytes);
  const output = new Uint8Array(body);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function forwardBackend(
  request: Request,
  path: string,
): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expectedHost =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {}
      if (!expectedHost || originHost !== expectedHost) {
        return Response.json(
          { error: "forbidden" },
          { status: 403, headers: noStore },
        );
      }
    }
  }
  const headers = new Headers({ Accept: "application/json" });
  const cookie = request.headers.get("cookie");
  const contentType = request.headers.get("content-type");
  if (cookie) headers.set("cookie", cookie);
  if (contentType) headers.set("content-type", contentType);

  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await boundedBody(request);
    if (body instanceof Response) return body;
    const upstream = await fetch(`${backendURL}${path}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers();
    const responseType = upstream.headers.get("content-type");
    const setCookie = upstream.headers.get("set-cookie");
    if (responseType) responseHeaders.set("content-type", responseType);
    if (setCookie) responseHeaders.set("set-cookie", setCookie);
    responseHeaders.set("cache-control", "no-store");
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "service_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
