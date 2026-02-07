// FILE: app/api/sales/[id]/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../../lib/prisma"

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

export async function PATCH(req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    let body = null
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    try {
        const existing = await prisma.sale.findFirst({ where: { id, userId: u.id } })
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

        // Only allow updating the notes field (which contains sale status)
        const updateData = {}

        if (body.notes !== undefined) {
            updateData.notes = body.notes === null ? null : String(body.notes)
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
        }

        const updated = await prisma.sale.update({
            where: { id },
            data: updateData,
        })

        return NextResponse.json(updated)
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Update failed" }, { status: 500 })
    }
}