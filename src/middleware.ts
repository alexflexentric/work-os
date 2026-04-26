import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/api/auth",
  "/api/public",
  "/api/webhooks",
  "/api/health",
  "/api/setup",
  "/setup",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session =
    req.cookies.get("authjs.session-token") ??
    req.cookies.get("__Secure-authjs.session-token");

  if (pathname === "/") {
    // Redirect authenticated users to /home so the root page never runs for them
    if (session) return NextResponse.redirect(new URL("/home", req.url));
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|icon.*\\.png|offline\\.html).*)",
  ],
};
