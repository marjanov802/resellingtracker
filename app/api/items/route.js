// FILE: app/api/items/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../lib/prisma"

const SETS = {
    Currency: new Set(["GBP", "USD", "EUR", "CAD", "AUD", "JPY"]),
    ItemCondition: new Set(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]),
    ItemCategory: new Set([
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
    ]),
    ItemStatus: new Set(["UNLISTED", "LISTED", "SOLD"]),
    SellingPlatform: new Set(["NONE", "EBAY", "VINTED", "DEPOP", "STOCKX", "GOAT", "GRAILED", "FACEBOOK", "ETSY", "OTHER"]),
}

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
    if (!SETS.Currency.has(currency)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 })

    const purchaseSubtotalPence = int0(body?.purchaseSubtotalPence, 0)
    const purchaseFeesPence = int0(body?.purchaseFeesPence, 0)
    const purchaseShippingPence = int0(body?.purchaseShippingPence, 0)

    const status = String(body?.status ?? "UNLISTED").toUpperCase()
    if (!SETS.ItemStatus.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })

    const platform = String(body?.platform ?? "NONE").toUpperCase()
    if (!SETS.SellingPlatform.has(platform)) return NextResponse.json({ error: "Invalid platform" }, { status: 400 })

    const listedPricePence = maybeInt0(body?.listedPricePence)
    const buyerTotalPence = maybeInt0(body?.buyerTotalPence)

    const platformFeePence = maybeInt0(body?.platformFeePence)
    const paymentProcessingFeePence = maybeInt0(body?.paymentProcessingFeePence)
    const postageChargedToBuyerPence = maybeInt0(body?.postageChargedToBuyerPence)

    const expectedBestPence = maybeInt0(body?.expectedBestPence)
    const expectedWorstPence = maybeInt0(body?.expectedWorstPence)

    const condition = String(body?.condition ?? "GOOD").toUpperCase()
    if (!SETS.ItemCondition.has(condition)) return NextResponse.json({ error: "Invalid condition" }, { status: 400 })

    const category = String(body?.category ?? "OTHER").toUpperCase()
    if (!SETS.ItemCategory.has(category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 })

    const notes = body?.notes ? String(body.notes) : null

    const created = await prisma.item.create({
        data: {
            userId: u.id,
            name,
            sku,
            quantity,
            currency,

            purchaseSubtotalPence,
            purchaseFeesPence,
            purchaseShippingPence,

            status,
            platform,
            listedPricePence,
            buyerTotalPence,
            platformFeePence,
            paymentProcessingFeePence,
            postageChargedToBuyerPence,

            expectedBestPence,
            expectedWorstPence,
            condition,
            category,
            notes,
        },
    })

    return NextResponse.json(created, { status: 201 })
}
