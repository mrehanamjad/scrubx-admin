import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Inspect Better Auth session cookie presence (fast Edge check)
  const sessionCookie = getSessionCookie(request);

  // If visiting /login:
  if (pathname === "/login") {
    // Authenticated users are redirected away from login to dashboard,
    // UNLESS arriving with an error query parameter (e.g. ?error=forbidden, ?error=session, ?error=banned)
    // to prevent infinite redirect loops on stale/invalid sessions (BUG-032).
    if (sessionCookie && !request.nextUrl.searchParams.has("error")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // All other dashboard routes require active session authentication
  if (!sessionCookie) {
    // API routes return 401 JSON instead of redirecting to HTML login page (SEC-011)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized. Active session required." },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/products/:path*",
    "/categories/:path*",
    "/inventory/:path*",
    "/orders/:path*",
    "/payments/:path*",
    "/customers/:path*",
    "/coupons/:path*",
    "/shipping/:path*",
    "/payment-methods/:path*",
    "/engraving/:path*",
    "/settings/:path*",
    "/staff/:path*",
    "/api/upload/:path*",
  ],
};
