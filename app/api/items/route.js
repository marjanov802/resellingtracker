// FILE: app/api/items/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../lib/prisma"

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

const int0 = (v, def = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def
}

const maybeInt0 = (v) => {
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null
}

export async function GET() {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const items = await prisma.item.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(items)
}

export async function POST(req) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const body = await req.json()

    const name = String(body?.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

    const sku = body?.sku ? String(body.sku).trim() : null
    const quantity = int0(body?.quantity, 1)

    const currency = String(body?.currency ?? "GBP").toUpperCase()
    if (!CURRENCIES.has(currency)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 })

    const purchasePence = int0(body?.purchasePence, 0)
    const expectedBestPence = maybeInt0(body?.expectedBestPence)
    const expectedWorstPence = maybeInt0(body?.expectedWorstPence)

    const condition = String(body?.condition ?? "GOOD").toUpperCase()
    if (!CONDITIONS.has(condition)) return NextResponse.json({ error: "Invalid condition" }, { status: 400 })

    const category = String(body?.category ?? "OTHER").toUpperCase()
    if (!CATEGORIES.has(category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 })

    const notes = body?.notes ? String(body.notes) : null

    const created = await prisma.item.create({
        data: {
            userId: u.id,
            name,
            sku,
            quantity,
            currency,
            purchasePence,
            expectedBestPence,
            expectedWorstPence,
            condition,
            category,
            notes,
        },
    })

    return NextResponse.json(created, { status: 201 })
}
