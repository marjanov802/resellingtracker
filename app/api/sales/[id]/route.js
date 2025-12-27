// FILE: app/api/sales/[id]/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(_req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    try {
        const existing = await prisma.sale.findFirst({ where: { id, userId: u.id } })
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

        await prisma.sale.delete({ where: { id } })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 })
    }
}
