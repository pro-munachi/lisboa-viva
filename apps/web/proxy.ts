import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/play") &&
    !request.cookies.has("lv_session")
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/play/:path*"],
};
