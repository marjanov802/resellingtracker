// FILE: app/api/items/bulk-delete/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const body = await req.json().catch(() => null)
    const ids = Array.isArray(body?.ids) ? body.ids.map((x) => String(x)) : []
    if (!ids.length) return NextResponse.json({ error: "ids is required" }, { status: 400 })

    try {
        const result = await prisma.item.deleteMany({
            where: { userId: u.id, id: { in: ids } },
        })
        return NextResponse.json({ ok: true, deleted: result.count })
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Bulk delete failed" }, { status: 500 })
    }
}
