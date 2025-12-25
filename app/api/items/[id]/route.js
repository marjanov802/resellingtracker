// FILE: app/api/items/[id]/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

const CURRENCIES = new Set(["GBP", "USD", "EUR", "CAD", "AUD", "JPY"])
const CONDITIONS = new Set(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"])
const CATEGORIES = new Set([
    "CLOTHING",
    "SHOES",
    "TECH",
    "COLLECTIBLES",
    "TRADING_CARDS",
    "WATCHES",
    "BAGS",
    "HOME",
    "BOOKS",
    "TOYS",
    "BEAUTY",
    "OTHER",
])

const int0 = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : undefined
}

const maybeInt0 = (v) => {
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null
}

export async function PATCH(req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json()

    const existing = await prisma.item.findFirst({ where: { id, userId: u.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const data = {}

    if (typeof body.name === "string") data.name = body.name.trim()
    if (body.sku === null || typeof body.sku === "string") data.sku = body.sku

    if (body.quantity !== undefined) data.quantity = Math.max(0, Math.trunc(Number(body.quantity)))

    if (body.currency !== undefined) {
        const c = String(body.currency).toUpperCase()
        if (!CURRENCIES.has(c)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 })
        data.currency = c
    }

    if (body.purchasePence !== undefined) data.purchasePence = Math.max(0, Math.trunc(Number(body.purchasePence)))
    if (body.expectedBestPence !== undefined) data.expectedBestPence = maybeInt0(body.expectedBestPence)
    if (body.expectedWorstPence !== undefined) data.expectedWorstPence = maybeInt0(body.expectedWorstPence)

    if (body.condition !== undefined) {
        const c = String(body.condition).toUpperCase()
        if (!CONDITIONS.has(c)) return NextResponse.json({ error: "Invalid condition" }, { status: 400 })
        data.condition = c
    }

    if (body.category !== undefined) {
        const c = String(body.category).toUpperCase()
        if (!CATEGORIES.has(c)) return NextResponse.json({ error: "Invalid category" }, { status: 400 })
        data.category = c
    }

    if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes)

    const updated = await prisma.item.update({ where: { id }, data })
    return NextResponse.json(updated)
}

export async function DELETE(_req, ctx) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const { id } = await ctx.params

    const existing = await prisma.item.findFirst({ where: { id, userId: u.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.item.delete({ where: { id } })
    return NextResponse.json({ ok: true })
}
