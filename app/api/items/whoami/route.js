import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function pickClerkHeaders(h) {
    const keys = [
        "x-clerk-auth-status",
        "x-clerk-auth-reason",
        "x-clerk-auth-message",
        "x-clerk-user-id",
        "x-clerk-session-id",
        "x-clerk-actor",
        "x-clerk-request-id",
    ]
    const out = {}
    for (const k of keys) out[k] = h.get(k) ?? null
    return out
}

function cookieNames(cookieHeader = "") {
    return cookieHeader
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.split("=")[0])
}

export async function GET() {
    const h = await headers()
    const cookie = h.get("cookie") || ""

    const a = auth()

    return NextResponse.json({
        auth: {
            userId: a.userId ?? null,
            sessionId: a.sessionId ?? null,
        },
        clerkHeaders: pickClerkHeaders(h),
        cookies: {
            present: cookie.length > 0,
            length: cookie.length,
            names: cookieNames(cookie),
        },
    })
}

