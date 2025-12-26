import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

export const dynamic = "force-dynamic"

// Prevent Prisma from creating multiple clients in dev
const globalForPrisma = globalThis

const prisma =
    globalForPrisma.__prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    })

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__prisma = prisma
}

const cleanId = (v) => String(v ?? "").trim()

export async function POST(req) {
    try {
        const body = await req.json().catch(() => null)
        const idsRaw = Array.isArray(body?.ids) ? body.ids : []
        const ids = [...new Set(idsRaw.map(cleanId).filter(Boolean))]

        if (ids.length === 0) {
            return NextResponse.json(
                { error: "No ids provided" },
                { status: 400 }
            )
        }

        const result = await prisma.item.deleteMany({
            where: {
                id: { in: ids },
            },
        })

        return NextResponse.json({
            ok: true,
            deleted: result.count,
        })
    } catch (e) {
        return NextResponse.json(
            { error: e?.message || "Bulk delete failed" },
            { status: 500 }
        )
    }
}
