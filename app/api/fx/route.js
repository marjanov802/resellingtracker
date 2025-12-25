// FILE: app/api/fx/route.js
import { NextResponse } from "next/server"

let cache = {
    ts: 0,
    base: "USD",
    rates: null,
    nextUpdateUtc: null,
}

const CACHE_MS = 12 * 60 * 60 * 1000 // 12h (open endpoint updates daily)

export async function GET(req) {
    const url = new URL(req.url)
    const base = (url.searchParams.get("base") || "USD").toUpperCase()

    // We fetch USD once and do cross conversions client-side
    if (base !== "USD") {
        return NextResponse.json({ error: "Only base=USD supported" }, { status: 400 })
    }

    const now = Date.now()
    if (cache.rates && now - cache.ts < CACHE_MS) {
        return NextResponse.json({
            ok: true,
            base: cache.base,
            rates: cache.rates,
            cached: true,
            nextUpdateUtc: cache.nextUpdateUtc,
            attributionHtml:
                '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>',
        })
    }

    try {
        const r = await fetch("https://open.er-api.com/v6/latest/USD", {
            cache: "no-store",
        })
        const data = await r.json()

        if (!r.ok || data?.result !== "success" || !data?.rates) {
            return NextResponse.json(
                { error: "FX provider error", details: data },
                { status: 502 }
            )
        }

        cache = {
            ts: now,
            base: "USD",
            rates: data.rates,
            nextUpdateUtc: data.time_next_update_utc || null,
        }

        return NextResponse.json({
            ok: true,
            base: cache.base,
            rates: cache.rates,
            cached: false,
            nextUpdateUtc: cache.nextUpdateUtc,
            attributionHtml:
                '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>',
        })
    } catch (e) {
        return NextResponse.json(
            { error: "FX fetch failed", message: e?.message || String(e) },
            { status: 502 }
        )
    }
}
