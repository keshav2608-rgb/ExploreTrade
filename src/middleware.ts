/**
 * Route protection (FR-AUTH-03). Private pages redirect to /login; private
 * API routes answer 401 as JSON. The session cookie is verified here; the
 * user id itself is read inside handlers via `auth()`, never from the
 * request.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PAGES = new Set(["/", "/login", "/register", "/privacy"]);
// /api/internal and /api/cron enforce the CRON_SECRET bearer token inside the route.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/register", "/api/cron", "/api/internal", "/api/health"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const loggedIn = !!req.auth?.user?.id;
  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
    if (!loggedIn) return NextResponse.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Please log in to continue." } }, { status: 401 });
    return NextResponse.next();
  }
  if (PUBLIC_PAGES.has(pathname)) {
    // Logged-in users skip the auth pages.
    if (loggedIn && (pathname === "/login" || pathname === "/register")) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }
  if (!loggedIn) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)"],
};
