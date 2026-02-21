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

const getMeta = (html, key) => {
    const re = new RegExp(
        `<meta[^>]+(?:property|name|itemprop)=["']${escapeReg(key)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
        "i"
    )
    const m = html.match(re)
    if (m) return decodeHtml(m[1]).trim()

    const re2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${escapeReg(key)}["'][^>]*>`,
        "i"
    )
    const m2 = html.match(re2)
    return m2 ? decodeHtml(m2[1]).trim() : ""
}

const escapeReg = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const pickFirst = (...vals) => {
    for (const v of vals) {
        const s = String(v || "").trim()
        if (s) return s
    }
    return ""
}

// ---- Vinted specialised parsing ----

const extractVinted = (html) => {
    let title = ""
    let pricePence = null
    let currency = "GBP"
    let imageUrl = ""
    let size = ""
    let condition = ""
    let category = ""

    // Try to find the JSON data embedded in the page
    // Vinted often embeds item data in a script tag
    const jsonMatch = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/) ||
        html.match(/"itemDto"\s*:\s*(\{[^}]+(?:\{[^}]*\}[^}]*)*\})/)

    // Title - multiple patterns
    const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)</) ||
        html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</) ||
        html.match(/"title"\s*:\s*"([^"]+)"/) ||
        html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
        html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i)
    if (titleMatch) {
        title = decodeHtml(titleMatch[1]).trim()
        // Clean up Vinted titles that include "| Vinted" at the end
        title = title.replace(/\s*\|\s*Vinted.*$/i, "").trim()
    }

    // Price - multiple patterns
    const priceMatch = html.match(/"price_numeric"\s*:\s*([\d.]+)/) ||
        html.match(/"price"\s*:\s*\{[^}]*"amount"\s*:\s*"?([\d.]+)"?/) ||
        html.match(/"total_item_price"\s*:\s*\{[^}]*"amount"\s*:\s*"?([\d.]+)"?/) ||
        html.match(/itemprop="price"[^>]*content="([\d.]+)"/) ||
        html.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>[£$€]?\s*([\d,.]+)/) ||
        html.match(/"price"\s*:\s*"?([\d.]+)"?/)
    if (priceMatch) {
        const n = asNumber(priceMatch[1])
        if (n != null) pricePence = priceToPence(n)
    }

    // Size - Vinted specific patterns
    const sizeMatch = html.match(/"size_title"\s*:\s*"([^"]+)"/) ||
        html.match(/"size"\s*:\s*"([^"]+)"/) ||
        html.match(/"size"\s*:\s*\{[^}]*"title"\s*:\s*"([^"]+)"/) ||
        html.match(/itemprop="size"[^>]*>([^<]+)</) ||
        html.match(/<span[^>]*class="[^"]*size[^"]*"[^>]*>([^<]+)</) ||
        html.match(/"details"[\s\S]*?"Size"[\s\S]*?"value"\s*:\s*"([^"]+)"/)
    if (sizeMatch) {
        size = decodeHtml(sizeMatch[1]).trim()
    }

    // Condition/Status - Vinted uses "status" for condition
    const conditionMatch = html.match(/"status"\s*:\s*"([^"]+)"/) ||
        html.match(/"condition"\s*:\s*"([^"]+)"/) ||
        html.match(/"item_status"\s*:\s*"([^"]+)"/) ||
        html.match(/itemprop="itemCondition"[^>]*>([^<]+)</) ||
        html.match(/<span[^>]*class="[^"]*condition[^"]*"[^>]*>([^<]+)</) ||
        html.match(/"details"[\s\S]*?"Condition"[\s\S]*?"value"\s*:\s*"([^"]+)"/)
    if (conditionMatch) {
        condition = decodeHtml(conditionMatch[1]).trim()
        // Map Vinted conditions to your app's conditions
        condition = mapVintedCondition(condition)
    }

    // Category - try to detect if it's clothing or shoes
    const categoryMatch = html.match(/"catalog_title"\s*:\s*"([^"]+)"/) ||
        html.match(/"category"\s*:\s*"([^"]+)"/) ||
        html.match(/"catalog"\s*:\s*\{[^}]*"title"\s*:\s*"([^"]+)"/)
    if (categoryMatch) {
        const cat = decodeHtml(categoryMatch[1]).toLowerCase()
        if (cat.includes("shoe") || cat.includes("trainer") || cat.includes("boot") || cat.includes("sneaker")) {
            category = "Shoes"
        } else if (cat.includes("cloth") || cat.includes("shirt") || cat.includes("dress") || cat.includes("jacket") || cat.includes("jean") || cat.includes("trouser") || cat.includes("hoodie") || cat.includes("jumper") || cat.includes("coat")) {
            category = "Clothes"
        } else if (cat.includes("bag") || cat.includes("handbag")) {
            category = "Bags"
        } else if (cat.includes("watch")) {
            category = "Watches"
        } else if (cat.includes("jewel") || cat.includes("necklace") || cat.includes("ring") || cat.includes("bracelet")) {
            category = "Jewellery"
        }
    }

    // Image - multiple patterns
    const photoMatch = html.match(/"photos"\s*:\s*\[\s*\{[^}]*"full_size_url"\s*:\s*"([^"]+)"/) ||
        html.match(/"full_size_url"\s*:\s*"([^"]+)"/) ||
        html.match(/"url"\s*:\s*"(https:\/\/[^"]*vinted[^"]*\/photos\/[^"]+)"/) ||
        html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
        html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i)
    if (photoMatch) imageUrl = photoMatch[1]

    return {
        title: clampLen(title, 160),
        pricePence,
        currency,
        imageUrl: decodeHtml(imageUrl),
        size,
        condition,
        category,
    }
}

// Map Vinted condition strings to your app's condition values
const mapVintedCondition = (vintedCondition) => {
    const c = String(vintedCondition || "").toLowerCase()
    if (c.includes("new with tag") || c.includes("brand new") || c === "new_with_tags") return "New (with tags)"
    if (c.includes("new") || c === "new_without_tags") return "New"
    if (c.includes("very good") || c === "very_good") return "Like new"
    if (c.includes("good") || c === "good") return "Good"
    if (c.includes("satisfactory") || c.includes("fair") || c === "satisfactory") return "Fair"
    if (c.includes("poor") || c.includes("worn")) return "Poor"
    return vintedCondition // Return original if no match
}

// ---- eBay specialised parsing ----

const extractEbay = (html) => {
    let title = ""
    let pricePence = null
    let currency = "GBP"
    let imageUrl = ""
    let condition = ""
    let size = ""

    // Title
    const titleMatch = html.match(/<h1[^>]*class="[^"]*x-item-title__mainTitle[^"]*"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
        html.match(/<title>\s*([^<]+)\s*<\/title>/i)
    if (titleMatch) {
        title = decodeHtml(titleMatch[1]).trim()
        title = title.replace(/\s*\|\s*eBay.*$/i, "").trim()
    }

    // Price
    const priceMatch = html.match(/<div[^>]*class="[^"]*x-price-primary[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<meta\s+property="og:price:amount"\s+content="([^"]+)"/i) ||
        html.match(/"price"\s*:\s*"([^"]+)"/i)
    if (priceMatch) {
        const n = asNumber(priceMatch[1])
        if (n != null) pricePence = priceToPence(n)
    }

    // Currency
    const currMatch = html.match(/<meta\s+property="og:price:currency"\s+content="([^"]+)"/i) ||
        html.match(/"priceCurrency"\s*:\s*"([^"]+)"/i)
    if (currMatch) currency = currMatch[1]

    // Condition
    const condMatch = html.match(/<span[^>]*class="[^"]*ux-icon-text[^"]*"[^>]*>([^<]*(?:New|Used|Pre-owned|Refurbished|Open box)[^<]*)<\/span>/i) ||
        html.match(/"conditionDisplayName"\s*:\s*"([^"]+)"/) ||
        html.match(/<div[^>]*class="[^"]*x-item-condition[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i)
    if (condMatch) {
        condition = mapEbayCondition(decodeHtml(condMatch[1]).trim())
    }

    // Size - eBay puts this in item specifics
    const sizeMatch = html.match(/(?:Size|UK Size|US Size|EU Size)[^:]*:\s*<[^>]*>([^<]+)</) ||
        html.match(/"Size"\s*:\s*\[\s*"([^"]+)"/) ||
        html.match(/"Size"\s*:\s*"([^"]+)"/)
    if (sizeMatch) {
        size = decodeHtml(sizeMatch[1]).trim()
    }

    // Image
    const imgMatch = html.match(/"image"\s*:\s*\[\s*"([^"]+)"/) ||
        html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
        html.match(/data-zoom-src="([^"]+)"/)
    if (imgMatch) {
        imageUrl = imgMatch[1]
        if (imageUrl.includes("s-l64") || imageUrl.includes("s-l140") || imageUrl.includes("s-l300") || imageUrl.includes("s-l500")) {
            imageUrl = imageUrl.replace(/s-l\d+/, "s-l1600")
        }
    }

    return {
        title: clampLen(title, 160),
        pricePence,
        currency: upperCurrency(currency),
        imageUrl: decodeHtml(imageUrl),
        size,
        condition,
        category: "",
    }
}

const mapEbayCondition = (ebayCondition) => {
    const c = String(ebayCondition || "").toLowerCase()
    if (c.includes("new with tag")) return "New (with tags)"
    if (c.includes("new")) return "New"
    if (c.includes("like new") || c.includes("excellent")) return "Like new"
    if (c.includes("very good") || c.includes("pre-owned")) return "Good"
    if (c.includes("good")) return "Good"
    if (c.includes("acceptable") || c.includes("fair")) return "Fair"
    if (c.includes("for parts") || c.includes("poor")) return "Poor"
    return ebayCondition
}

// ---- Depop specialised parsing ----

const extractDepop = (html) => {
    let title = ""
    let pricePence = null
    let currency = "GBP"
    let imageUrl = ""
    let size = ""
    let condition = ""

    // Title
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    if (titleMatch) {
        title = decodeHtml(titleMatch[1]).trim()
        title = title.replace(/\s*-\s*Depop.*$/i, "").trim()
    }

    // Price
    const priceMatch = html.match(/"price"\s*:\s*\{[^}]*"priceAmount"\s*:\s*"?([\d.]+)"?/) ||
        html.match(/"priceAmount"\s*:\s*"?([\d.]+)"?/)
    if (priceMatch) {
        const n = asNumber(priceMatch[1])
        if (n != null) pricePence = priceToPence(n)
    }

    // Currency
    const currMatch = html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)
    if (currMatch) currency = currMatch[1]

    // Size
    const sizeMatch = html.match(/"size"\s*:\s*"([^"]+)"/) ||
        html.match(/"productSize"\s*:\s*"([^"]+)"/)
    if (sizeMatch) size = decodeHtml(sizeMatch[1]).trim()

    // Condition
    const condMatch = html.match(/"condition"\s*:\s*"([^"]+)"/) ||
        html.match(/"itemCondition"\s*:\s*"([^"]+)"/)
    if (condMatch) condition = mapDepopCondition(decodeHtml(condMatch[1]).trim())

    // Image
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
        html.match(/"image"\s*:\s*"([^"]+)"/)
    if (imageMatch) imageUrl = imageMatch[1]

    return {
        title: clampLen(title, 160),
        pricePence,
        currency: upperCurrency(currency),
        imageUrl: decodeHtml(imageUrl),
        size,
        condition,
        category: "",
    }
}

const mapDepopCondition = (depopCondition) => {
    const c = String(depopCondition || "").toLowerCase()
    if (c.includes("brand new") || c.includes("bnwt")) return "New (with tags)"
    if (c.includes("new")) return "New"
    if (c.includes("like new") || c.includes("excellent")) return "Like new"
    if (c.includes("good") || c.includes("used")) return "Good"
    if (c.includes("fair") || c.includes("worn")) return "Fair"
    return depopCondition
}

// ---- Grailed parsing ----

const extractGrailed = (html) => {
    let title = ""
    let pricePence = null
    let currency = "USD"
    let imageUrl = ""
    let size = ""
    let condition = ""

    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    if (titleMatch) title = decodeHtml(titleMatch[1]).trim()

    const priceMatch = html.match(/"price"\s*:\s*([\d.]+)/) ||
        html.match(/"soldPrice"\s*:\s*([\d.]+)/)
    if (priceMatch) {
        const n = asNumber(priceMatch[1])
        if (n != null) pricePence = priceToPence(n)
    }

    const sizeMatch = html.match(/"size"\s*:\s*"([^"]+)"/)
    if (sizeMatch) size = decodeHtml(sizeMatch[1]).trim()

    const condMatch = html.match(/"condition"\s*:\s*"([^"]+)"/)
    if (condMatch) condition = decodeHtml(condMatch[1]).trim()

    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
    if (imageMatch) imageUrl = imageMatch[1]

    return {
        title: clampLen(title, 160),
        pricePence,
        currency,
        imageUrl: decodeHtml(imageUrl),
        size,
        condition,
        category: "Clothes",
    }
}

// ---- Helper to normalize image URL ----

const normalizeImageUrl = (imageUrl, baseUrl) => {
    if (!imageUrl) return ""

    let url = decodeHtml(imageUrl.trim())

    if (url.startsWith("//")) {
        url = "https:" + url
    }

    if (url.startsWith("/") && !url.startsWith("//")) {
        try {
            const base = new URL(baseUrl)
            url = base.origin + url
        } catch {
            // ignore
        }
    }

    return url
}

// ---- Fallback OpenGraph parsing ----

const extractFromOpenGraph = (html) => {
    const title = pickFirst(
        getMeta(html, "og:title"),
        getMeta(html, "twitter:title"),
        getMeta(html, "title")
    )

    const currency = pickFirst(
        getMeta(html, "og:price:currency"),
        getMeta(html, "product:price:currency")
    )

    const priceStr = pickFirst(
        getMeta(html, "og:price:amount"),
        getMeta(html, "product:price:amount"),
        getMeta(html, "product:price")
    )

    const imageUrl = pickFirst(
        getMeta(html, "og:image"),
        getMeta(html, "twitter:image")
    )

    const price = asNumber(priceStr)

    return {
        title: clampLen(decodeHtml(title).trim(), 160),
        pricePence: priceToPence(price),
        currency: upperCurrency(currency || "GBP"),
        imageUrl: imageUrl,
        size: "",
        condition: "",
        category: "",
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

    if (url.protocol !== "https:") {
        return NextResponse.json({ ok: false, error: "Only https links supported" }, { status: 400 })
    }

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

        let parsed = null

        // Platform-specific parsers
        if (platform === "EBAY") parsed = extractEbay(html)
        else if (platform === "VINTED") parsed = extractVinted(html)
        else if (platform === "DEPOP") parsed = extractDepop(html)
        else if (platform === "GRAILED") parsed = extractGrailed(html)

        // Fallback to OpenGraph
        if (!parsed || (!parsed.title && !parsed.pricePence)) {
            parsed = extractFromOpenGraph(html)
        }

        const imageUrl = normalizeImageUrl(parsed?.imageUrl || "", url.toString())

        const data = {
            title: parsed?.title || "",
            pricePence: parsed?.pricePence == null ? null : Number(parsed.pricePence),
            currency: upperCurrency(parsed?.currency || "GBP"),
            imageUrl: imageUrl,
            size: parsed?.size || "",
            condition: parsed?.condition || "",
            category: parsed?.category || "",
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