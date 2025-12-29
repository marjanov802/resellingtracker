// app/api/listing-import/route.js
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

const clampLen = (s, max = 2000) => (s.length > max ? s.slice(0, max) : s)

const asNumber = (s) => {
    if (!s) return null
    const n = Number(String(s).replace(/[^\d.]/g, ""))
    return Number.isFinite(n) ? n : null
}

const priceToPence = (n) => {
    if (n == null) return null
    return Math.round(n * 100)
}

const decodeHtml = (s) =>
    String(s || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")

const platformFromUrl = (url) => {
    const u = String(url || "").toLowerCase()
    if (u.includes("ebay.")) return "EBAY"
    if (u.includes("vinted.")) return "VINTED"
    if (u.includes("depop.")) return "DEPOP"
    if (u.includes("stockx.")) return "STOCKX"
    if (u.includes("goat.")) return "GOAT"
    if (u.includes("grailed.")) return "GRAILED"
    if (u.includes("etsy.")) return "ETSY"
    if (u.includes("facebook.com/marketplace") || u.includes("fb.com/marketplace")) return "FACEBOOK"
    return "OTHER"
}

const upperCurrency = (cur) => String(cur || "GBP").trim().toUpperCase() || "GBP"

// ---- Generic metadata parsing (works for many marketplaces) ----

const getMeta = (html, key) => {
    // matches:
    // <meta property="og:title" content="...">
    // <meta name="twitter:title" content="...">
    // <meta itemprop="price" content="...">
    const re = new RegExp(
        `<meta[^>]+(?:property|name|itemprop)=["']${escapeReg(key)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
        "i"
    )
    const m = html.match(re)
    return m ? decodeHtml(m[1]).trim() : ""
}

const escapeReg = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const extractJsonLdBlocks = (html) => {
    const out = []
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m
    while ((m = re.exec(html))) {
        const raw = String(m[1] || "").trim()
        if (!raw) continue
        // Some sites include multiple JSON objects or invalid trailing commas; try best-effort
        try {
            out.push(JSON.parse(raw))
        } catch {
            // try to salvage: strip newlines and attempt to parse first {...} or [...]
            const trimmed = raw.replace(/\u2028|\u2029/g, "")
            try {
                out.push(JSON.parse(trimmed))
            } catch {
                // ignore
            }
        }
    }
    return out
}

const flattenJsonLd = (node) => {
    const acc = []
    const walk = (x) => {
        if (!x) return
        if (Array.isArray(x)) return x.forEach(walk)
        if (typeof x !== "object") return
        acc.push(x)
        if (x["@graph"]) walk(x["@graph"])
        if (x.itemListElement) walk(x.itemListElement)
        if (x.offers) walk(x.offers)
        if (x.mainEntity) walk(x.mainEntity)
        if (x.subjectOf) walk(x.subjectOf)
        if (x.hasPart) walk(x.hasPart)
    }
    walk(node)
    return acc
}

const pickFirst = (...vals) => {
    for (const v of vals) {
        const s = String(v || "").trim()
        if (s) return s
    }
    return ""
}

const parseOffer = (offer) => {
    if (!offer || typeof offer !== "object") return { price: null, currency: "" }

    // offer.price can be number/string; offer.lowPrice etc.
    const price =
        asNumber(offer.price) ??
        asNumber(offer.lowPrice) ??
        asNumber(offer.highPrice) ??
        asNumber(offer.priceSpecification?.price)

    const currency = pickFirst(
        offer.priceCurrency,
        offer.priceSpecification?.priceCurrency,
        offer.currency
    )

    return { price, currency }
}

const extractFromJsonLd = (html) => {
    const blocks = extractJsonLdBlocks(html)
    const nodes = []
    for (const b of blocks) nodes.push(...flattenJsonLd(b))

    // find Product / Offer / AggregateOffer
    let bestTitle = ""
    let bestPrice = null
    let bestCurrency = ""

    for (const n of nodes) {
        const t = String(n["@type"] || "").toLowerCase()
        const isProduct = t === "product" || (Array.isArray(n["@type"]) && n["@type"].map(String).some((x) => String(x).toLowerCase() === "product"))
        if (!isProduct) continue

        const title = pickFirst(n.name, n.headline)
        if (title && !bestTitle) bestTitle = title

        const offers = n.offers
        if (offers) {
            if (Array.isArray(offers)) {
                for (const o of offers) {
                    const { price, currency } = parseOffer(o)
                    if (price != null && bestPrice == null) {
                        bestPrice = price
                        bestCurrency = currency
                        break
                    }
                }
            } else {
                const { price, currency } = parseOffer(offers)
                if (price != null && bestPrice == null) {
                    bestPrice = price
                    bestCurrency = currency
                }
            }
        }
    }

    if (!bestTitle && bestPrice == null) return null

    return {
        title: clampLen(decodeHtml(bestTitle).trim(), 160),
        pricePence: priceToPence(bestPrice),
        currency: upperCurrency(bestCurrency || "GBP"),
    }
}

const extractFromOpenGraph = (html) => {
    const title = pickFirst(
        getMeta(html, "og:title"),
        getMeta(html, "twitter:title"),
        getMeta(html, "title")
    )

    const currency = pickFirst(
        getMeta(html, "og:price:currency"),
        getMeta(html, "product:price:currency"),
        getMeta(html, "twitter:data1") // sometimes "Price"
    )

    const priceStr = pickFirst(
        getMeta(html, "og:price:amount"),
        getMeta(html, "product:price:amount"),
        getMeta(html, "product:price"),
        getMeta(html, "twitter:data2"), // sometimes actual number
        "" // fallback
    )

    const price = asNumber(priceStr)

    if (!title && price == null) return null

    return {
        title: clampLen(decodeHtml(title).trim(), 160),
        pricePence: priceToPence(price),
        currency: upperCurrency(currency || "GBP"),
    }
}

// ---- eBay specialised parsing (keep because it’s reliable) ----

const extractEbay = (html) => {
    const title =
        (html.match(/<h1[^>]*class="[^"]*x-item-title__mainTitle[^"]*"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i) || [])[1] ||
        (html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || [])[1] ||
        (html.match(/<title>\s*([^<]+)\s*<\/title>/i) || [])[1] ||
        ""

    const priceStr =
        (html.match(/<div[^>]*class="[^"]*x-price-primary[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) || [])[1] ||
        (html.match(/<meta\s+property="og:price:amount"\s+content="([^"]+)"/i) || [])[1] ||
        (html.match(/"price"\s*:\s*"([^"]+)"/i) || [])[1] ||
        ""

    const currency =
        (html.match(/<meta\s+property="og:price:currency"\s+content="([^"]+)"/i) || [])[1] ||
        (html.match(/"priceCurrency"\s*:\s*"([^"]+)"/i) || [])[1] ||
        "GBP"

    const n = asNumber(priceStr)

    return {
        title: clampLen(decodeHtml(title).trim(), 160),
        pricePence: priceToPence(n),
        currency: upperCurrency(currency || "GBP"),
    }
}

// ---- Main handler ----

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const raw = searchParams.get("url")

    if (!raw) return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 })

    let url
    try {
        url = new URL(raw)
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 })
    }

    // allow https only
    if (url.protocol !== "https:") {
        return NextResponse.json({ ok: false, error: "Only https links supported" }, { status: 400 })
    }

    // allow-list major domains (you can extend this safely)
    const host = url.hostname.toLowerCase()
    const allowed =
        host.endsWith("ebay.co.uk") ||
        host.endsWith("ebay.com") ||
        host.endsWith("ebay.ie") ||
        host.endsWith("ebay.de") ||
        host.endsWith("ebay.fr") ||
        host.endsWith("ebay.it") ||
        host.endsWith("vinted.co.uk") ||
        host.endsWith("vinted.com") ||
        host.endsWith("vinted.fr") ||
        host.endsWith("vinted.de") ||
        host.endsWith("depop.com") ||
        host.endsWith("stockx.com") ||
        host.endsWith("goat.com") ||
        host.endsWith("grailed.com") ||
        host.endsWith("etsy.com") ||
        host.endsWith("facebook.com")

    if (!allowed) {
        return NextResponse.json({ ok: false, error: "Domain not allowed" }, { status: 400 })
    }

    const platform = platformFromUrl(url.toString())

    try {
        const r = await fetch(url.toString(), {
            method: "GET",
            redirect: "follow",
            headers: {
                "User-Agent": UA,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-GB,en;q=0.9",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
            },
        })

        const html = await r.text()

        if (!r.ok) {
            return NextResponse.json(
                { ok: false, error: "Upstream returned " + r.status, status: r.status, platform },
                { status: 502 }
            )
        }

        // Parsing strategy:
        // 1) platform-specific (eBay)
        // 2) JSON-LD Product/offers (best across Vinted/Depop/StockX/others)
        // 3) OpenGraph price tags (fallback)
        // 4) title-only fallback
        let parsed = null

        if (platform === "EBAY") parsed = extractEbay(html)
        if (!parsed) parsed = extractFromJsonLd(html)
        if (!parsed) parsed = extractFromOpenGraph(html)

        if (!parsed) {
            const t = pickFirst(
                getMeta(html, "og:title"),
                getMeta(html, "twitter:title"),
                (html.match(/<title>\s*([^<]+)\s*<\/title>/i) || [])[1] || ""
            )
            parsed = {
                title: clampLen(decodeHtml(t).trim(), 160),
                pricePence: null,
                currency: "GBP",
            }
        }

        // Normalise: if no currency, default GBP (your UI uses currencyView anyway)
        const data = {
            title: parsed.title || "",
            pricePence: parsed.pricePence == null ? null : Number(parsed.pricePence),
            currency: upperCurrency(parsed.currency || "GBP"),
            platform,
            url: url.toString(),
        }

        return NextResponse.json({ ok: true, data }, { status: 200 })
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: (e && e.message) || "Failed to fetch listing", platform },
            { status: 500 }
        )
    }
}
