// FILE: app/api/sales/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SETS = {
    Currency: new Set(["GBP", "USD", "EUR", "CAD", "AUD", "JPY"]),
    SellingPlatform: new Set(["NONE", "EBAY", "VINTED", "DEPOP", "STOCKX", "GOAT", "GRAILED", "FACEBOOK", "ETSY", "OTHER"]),
}

const int0 = (v, d = null) => {
    if (v === null || v === undefined || v === "") return d
    const n = Number(v)
    if (!Number.isFinite(n)) return d
    return Math.max(0, Math.trunc(n))
}

const str0 = (v, d = null) => {
    if (v === null || v === undefined) return d
    const s = String(v).trim()
    return s ? s : d
}

export async function GET() {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    try {
        const sales = await prisma.sale.findMany({
            where: { userId: u.id },
            orderBy: { soldAt: "desc" },
        })
        return NextResponse.json(sales)
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Failed to load sales" }, { status: 500 })
    }
}

export async function POST(req) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    let body = null
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const itemId = str0(body?.itemId)
    if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 })

    const platform = String(body?.platform || "OTHER").toUpperCase()
    if (!SETS.SellingPlatform.has(platform)) return NextResponse.json({ error: "Invalid platform" }, { status: 400 })

    const currency = String(body?.currency || "GBP").toUpperCase()
    if (!SETS.Currency.has(currency)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 })

    const quantitySold = int0(body?.quantitySold, null)
    if (!quantitySold || quantitySold <= 0) return NextResponse.json({ error: "quantitySold must be at least 1" }, { status: 400 })

    const salePricePerUnitPence = int0(body?.salePricePerUnitPence, null)
    if (!salePricePerUnitPence || salePricePerUnitPence <= 0)
        return NextResponse.json({ error: "salePricePerUnitPence must be > 0" }, { status: 400 })

    const feesPence = int0(body?.feesPence, 0) ?? 0

    const soldAtRaw = body?.soldAt
    const soldAt = soldAtRaw ? new Date(soldAtRaw) : new Date()
    if (Number.isNaN(soldAt.getTime())) return NextResponse.json({ error: "Invalid soldAt" }, { status: 400 })

    const itemName = str0(body?.itemName)
    const sku = str0(body?.sku)
    const notes = body?.notes === null || body?.notes === undefined ? null : String(body.notes)

    try {
        const item = await prisma.item.findFirst({
            where: { id: itemId, userId: u.id },
        })
        if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

        const available = Number(item.quantity || 0) || 0
        if (available <= 0) return NextResponse.json({ error: "Cannot record a sale: inventory quantity is 0" }, { status: 400 })
        if (quantitySold > available) return NextResponse.json({ error: "Quantity sold exceeds inventory quantity" }, { status: 400 })

        const purchasePerUnitPence =
            (Number(item.purchaseSubtotalPence || 0) || 0) +
            (Number(item.purchaseFeesPence || 0) || 0) +
            (Number(item.purchaseShippingPence || 0) || 0)

        const grossPence = quantitySold * salePricePerUnitPence
        const netPence =
            body?.netPence !== undefined && body?.netPence !== null
                ? Math.max(0, int0(body.netPence, 0) || 0)
                : Math.max(0, grossPence - (Number(feesPence) || 0))

        const costPerUnitPence = Math.max(0, Math.trunc(Number(body?.costPerUnitPence ?? purchasePerUnitPence) || 0))
        const costTotalPence = Math.max(0, Math.trunc(Number(body?.costTotalPence ?? costPerUnitPence * quantitySold) || 0))

        const created = await prisma.sale.create({
            data: {
                userId: u.id,
                itemId: item.id,
                itemName: itemName ?? item.name ?? "",
                sku: sku ?? item.sku ?? null,
                platform,
                currency,
                soldAt,
                quantitySold,
                salePricePerUnitPence,
                feesPence,
                netPence,
                costPerUnitPence,
                costTotalPence,
                notes,
            },
        })

        return NextResponse.json(created, { status: 201 })
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Failed to create sale" }, { status: 500 })
    }
}
