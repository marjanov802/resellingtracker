// FILE: app/api/sales/[id]/route.js
import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export const runtime = "nodejs"

export async function DELETE(req, ctx) {
    try {
        // Next 15 (and turbopack) can provide params as a Promise
        const params = await ctx?.params
        const id = params?.id ? String(params.id) : ""

        if (!id) {
            return NextResponse.json({ error: "Missing sale id" }, { status: 400 })
        }

        await prisma.sale.delete({ where: { id } })

        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Failed to delete sale" }, { status: 500 })
    }
}
