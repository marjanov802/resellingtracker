import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../lib/prisma"

export async function GET() {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const userId = u.id

    const items = await prisma.item.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(items)
}

export async function POST(req) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const userId = u.id
    const body = await req.json()

    const name = String(body?.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

    const sku = body?.sku ? String(body.sku).trim() : null
    const quantity = Number.isFinite(body?.quantity) ? Math.max(0, Math.trunc(Number(body.quantity))) : 0
    const costPence = Number.isFinite(body?.costPence) ? Math.max(0, Math.trunc(Number(body.costPence))) : 0
    const notes = body?.notes ? String(body.notes) : null

    const created = await prisma.item.create({
        data: { userId, name, sku, quantity, costPence, notes },
    })

    return NextResponse.json(created, { status: 201 })
}