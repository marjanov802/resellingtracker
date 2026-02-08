import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

// Routes that should skip Clerk auth entirely
const isWebhook = createRouteMatcher(['/api/stripe/webhook'])

export default clerkMiddleware(async (auth, request) => {
    // Skip auth for webhook - Stripe needs direct access
    if (isWebhook(request)) {
        return NextResponse.next()
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
}