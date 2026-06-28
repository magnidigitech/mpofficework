import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define public routes
  const isPublicRoute = pathname === "/login" || pathname.startsWith("/api/auth");

  // Read session cookie (better-auth defaults to "better-auth.session_token")
  const sessionToken = request.cookies.get("better-auth.session_token");

  if (!sessionToken && !isPublicRoute) {
    // Redirect to login if trying to access protected route without session
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionToken && pathname === "/login") {
    // Redirect to home dashboard if already logged in
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifests, worker files, images
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons/|logo.png).*)",
  ],
};
