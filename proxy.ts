import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isWebhook = createRouteMatcher(['/api/stripe/webhook(.*)'])

export default clerkMiddleware(async (auth, request) => {
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