// FILE: app/api/sales/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SETS = {
    Currency: new Set(["GBP", "USD", "EUR", "CAD", "AUD", "JPY"]),
    SellingPlatform: new Set(["NONE", "EBAY", "VINTED", "DEPOP", "STOCKX", "GOAT", "GRAILED", "FACEBOOK", "ETSY", "OTHER"]),
    RemoveMode: new Set(["DECREMENT", "DELETE"]),
}

const int0 = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

const maybeStr = (v) => {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s ? s : null
}

const isoOrNow = (v) => {
    try {
        if (!v) return new Date()
        const d = new Date(String(v))
        if (Number.isNaN(d.getTime())) return new Date()
        return d
    } catch {
        return new Date()
    }
}

export async function GET() {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    try {
        const sales = await prisma.sale.findMany({
            where: { userId: u.id },
            orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
        })
        return NextResponse.json(sales)
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Failed to load sales" }, { status: 500 })
    }
}

export async function POST(req) {
    const u = await currentUser()
    if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const itemId = String(body.itemId || "").trim()
    if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 })

    const quantitySold = int0(body.quantitySold)
    if (quantitySold <= 0) return NextResponse.json({ error: "quantitySold must be at least 1" }, { status: 400 })

    const salePricePerUnitPence = int0(body.salePricePerUnitPence)
    if (salePricePerUnitPence <= 0) return NextResponse.json({ error: "salePricePerUnitPence must be at least 1" }, { status: 400 })

    const feesPence = int0(body.feesPence)

    const platform = String(body.platform || "OTHER").toUpperCase()
    if (!SETS.SellingPlatform.has(platform)) return NextResponse.json({ error: "Invalid platform" }, { status: 400 })

    const currency = String(body.currency || "GBP").toUpperCase()
    if (!SETS.Currency.has(currency)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 })

    const soldAt = isoOrNow(body.soldAt)

    const updateInventory = body.updateInventory === undefined ? true : !!body.updateInventory
    const removeMode = String(body.removeMode || "DECREMENT").toUpperCase()
    if (!SETS.RemoveMode.has(removeMode)) return NextResponse.json({ error: "Invalid removeMode" }, { status: 400 })

    const notes = maybeStr(body.notes)

    try {
        const out = await prisma.$transaction(async (tx) => {
            const item = await tx.item.findFirst({ where: { id: itemId, userId: u.id } })
            if (!item) throw new Error("Item not found")

            if (quantitySold > item.quantity) throw new Error("Quantity sold exceeds available inventory quantity")

            const costPerUnitPence = int0(item.purchaseSubtotalPence) + int0(item.purchaseFeesPence) + int0(item.purchaseShippingPence)
            const costTotalPence = costPerUnitPence * quantitySold

            const grossPence = quantitySold * salePricePerUnitPence
            const netPence = Math.max(0, grossPence - feesPence)

            const sale = await tx.sale.create({
                data: {
                    userId: u.id,
                    itemId: item.id,
                    itemName: item.name,
                    sku: item.sku,
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

            if (updateInventory) {
                if (removeMode === "DELETE") {
                    await tx.item.delete({ where: { id: item.id } })
                } else {
                    const remaining = Math.max(0, item.quantity - quantitySold)
                    await tx.item.update({
                        where: { id: item.id },
                        data: { quantity: remaining },
                    })
                }
            }

            return { sale, inventoryUpdated: updateInventory, removeMode }
        })

        return NextResponse.json(out)
    } catch (e) {
        const msg = e?.message || "Failed to create sale"
        const status = msg === "Item not found" ? 404 : msg.includes("exceeds") ? 400 : 500
        return NextResponse.json({ error: msg }, { status })
    }
}
