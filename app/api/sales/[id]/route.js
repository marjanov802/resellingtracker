// FILE: app/api/sales/[id]/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req, { params }) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const sale = await prisma.sale.findFirst({ where: { id: params.id, userId: u.id } })
    if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json(sale)
}

export async function DELETE(_req, { params }) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const sale = await prisma.sale.findFirst({ where: { id: params.id, userId: u.id } })
    if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.sale.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
}
