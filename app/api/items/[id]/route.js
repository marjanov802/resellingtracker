// FILE: app/api/items/[id]/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const int0 = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.trunc(n))
}

const safeStr = (v) => {
    const s = String(v ?? "").trim()
    return s ? s : ""
}

export async function GET(_req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const { id } = await ctx.params

    const item = await prisma.item.findFirst({
        where: { id, userId: u.id },
    })

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(item)
}

export async function PATCH(req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const { id } = await ctx.params

    const existing = await prisma.item.findFirst({
        where: { id, userId: u.id },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const data = {}

    if (body.name !== undefined) data.name = safeStr(body.name)
    if (body.sku !== undefined) data.sku = body.sku == null ? null : safeStr(body.sku) || null

    if (body.quantity !== undefined) data.quantity = int0(body.quantity)

    // ✅ YOUR DB MODEL USES costPence? NO — it uses purchaseSubtotalPence/purchaseFeesPence/purchaseShippingPence.
    // So map incoming costPence to purchaseSubtotalPence to keep your existing UI working.
    if (body.costPence !== undefined) data.purchaseSubtotalPence = int0(body.costPence)

    if (body.notes !== undefined) data.notes = body.notes == null ? null : String(body.notes)

    try {
        const updated = await prisma.item.update({
            where: { id },
            data,
        })
        return NextResponse.json(updated)
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Update failed" }, { status: 500 })
    }
}

export async function DELETE(_req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const { id } = await ctx.params

    const existing = await prisma.item.findFirst({
        where: { id, userId: u.id },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    try {
        await prisma.item.delete({ where: { id } })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 })
    }
}
