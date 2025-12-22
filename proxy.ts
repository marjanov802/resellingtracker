import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isPublicRoute = createRouteMatcher([
    "/",
    "/login(.*)",
    "/signup(.*)",
    "/api/webhook(.*)",
    "/api/public(.*)",
])

export default clerkMiddleware(
    async (auth, req) => {
        if (!isPublicRoute(req)) {
            await auth.protect()
        }
    },
    {
        debug: false,
    }
)

export const config = {
    matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}