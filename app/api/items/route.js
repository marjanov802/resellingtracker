// FILE: app/api/items/route.js
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

export async function GET() {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const items = await prisma.item.findMany({
        where: { userId: u.id },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json(items)
}

export async function POST(req) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const name = safeStr(body.name)
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

    const sku = body.sku == null ? null : safeStr(body.sku) || null
    const quantity = int0(body.quantity)

    // ✅ map costPence -> purchaseSubtotalPence
    const purchaseSubtotalPence = int0(body.costPence)

    const notes = body.notes == null ? null : String(body.notes)

    try {
        const created = await prisma.item.create({
            data: {
                userId: u.id,
                name,
                sku,
                quantity,
                purchaseSubtotalPence,
                notes,
            },
        })
        return NextResponse.json(created)
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Create failed" }, { status: 500 })
    }
}
