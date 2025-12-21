// middleware.ts - Modern implementation for Next.js 14+
// Place this in your project root if proxy pattern doesn't work

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

// Define your route matchers
const isProtectedRoute = createRouteMatcher([
    "/program(.*)",
    "/dashboard(.*)",
    "/api/protected(.*)"
])

const isPublicRoute = createRouteMatcher([
    "/",
    "/login(.*)",
    "/signup(.*)",
    "/api/public(.*)"
])

export default clerkMiddleware(async (auth, req) => {
    const { userId, sessionId } = await auth()

    // Handle auth routes - redirect signed-in users
    if (userId && (req.nextUrl.pathname.startsWith("/login") ||
        req.nextUrl.pathname.startsWith("/signup"))) {
        return NextResponse.redirect(new URL("/program", req.url))
    }

    // Protect routes that need authentication
    if (isProtectedRoute(req) && !userId) {
        // Store the attempted URL to redirect back after login
        const signInUrl = new URL("/login", req.url)
        signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname)
        return NextResponse.redirect(signInUrl)
    }

    return NextResponse.next()
}, {
    // Configure public routes that don't need authentication
    publicRoutes: ["/", "/api/webhook", "/api/public(.*)"],
    // Optional: Add debug mode for development
    debug: process.env.NODE_ENV === "development",
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Always run for API routes
        "/(api|trpc)(.*)",
    ],
}