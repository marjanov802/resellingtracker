import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isPublicRoute = createRouteMatcher([
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/signup(.*)',
    '/login(.*)',
    '/onboarding(.*)',
    '/pricing(.*)',
    '/success(.*)',
    '/api/stripe/webhook',
])

export default clerkMiddleware(async (auth, request) => {
    // Completely skip middleware for webhook
    if (request.nextUrl.pathname === '/api/stripe/webhook') {
        return NextResponse.next()
    }

    if (isPublicRoute(request)) {
        return NextResponse.next()
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    ],
}