import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { loginUrl } from "@/lib/safe-redirect";

// A fast first check for pages that need sign-in: no session cookie means a
// redirect to /login before anything renders. It does not prove the cookie
// is valid; each page still calls requireUser(), which checks the database.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const { pathname, search } = request.nextUrl;
    return NextResponse.redirect(
      new URL(loginUrl(pathname + search), request.url),
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/settings/:path*", "/play/:path*"],
};
