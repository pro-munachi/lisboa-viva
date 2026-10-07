const backendURL = process.env.API_INTERNAL_URL || "http://127.0.0.1:8080";

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
        return Response.json({ error: "forbidden" }, { status: 403 });
      }
    }
  }
  const headers = new Headers({ Accept: "application/json" });
  const cookie = request.headers.get("cookie");
  const contentType = request.headers.get("content-type");
  if (cookie) headers.set("cookie", cookie);
  if (contentType) headers.set("content-type", contentType);

  try {
    const upstream = await fetch(`${backendURL}${path}`, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
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
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
