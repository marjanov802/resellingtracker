import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

export async function PATCH(req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const userId = u.id
    const { id } = await ctx.params
    const body = await req.json()

    const existing = await prisma.item.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const data = {}
    if (typeof body.name === "string") data.name = body.name.trim()
    if (body.sku === null || typeof body.sku === "string") data.sku = body.sku
    if (Number.isFinite(body.quantity)) data.quantity = Math.max(0, Math.trunc(Number(body.quantity)))
    if (Number.isFinite(body.costPence)) data.costPence = Math.max(0, Math.trunc(Number(body.costPence)))
    if (body.notes === null || typeof body.notes === "string") data.notes = body.notes

    const updated = await prisma.item.update({ where: { id }, data })
    return NextResponse.json(updated)
}

export async function DELETE(_req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const userId = u.id
    const { id } = await ctx.params

    const existing = await prisma.item.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.item.delete({ where: { id } })
    return NextResponse.json({ ok: true })
} 