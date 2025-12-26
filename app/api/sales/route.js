// FILE: app/api/sales/route.js
import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export const runtime = "nodejs"

const toISOorNull = (x) => {
    if (x == null) return null
    const s = String(x).trim()
    if (!s) return null
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
}

const parseJson = async (req) => {
    try {
        return await req.json()
    } catch {
        return null
    }
}

export async function GET() {
    try {
        const sales = await prisma.sale.findMany({
            orderBy: { soldAt: "desc" },
        })
        return NextResponse.json(sales)
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Failed to load sales" }, { status: 500 })
    }
}

export async function POST(req) {
    try {
        const body = (await parseJson(req)) || {}

        const itemId = body.itemId == null ? null : String(body.itemId)
        const itemName = String(body.itemName || "")
        if (!itemName.trim()) return NextResponse.json({ error: "itemName is required" }, { status: 400 })

        const platform = String(body.platform || "OTHER").toUpperCase()
        const currency = String(body.currency || "GBP").toUpperCase()

        const soldAtISO = toISOorNull(body.soldAt) || new Date().toISOString()

        const quantitySold = Number(body.quantitySold || 0) || 0
        const salePricePerUnitPence = Number(body.salePricePerUnitPence || 0) || 0

        if (quantitySold <= 0) return NextResponse.json({ error: "quantitySold must be >= 1" }, { status: 400 })
        if (salePricePerUnitPence <= 0) return NextResponse.json({ error: "salePricePerUnitPence must be > 0" }, { status: 400 })

        const feesPence = Math.max(0, Number(body.feesPence || 0) || 0)
        const netPence =
            body.netPence != null
                ? Math.max(0, Number(body.netPence) || 0)
                : Math.max(0, quantitySold * salePricePerUnitPence - feesPence)

        const costPerUnitPence = body.costPerUnitPence == null ? null : Math.max(0, Number(body.costPerUnitPence) || 0)
        const costTotalPence = body.costTotalPence == null ? null : Math.max(0, Number(body.costTotalPence) || 0)

        const sku = body.sku == null ? null : String(body.sku || "") || null
        const notes = body.notes == null ? null : String(body.notes || "") || null

        const created = await prisma.sale.create({
            data: {
                itemId,
                itemName: itemName.trim(),
                sku,
                platform,
                currency,
                soldAt: new Date(soldAtISO),
                quantitySold,
                salePricePerUnitPence,
                feesPence,
                netPence,
                costPerUnitPence,
                costTotalPence,
                notes,
            },
        })

        return NextResponse.json(created)
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Failed to create sale" }, { status: 500 })
    }
}

/**
 * Bulk delete support:
 * - DELETE /api/sales  { ids: ["...","..."] }
 * - DELETE /api/sales  { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }  (matches soldAt inclusive)
 * - DELETE /api/sales  { ids: [...], from, to } (intersection)
 */
export async function DELETE(req) {
    try {
        const body = (await parseJson(req)) || {}

        const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)).filter(Boolean) : []
        const fromISO = toISOorNull(body.from)
        const toISO = toISOorNull(body.to)

        const where = {}

        if (ids.length > 0) where.id = { in: ids }

        if (fromISO || toISO) {
            where.soldAt = {}
            if (fromISO) where.soldAt.gte = new Date(fromISO)
            if (toISO) where.soldAt.lte = new Date(toISO)
        }

        if (!where.id && !where.soldAt) {
            return NextResponse.json({ error: "Provide ids and/or from/to" }, { status: 400 })
        }

        const result = await prisma.sale.deleteMany({ where })

        return NextResponse.json({ ok: true, deleted: result.count })
    } catch (e) {
        return NextResponse.json({ error: e?.message || "Bulk delete failed" }, { status: 500 })
    }
}
