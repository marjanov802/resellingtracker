// FILE: app/api/items/[id]/route.js
import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "../../../lib/prisma"

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
        if (!SETS.Currency.has(c)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 })
        data.currency = c
    }

    // cost basis (total you paid)
    if (body.purchaseSubtotalPence !== undefined) data.purchaseSubtotalPence = Math.max(0, Math.trunc(Number(body.purchaseSubtotalPence)))
    if (body.purchaseFeesPence !== undefined) data.purchaseFeesPence = Math.max(0, Math.trunc(Number(body.purchaseFeesPence)))
    if (body.purchaseShippingPence !== undefined) data.purchaseShippingPence = Math.max(0, Math.trunc(Number(body.purchaseShippingPence)))

    if (body.status !== undefined) {
        const s = String(body.status).toUpperCase()
        if (!SETS.ItemStatus.has(s)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
        data.status = s
        if (s === "SOLD" && !existing.soldAt) data.soldAt = new Date()
        if (s !== "SOLD") data.soldAt = null
    }

    if (body.platform !== undefined) {
        const p = String(body.platform).toUpperCase()
        if (!SETS.SellingPlatform.has(p)) return NextResponse.json({ error: "Invalid platform" }, { status: 400 })
        data.platform = p
    }

    if (body.listedPricePence !== undefined) data.listedPricePence = maybeInt0(body.listedPricePence)
    if (body.buyerTotalPence !== undefined) data.buyerTotalPence = maybeInt0(body.buyerTotalPence)

    if (body.platformFeePence !== undefined) data.platformFeePence = maybeInt0(body.platformFeePence)
    if (body.paymentProcessingFeePence !== undefined) data.paymentProcessingFeePence = maybeInt0(body.paymentProcessingFeePence)
    if (body.postageChargedToBuyerPence !== undefined) data.postageChargedToBuyerPence = maybeInt0(body.postageChargedToBuyerPence)

    if (body.expectedBestPence !== undefined) data.expectedBestPence = maybeInt0(body.expectedBestPence)
    if (body.expectedWorstPence !== undefined) data.expectedWorstPence = maybeInt0(body.expectedWorstPence)

    if (body.condition !== undefined) {
        const c = String(body.condition).toUpperCase()
        if (!SETS.ItemCondition.has(c)) return NextResponse.json({ error: "Invalid condition" }, { status: 400 })
        data.condition = c
    }

    if (body.category !== undefined) {
        const c = String(body.category).toUpperCase()
        if (!SETS.ItemCategory.has(c)) return NextResponse.json({ error: "Invalid category" }, { status: 400 })
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
