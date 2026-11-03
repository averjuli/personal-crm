import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Only a convenience: without the session cookie a page goes straight to the
// sign-in. It does not look into the database. The real check is requireUserId()
// in every page and server action, so a stale cookie gets nothing
export function proxy(request: NextRequest) {
  // A server action answers a missing session itself (requireUserId redirects),
  // a redirect here would break the action request
  if (request.headers.has("next-action")) {
    return NextResponse.next();
  }
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the sign-in pages, the auth API, /health and static files
  matcher: ["/((?!login(?:/|$)|api/auth(?:/|$)|health$|_next/|icon\\.svg$).*)"],
};
