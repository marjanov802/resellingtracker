import { NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
    try {
        const a = auth()
        const u = await currentUser()

        return NextResponse.json({
            auth: {
                userId: a.userId ?? null,
                sessionId: a.sessionId ?? null,
            },
            currentUser: u
                ? { id: u.id, firstName: u.firstName, lastName: u.lastName }
                : null,
        })
    } catch (e) {
        return NextResponse.json(
            {
                errorName: e?.name ?? null,
                errorMessage: e?.message ?? String(e),
            },
            { status: 500 }
        )
    }
}