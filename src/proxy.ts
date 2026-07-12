import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define public routes that never require authentication
  const isPublicRoute =
    pathname === "/schedule" ||
    pathname === "/api/schedules" ||
    pathname === "/api/settings/public" ||
    pathname === "/telugudesamlogo.png" ||
    pathname === "/magnilogo.webp" ||
    pathname === "/logo.png" ||
    pathname === "/logo.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname === "/offline" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname === "/api/admin/seed" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/workbox-");

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Use Better Auth's server-side session check (reads all auth cookies correctly)
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      // Not authenticated — if visiting root, redirect to schedule view
      if (pathname === "/") {
        const scheduleUrl = new URL("/schedule", request.url);
        return NextResponse.redirect(scheduleUrl);
      }
      // redirect other private routes to login
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Authenticated — allow through
    return NextResponse.next();
  } catch {
    if (pathname === "/") {
      const scheduleUrl = new URL("/schedule", request.url);
      return NextResponse.redirect(scheduleUrl);
    }
    // If session check fails for any reason, redirect to login
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.json, sw.js, workbox, icons (PWA assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons/|logo.png).*)",
  ],
};
