// app/program/page.js
// :contentReference[oaicite:0]{index=0}
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

/* ========================= Currency + helpers ========================= */

const CURRENCY_META = {
    GBP: { symbol: "£", label: "GBP" },
    USD: { symbol: "$", label: "USD" },
    EUR: { symbol: "€", label: "EUR" },
    CAD: { symbol: "$", label: "CAD" },
    AUD: { symbol: "$", label: "AUD" },
    JPY: { symbol: "¥", label: "JPY" },
}

const fmt = (currency, minorUnits) => {
    const c = CURRENCY_META[(currency || "GBP").toUpperCase()] || CURRENCY_META.GBP
    const n = Number.isFinite(minorUnits) ? minorUnits : 0
    const sign = n < 0 ? "-" : ""
    return `${sign}${c.symbol}${(Math.abs(n) / 100).toFixed(2)}`
}

// rates map is "units per USD"
const convertMinor = (minor, fromCur, toCur, rates) => {
    const m = Number.isFinite(minor) ? minor : 0
    const f = (fromCur || "GBP").toUpperCase()
    const t = (toCur || "GBP").toUpperCase()
    if (f === t) return { value: m, ok: true }
    if (!rates || !rates[f] || !rates[t]) return { value: m, ok: false }

    const amountUSD = m / 100 / rates[f]
    const amountTo = amountUSD * rates[t]
    return { value: Math.round(amountTo * 100), ok: true }
}

const safeStr = (x) => String(x ?? "").trim()

const parseMoneyToPence = (s) => {
    const v = String(s ?? "").replace(/[^\d.]/g, "")
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.round(n * 100))
}

const safeInt = (x, d = 0) => {
    const n = Number(x)
    if (!Number.isFinite(n)) return d
    return Math.max(0, Math.trunc(n))
}

/* ============================ Notes helpers =========================== */

const encodeNotes = (plainNotes, meta) => {
    const payload = {
        v: 4,
        notes: String(plainNotes || "").trim() || "",
        meta: meta && typeof meta === "object" ? meta : {},
    }
    return JSON.stringify(payload)
}

const decodeNotes = (notes) => {
    const s = String(notes ?? "")
    if (!s) return { notes: "", meta: {} }
    try {
        const o = JSON.parse(s)
        if (o && typeof o === "object" && (o.v === 1 || o.v === 2 || o.v === 3 || o.v === 4)) {
            return { notes: String(o.notes || ""), meta: o.meta && typeof o.meta === "object" ? o.meta : {} }
        }
        return { notes: s, meta: {} }
    } catch {
        return { notes: s, meta: {} }
    }
}

function normaliseMeta(meta) {
    const m = meta && typeof meta === "object" ? meta : {}
    const currency = (m.currency || "GBP").toUpperCase()
    const status = (m.status || "UNLISTED").toUpperCase()
    const category = m.category || null
    const condition = m.condition || null

    const purchaseTotalPence = Number(m.purchaseTotalPence) || 0
    const estimatedSalePence = m.estimatedSalePence == null ? null : Number(m.estimatedSalePence)

    const legacyBest = m.expectedBestPence == null ? null : Number(m.expectedBestPence)
    const legacyWorst = m.expectedWorstPence == null ? null : Number(m.expectedWorstPence)

    const estimatedFromLegacy =
        estimatedSalePence != null ? estimatedSalePence : legacyBest != null ? legacyBest : legacyWorst != null ? legacyWorst : null

    const listings = Array.isArray(m.listings)
        ? m.listings
            .map((x) => ({
                platform: (x?.platform || "OTHER").toUpperCase(),
                url: safeStr(x?.url) || "",
                pricePence: x?.pricePence == null ? null : Number(x.pricePence),
            }))
            .filter((x) => x.url || Number.isFinite(x.pricePence))
        : []

    return {
        currency,
        status,
        category,
        condition,
        purchaseTotalPence,
        estimatedSalePence: estimatedFromLegacy,
        listings,
    }
}

// FIX: prefer meta.status first (this is why you had 2 listed but saw 0)
function computeItem(it) {
    const decoded = decodeNotes(it.notes)
    const meta = normaliseMeta(decoded.meta)

    const q = Number(it.quantity) || 0
    const status = (meta.status || it.status || "UNLISTED").toUpperCase()
    const cur = (meta.currency || it.currency || "GBP").toUpperCase()

    const perUnit =
        meta.purchaseTotalPence > 0 ? meta.purchaseTotalPence : Number(it.purchaseSubtotalPence || it.costPence || 0) || 0

    const invValue = perUnit * q

    const firstListing = meta.listings?.[0] || null
    const listedPricePerUnit = firstListing?.pricePence ?? null

    return {
        decodedNotes: decoded.notes,
        meta,
        cur,
        q,
        status,
        perUnit,
        invValue,
        listedPricePerUnit,
    }
}

const STATUSES = [
    ["UNLISTED", "Unlisted"],
    ["LISTED", "Listed"],
    ["SOLD", "Sold"],
]

const PLATFORMS = [
    ["EBAY", "eBay"],
    ["VINTED", "Vinted"],
    ["DEPOP", "Depop"],
    ["STOCKX", "StockX"],
    ["GOAT", "GOAT"],
    ["GRAILED", "Grailed"],
    ["FACEBOOK", "Facebook"],
    ["ETSY", "Etsy"],
    ["OTHER", "Other"],
]

const CATEGORIES = ["Clothes", "Shoes", "Tech", "Collectables", "Cards", "Watches", "Bags", "Jewellery", "Home", "Other"]
const CONDITIONS = ["New", "New (with tags)", "Like new", "Good", "Fair", "Poor"]

/* ============================ Date helpers ============================ */

function startOfLocalDay(d) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}
function endOfLocalDay(d) {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
}
function startOfLocalWeek(d) {
    const x = startOfLocalDay(d)
    const day = x.getDay()
    const diff = day === 0 ? 6 : day - 1
    x.setDate(x.getDate() - diff)
    return x
}
function startOfLocalMonth(d) {
    const x = startOfLocalDay(d)
    x.setDate(1)
    return x
}
function startOfLocalYear(d) {
    const x = startOfLocalDay(d)
    x.setMonth(0, 1)
    return x
}
function getRangeBounds(timeRange) {
    const now = new Date()
    if (timeRange === "today") return { from: startOfLocalDay(now), to: endOfLocalDay(now) }
    if (timeRange === "week") return { from: startOfLocalWeek(now), to: endOfLocalDay(now) }
    if (timeRange === "month") return { from: startOfLocalMonth(now), to: endOfLocalDay(now) }
    return { from: startOfLocalYear(now), to: endOfLocalDay(now) }
}

/* ============================== UI =================================== */

function StatCard({ label, value, sub, className = "", icon }) {
    return (
        <div className={["relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]", className].join(" ")}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-white/60 text-sm font-semibold">{label}</p>
                    <p className="mt-2 text-3xl font-bold text-white">{value}</p>
                    <p className="mt-2 text-white/40 text-sm">{sub}</p>
                </div>
                {icon ? (
                    <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-lg">
                        {icon}
                    </div>
                ) : null}
            </div>
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/5 blur-2xl" />
        </div>
    )
}

function RangePills({ value, onChange }) {
    return (
        <div className="mb-7 flex flex-wrap gap-2">
            {["today", "week", "month", "year"].map((range) => (
                <button
                    key={range}
                    onClick={() => onChange(range)}
                    className={[
                        "px-4 py-2 rounded-2xl text-sm font-semibold transition border",
                        value === range
                            ? "bg-white text-black border-white/10"
                            : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-white/10",
                    ].join(" ")}
                >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
            ))}
        </div>
    )
}

function Modal({ title, onClose, children, footer, maxWidth = "max-w-5xl" }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
            <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
            <div className={["relative w-full rounded-3xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur", maxWidth].join(" ")}>
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="text-lg font-semibold text-white">{title}</div>
                    <button
                        onClick={onClose}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                    >
                        Close
                    </button>
                </div>
                <div>{children}</div>
                {footer ? <div className="mt-5">{footer}</div> : null}
            </div>
        </div>
    )
}

function Field({ label, children, className = "" }) {
    return (
        <div className={["space-y-2", className].join(" ")}>
            <div className="text-xs font-semibold text-zinc-300">{label}</div>
            {children}
        </div>
    )
}

function BarChart({ title, rows, currencyView }) {
    const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.valueMinor || 0)))
    return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</div>
                <div className="text-xs text-white/40">({currencyView})</div>
            </div>

            {rows.length === 0 ? (
                <div className="text-sm text-white/40">No data in this period</div>
            ) : (
                <div className="space-y-3">
                    {rows.map((r) => {
                        const pct = Math.round((Math.min(1, Math.abs(r.valueMinor) / maxAbs) * 100) * 100) / 100
                        const negative = (r.valueMinor || 0) < 0
                        return (
                            <div key={r.label} className="grid grid-cols-[92px_1fr_120px] items-center gap-3">
                                <div className="text-xs font-semibold text-white/80 truncate">{r.label}</div>
                                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                        className={[
                                            "h-full rounded-full",
                                            negative ? "bg-red-400/70" : "bg-emerald-300/80",
                                        ].join(" ")}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <div className={["text-right text-xs font-semibold", negative ? "text-red-200" : "text-emerald-200"].join(" ")}>
                                    {fmt(currencyView, r.valueMinor)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function DonutChart({ title, segments, subtitle }) {
    const total = Math.max(1, segments.reduce((a, s) => a + (s.value || 0), 0))
    let start = 0
    const stops = segments.map((s) => {
        const pct = ((s.value || 0) / total) * 100
        const from = start
        const to = start + pct
        start = to
        return { ...s, from, to }
    })

    const bg = `conic-gradient(${stops
        .map((s) => `${s.colour} ${s.from.toFixed(2)}% ${s.to.toFixed(2)}%`)
        .join(", ")})`

    return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</div>
            </div>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
                <div className="relative h-44 w-44 shrink-0">
                    <div className="absolute inset-0 rounded-full" style={{ background: bg }} />
                    <div className="absolute inset-6 rounded-full bg-zinc-950/80 border border-white/10" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-white">{total}</div>
                            <div className="text-xs text-white/40">{subtitle}</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 space-y-2">
                    {segments.map((s) => (
                        <div key={s.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/40 px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.colour }} />
                                <div className="text-sm font-semibold text-white/85 truncate">{s.label}</div>
                            </div>
                            <div className="text-sm font-semibold text-white">{s.value || 0}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/* =========================== Page component =========================== */

export default function ProgramDashboard() {
    const [timeRange, setTimeRange] = useState("week")

    const [items, setItems] = useState([])
    const [sales, setSales] = useState([])

    const [loadingItems, setLoadingItems] = useState(true)
    const [loadingSales, setLoadingSales] = useState(true)

    const [currencyView, setCurrencyView] = useState(() => {
        if (typeof window === "undefined") return "GBP"
        return localStorage.getItem("rt_currency_view") || "GBP"
    })

    const [fx, setFx] = useState({
        loading: true,
        rates: null,
        nextUpdateUtc: null,
        attributionHtml: null,
        error: null,
    })

    const [toast, setToast] = useState({ type: "", msg: "" })

    const [addItemOpen, setAddItemOpen] = useState(false)
    const [addItemSaving, setAddItemSaving] = useState(false)
    const [addItemForm, setAddItemForm] = useState(() => ({
        title: "",
        sku: "",
        quantity: 1,
        category: "Clothes",
        condition: "Good",
        status: "UNLISTED",
        purchaseTotal: "0.00",
        estimatedSale: "0.00",
        listingPlatform: "EBAY",
        listingUrl: "",
        listingPrice: "0.00",
        listings: [],
        notes: "",
    }))

    const [recordSaleOpen, setRecordSaleOpen] = useState(false)
    const [recordSaleSaving, setRecordSaleSaving] = useState(false)
    const [saleForm, setSaleForm] = useState(() => ({
        itemId: "",
        platform: "EBAY",
        soldAt: new Date().toISOString().slice(0, 16),
        quantitySold: 1,
        salePricePerUnit: "0.00",
        notes: "",
        removeFromInventory: true,
        removeMode: "DECREMENT",
    }))

    const showToast = (type, msg) => {
        setToast({ type, msg })
        window.clearTimeout(showToast._t)
        showToast._t = window.setTimeout(() => setToast({ type: "", msg: "" }), 1800)
    }

    useEffect(() => {
        if (typeof window !== "undefined") localStorage.setItem("rt_currency_view", currencyView)
    }, [currencyView])

    const loadItems = async () => {
        setLoadingItems(true)
        try {
            const res = await fetch("/api/items", { cache: "no-store" })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Failed to load items (${res.status})`)
            setItems(Array.isArray(data) ? data : [])
        } catch (e) {
            setItems([])
            showToast("error", e?.message || "Failed to load items")
        } finally {
            setLoadingItems(false)
        }
    }

    const loadSales = async () => {
        setLoadingSales(true)
        try {
            const res = await fetch("/api/sales", { cache: "no-store" })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Failed to load sales (${res.status})`)
            setSales(Array.isArray(data) ? data : [])
        } catch (e) {
            setSales([])
            showToast("error", e?.message || "Failed to load sales")
        } finally {
            setLoadingSales(false)
        }
    }

    const loadFx = async () => {
        setFx((p) => ({ ...p, loading: true, error: null }))
        try {
            const r = await fetch("/api/fx?base=USD", { cache: "no-store" })
            const d = await r.json().catch(() => null)
            if (!r.ok || !d?.ok || !d?.rates) throw new Error(d?.error || `FX failed (${r.status})`)
            setFx({
                loading: false,
                rates: d.rates,
                nextUpdateUtc: d.nextUpdateUtc || null,
                attributionHtml: d.attributionHtml || null,
                error: null,
            })
        } catch (e) {
            setFx({
                loading: false,
                rates: null,
                nextUpdateUtc: null,
                attributionHtml: null,
                error: e?.message || "FX failed",
            })
        }
    }

    useEffect(() => {
        loadItems()
        loadSales()
        loadFx()
    }, [])

    const { from, to } = useMemo(() => getRangeBounds(timeRange), [timeRange])

    const computedItems = useMemo(() => items.map((it) => ({ it, c: computeItem(it) })), [items])

    const inventoryStats = useMemo(() => {
        let inventoryValue = 0
        let listedCount = 0
        let unlistedCount = 0
        let totalUnits = 0

        for (const { it, c } of computedItems) {
            const q = Number(it.quantity) || 0
            if (q <= 0) continue

            inventoryValue += convertMinor(c.invValue, c.cur, currencyView, fx.rates).value
            totalUnits += q

            if (c.status === "LISTED") listedCount += 1
            if (c.status === "UNLISTED") unlistedCount += 1
        }

        return { inventoryValue, listedCount, unlistedCount, totalUnits }
    }, [computedItems, currencyView, fx.rates])

    const salesInRange = useMemo(() => {
        const fromMs = from.getTime()
        const toMs = to.getTime()
        return sales.filter((s) => {
            const dt = s?.soldAt ? new Date(s.soldAt) : null
            if (!dt || Number.isNaN(dt.getTime())) return false
            const tms = dt.getTime()
            return tms >= fromMs && tms <= toMs
        })
    }, [sales, from, to])

    const salesStats = useMemo(() => {
        let revenue = 0
        let profit = 0
        let soldCount = 0
        let units = 0

        for (const s of salesInRange) {
            const cur = (s.currency || "GBP").toUpperCase()
            const qty = Number(s.quantitySold || 0) || 0
            const fees = Number(s.feesPence || 0) || 0
            const ppu = Number(s.salePricePerUnitPence || 0) || 0

            const grossPence = qty * ppu
            const netPence = s.netPence != null ? Number(s.netPence) || 0 : Math.max(0, grossPence - fees)

            const costTotal =
                s.costTotalPence != null
                    ? Number(s.costTotalPence) || 0
                    : s.costPerUnitPence != null
                        ? (Number(s.costPerUnitPence) || 0) * qty
                        : 0

            const profitPence = netPence - costTotal

            revenue += convertMinor(netPence, cur, currencyView, fx.rates).value
            profit += convertMinor(profitPence, cur, currencyView, fx.rates).value

            soldCount += 1
            units += qty
        }

        const margin = revenue > 0 ? (profit / revenue) * 100 : 0
        const roi = revenue > 0 ? (profit / revenue) * 100 : 0
        return { revenue, profit, soldCount, units, margin, roi: Number.isFinite(roi) ? Math.round(roi * 10) / 10 : 0 }
    }, [salesInRange, currencyView, fx.rates])

    const recentSales = useMemo(() => {
        const sorted = [...sales]
            .map((s) => ({ s, t: s.soldAt ? new Date(s.soldAt).getTime() : 0 }))
            .sort((a, b) => b.t - a.t)
            .slice(0, 6)
            .map(({ s }) => {
                const cur = (s.currency || "GBP").toUpperCase()
                const qty = Number(s.quantitySold || 0) || 0
                const ppu = Number(s.salePricePerUnitPence || 0) || 0
                const fees = Number(s.feesPence || 0) || 0

                const grossPence = qty * ppu
                const netPence = s.netPence != null ? Number(s.netPence) || 0 : Math.max(0, grossPence - fees)

                const costTotal =
                    s.costTotalPence != null
                        ? Number(s.costTotalPence) || 0
                        : s.costPerUnitPence != null
                            ? (Number(s.costPerUnitPence) || 0) * qty
                            : 0

                const profitPence = netPence - costTotal

                const netView = fmt(currencyView, convertMinor(netPence, cur, currencyView, fx.rates).value)
                const profitView = fmt(currencyView, convertMinor(profitPence, cur, currencyView, fx.rates).value)

                const dt = s.soldAt ? new Date(s.soldAt) : null
                const dateLabel = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString() : "—"

                return {
                    id: s.id,
                    item: s.itemName || s.item?.name || "—",
                    platform: String(s.platform || "—").toUpperCase(),
                    netView,
                    profitView,
                    dateLabel,
                }
            })

        return sorted
    }, [sales, currencyView, fx.rates])

    const profitByPlatform = useMemo(() => {
        const map = new Map()
        for (const s of salesInRange) {
            const p = (s.platform || "OTHER").toUpperCase()
            const cur = (s.currency || "GBP").toUpperCase()
            const qty = Number(s.quantitySold || 0) || 0
            const fees = Number(s.feesPence || 0) || 0
            const ppu = Number(s.salePricePerUnitPence || 0) || 0

            const grossPence = qty * ppu
            const netPence = s.netPence != null ? Number(s.netPence) || 0 : Math.max(0, grossPence - fees)

            const costTotal =
                s.costTotalPence != null
                    ? Number(s.costTotalPence) || 0
                    : s.costPerUnitPence != null
                        ? (Number(s.costPerUnitPence) || 0) * qty
                        : 0

            const profitPence = netPence - costTotal
            const v = convertMinor(profitPence, cur, currencyView, fx.rates).value
            map.set(p, (map.get(p) || 0) + v)
        }

        return Array.from(map.entries())
            .map(([label, valueMinor]) => ({ label, valueMinor }))
            .sort((a, b) => Math.abs(b.valueMinor) - Math.abs(a.valueMinor))
            .slice(0, 7)
    }, [salesInRange, currencyView, fx.rates])

    const salesCountByPlatform = useMemo(() => {
        const map = new Map()
        for (const s of salesInRange) {
            const p = (s.platform || "OTHER").toUpperCase()
            map.set(p, (map.get(p) || 0) + 1)
        }
        return Array.from(map.entries())
            .map(([platform, count]) => ({ platform, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
    }, [salesInRange])

    const platformDonutSegments = useMemo(() => {
        const palette = [
            "rgba(16,185,129,0.85)", // emerald
            "rgba(59,130,246,0.85)", // blue
            "rgba(168,85,247,0.85)", // purple
            "rgba(244,63,94,0.85)", // rose
            "rgba(245,158,11,0.85)", // amber
            "rgba(148,163,184,0.85)", // slate
        ]

        const segs = salesCountByPlatform.map((x, i) => ({
            label: x.platform,
            value: x.count,
            colour: palette[i % palette.length],
        }))

        if (segs.length === 0) {
            return [
                { label: "No sales", value: 1, colour: "rgba(148,163,184,0.3)" },
            ]
        }

        return segs
    }, [salesCountByPlatform])

    /* ======================== Quick Actions (modal) ======================== */

    const openAddItem = () => {
        setAddItemForm({
            title: "",
            sku: "",
            quantity: 1,
            category: "Clothes",
            condition: "Good",
            status: "UNLISTED",
            purchaseTotal: "0.00",
            estimatedSale: "0.00",
            listingPlatform: "EBAY",
            listingUrl: "",
            listingPrice: "0.00",
            listings: [],
            notes: "",
        })
        setAddItemOpen(true)
    }

    const openRecordSale = () => {
        const alive = computedItems
            .filter(({ it, c }) => (Number(it.quantity) || 0) > 0 && String(c.status || "").toUpperCase() !== "SOLD")
            .sort((a, b) => String(a.it.name || "").localeCompare(String(b.it.name || "")))

        const firstId = alive[0]?.it?.id ? String(alive[0].it.id) : ""
        setSaleForm({
            itemId: firstId,
            platform: "EBAY",
            soldAt: new Date().toISOString().slice(0, 16),
            quantitySold: 1,
            salePricePerUnit: "0.00",
            notes: "",
            removeFromInventory: true,
            removeMode: "DECREMENT",
        })
        setRecordSaleOpen(true)
    }

    const addItemStatus = String(addItemForm.status || "UNLISTED").toUpperCase()
    const addItemIsListed = addItemStatus === "LISTED" || addItemStatus === "SOLD"

    const addListingToAddItem = () => {
        const url = safeStr(addItemForm.listingUrl)
        const pricePence = parseMoneyToPence(addItemForm.listingPrice)
        if (!url && pricePence <= 0) return showToast("error", "Add a listing link or a listing price")
        const platform = (addItemForm.listingPlatform || "OTHER").toUpperCase()
        const listing = { platform, url, pricePence: pricePence > 0 ? pricePence : null }

        setAddItemForm((p) => ({
            ...p,
            listingUrl: "",
            listingPrice: "0.00",
            listings: Array.isArray(p.listings) ? [...p.listings, listing] : [listing],
        }))
    }

    const removeAddItemListing = (idx) => {
        setAddItemForm((p) => {
            const arr = Array.isArray(p.listings) ? [...p.listings] : []
            arr.splice(idx, 1)
            return { ...p, listings: arr }
        })
    }

    const buildListingsFromForm = ({ status, listingPlatform, listingUrl, listingPrice, listings }) => {
        const st = String(status || "UNLISTED").toUpperCase()
        const isListed = st === "LISTED" || st === "SOLD"

        const primary = {
            platform: (listingPlatform || "OTHER").toUpperCase(),
            url: safeStr(listingUrl) || "",
            pricePence: parseMoneyToPence(listingPrice),
        }

        const extras = Array.isArray(listings)
            ? listings
                .map((x) => ({
                    platform: (x?.platform || "OTHER").toUpperCase(),
                    url: safeStr(x?.url) || "",
                    pricePence: x?.pricePence == null ? null : Number(x.pricePence),
                }))
                .filter((x) => x.url || Number.isFinite(x.pricePence))
            : []

        if (!isListed) return []

        const primaryOk = primary.url || primary.pricePence > 0
        const merged = []

        if (primaryOk) merged.push({ ...primary, pricePence: primary.pricePence > 0 ? primary.pricePence : null })
        for (const e of extras) {
            const dupe = merged.some(
                (m) =>
                    String(m.platform || "").toUpperCase() === String(e.platform || "").toUpperCase() &&
                    String(m.url || "") === String(e.url || "") &&
                    Number(m.pricePence ?? null) === Number(e.pricePence ?? null)
            )
            if (!dupe) merged.push(e)
        }

        return merged
    }

    const submitAddItem = async (e) => {
        e?.preventDefault?.()

        const name = String(addItemForm.title || "").trim()
        if (!name) return showToast("error", "Title is required")

        const status = (addItemForm.status || "UNLISTED").toUpperCase()

        const purchaseTotalPence = parseMoneyToPence(addItemForm.purchaseTotal)
        const estimatedSalePence = parseMoneyToPence(addItemForm.estimatedSale)

        const listings = buildListingsFromForm({
            status,
            listingPlatform: addItemForm.listingPlatform,
            listingUrl: addItemForm.listingUrl,
            listingPrice: addItemForm.listingPrice,
            listings: addItemForm.listings,
        })

        const meta = {
            currency: currencyView,
            status,
            category: addItemForm.category || null,
            condition: addItemForm.condition || null,
            purchaseTotalPence,
            estimatedSalePence,
            listings,
        }

        const payload = {
            name,
            sku: safeStr(addItemForm.sku) || null,
            quantity: safeInt(addItemForm.quantity, 0),
            costPence: purchaseTotalPence,
            notes: encodeNotes(addItemForm.notes, meta),
        }

        setAddItemSaving(true)
        try {
            const res = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Create failed (${res.status})`)
            showToast("ok", "Item created")
            setAddItemOpen(false)
            await loadItems()
        } catch (e2) {
            showToast("error", e2?.message || "Create failed")
        } finally {
            setAddItemSaving(false)
        }
    }

    const inventoryOptions = useMemo(() => {
        const alive = computedItems
            .filter(({ it, c }) => (Number(it.quantity) || 0) > 0 && String(c.status || "").toUpperCase() !== "SOLD")
            .sort((a, b) => String(a.it.name || "").localeCompare(String(b.it.name || "")))

        return alive
    }, [computedItems])

    const selectedSaleItem = useMemo(() => {
        const id = saleForm.itemId
        if (!id) return null
        return items.find((x) => String(x.id) === String(id)) || null
    }, [saleForm.itemId, items])

    const selectedSaleItemComputed = useMemo(() => (selectedSaleItem ? computeItem(selectedSaleItem) : null), [selectedSaleItem])

    const sellQty = Math.max(0, safeInt(saleForm.quantitySold, 0))
    const sellPricePerUnitPence = parseMoneyToPence(saleForm.salePricePerUnit)
    const sellGrossPence = sellQty * sellPricePerUnitPence

    const purchasePerUnitPence = selectedSaleItemComputed ? Number(selectedSaleItemComputed.perUnit) || 0 : 0
    const purchaseTotalForSoldUnitsPence = sellQty * purchasePerUnitPence

    const submitRecordSale = async (e) => {
        e?.preventDefault?.()

        if (!saleForm.itemId) return showToast("error", "Select an item")
        const it = selectedSaleItem
        if (!it) return showToast("error", "Item not found")

        const c = computeItem(it)
        const available = Number(it.quantity) || 0

        if (available <= 0) return showToast("error", "This item has 0 quantity in inventory")
        if (sellQty <= 0) return showToast("error", "Quantity sold must be at least 1")
        if (sellQty > available) return showToast("error", "Quantity sold exceeds inventory quantity")
        if (sellPricePerUnitPence <= 0) return showToast("error", "Sale price per unit is required")

        const platform = (saleForm.platform || "OTHER").toUpperCase()
        const soldAtLocal = String(saleForm.soldAt || "").trim()
        const soldAt = soldAtLocal ? new Date(soldAtLocal).toISOString() : new Date().toISOString()
        const saleCur = (c.cur || "GBP").toUpperCase()

        const salePayload = {
            itemId: String(it.id),
            itemName: it.name || null,
            sku: it.sku || null,
            platform,
            soldAt,
            quantitySold: sellQty,
            salePricePerUnitPence: sellPricePerUnitPence,
            feesPence: 0,
            netPence: sellGrossPence,
            costTotalPence: purchaseTotalForSoldUnitsPence,
            currency: saleCur,
            notes: String(saleForm.notes || "").trim() || null,
        }

        setRecordSaleSaving(true)
        try {
            const resSale = await fetch("/api/sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(salePayload),
            })
            const saleData = await resSale.json().catch(() => null)
            if (!resSale.ok) throw new Error(saleData?.error || `Create sale failed (${resSale.status})`)

            if (saleForm.removeFromInventory) {
                if (saleForm.removeMode === "DELETE") {
                    const resDel = await fetch(`/api/items/${it.id}`, { method: "DELETE" })
                    const delData = await resDel.json().catch(() => null)
                    if (!resDel.ok) throw new Error(delData?.error || `Inventory delete failed (${resDel.status})`)
                } else {
                    const remaining = Math.max(0, available - sellQty)

                    const decoded = decodeNotes(it.notes)
                    const meta = normaliseMeta(decoded.meta)

                    const nextStatus = remaining === 0 ? "SOLD" : "LISTED"
                    const nextMeta = { ...meta, status: nextStatus }

                    if (remaining === 0) {
                        const listings = Array.isArray(nextMeta.listings) ? [...nextMeta.listings] : []
                        const first = listings[0] || { platform, url: "", pricePence: null }
                        const mergedFirst = {
                            platform: String(first.platform || platform).toUpperCase(),
                            url: first.url || "",
                            pricePence: sellPricePerUnitPence,
                        }
                        nextMeta.listings = [mergedFirst, ...listings.slice(1)]
                    }

                    const patched = {
                        quantity: remaining,
                        status: nextStatus,
                        notes: encodeNotes(decoded.notes, { ...nextMeta, currency: meta.currency || saleCur }),
                    }

                    const resPatch = await fetch(`/api/items/${it.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(patched),
                    })
                    const patchData = await resPatch.json().catch(() => null)
                    if (!resPatch.ok) throw new Error(patchData?.error || `Inventory update failed (${resPatch.status})`)
                }
            }

            showToast("ok", "Sale recorded")
            setRecordSaleOpen(false)
            await Promise.all([loadSales(), loadItems()])
        } catch (e2) {
            showToast("error", e2?.message || "Failed to record sale")
        } finally {
            setRecordSaleSaving(false)
        }
    }

    const quickActions = useMemo(
        () => [
            { name: "Inventory", icon: "📦", href: "/program/inventory", color: "from-blue-500 to-cyan-500" },
            { name: "Record Sale", icon: "💰", onClick: openRecordSale, color: "from-emerald-500 to-teal-400" },
            { name: "Sales", icon: "🧾", href: "/program/sales", color: "from-purple-500 to-pink-500" },
            { name: "Add Item", icon: "➕", onClick: openAddItem, color: "from-orange-500 to-red-500" },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [computedItems, items]
    )

    return (
        <div className="min-h-[calc(100vh-64px)] bg-black text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_20%_-10%,rgba(59,130,246,0.18),transparent),radial-gradient(900px_500px_at_90%_10%,rgba(16,185,129,0.14),transparent),radial-gradient(800px_500px_at_40%_120%,rgba(168,85,247,0.14),transparent)]" />

            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Welcome back! 👋</h1>
                        <p className="text-white/60">Your reselling business at a glance (live data)</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-xs font-semibold text-zinc-300">Display</div>
                            <select
                                value={currencyView}
                                onChange={(e) => setCurrencyView(e.target.value)}
                                className="h-9 rounded-xl border border-white/10 bg-zinc-950/60 px-2 text-sm text-white outline-none"
                            >
                                {Object.keys(CURRENCY_META).map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>

                            <button
                                type="button"
                                onClick={loadFx}
                                className="h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white/90 hover:bg-white/15"
                                title="Refresh exchange rates"
                            >
                                {fx.loading ? "FX…" : "FX"}
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                loadItems()
                                loadSales()
                            }}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Range */}
                <RangePills value={timeRange} onChange={setTimeRange} />

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        label={`Revenue (${currencyView})`}
                        value={loadingSales ? "—" : fmt(currencyView, salesStats.revenue)}
                        sub="Net sales in selected period"
                        className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20"
                        icon="💸"
                    />

                    <StatCard
                        label={`Profit (${currencyView})`}
                        value={loadingSales ? "—" : fmt(currencyView, salesStats.profit)}
                        sub={loadingSales ? "—" : `${salesStats.roi}% ROI`}
                        className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20"
                        icon="📈"
                    />

                    <StatCard
                        label="Active listings"
                        value={loadingItems ? "—" : String(inventoryStats.listedCount)}
                        sub={loadingItems ? "—" : `${inventoryStats.totalUnits} total units in stock`}
                        className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20"
                        icon="🏷️"
                    />

                    <StatCard
                        label={`Inventory value (${currencyView})`}
                        value={loadingItems ? "—" : fmt(currencyView, inventoryStats.inventoryValue)}
                        sub={loadingItems ? "—" : `${inventoryStats.unlistedCount} unlisted item(s)`}
                        className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20"
                        icon="📦"
                    />
                </div>

                {/* Quick Actions */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">Quick actions</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {quickActions.map((action) => {
                            const Inner = (
                                <div className="bg-white/5 border border-white/10 rounded-3xl p-4 hover:bg-white/10 transition group shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                                    <div
                                        className={[
                                            "h-11 w-11 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-3 group-hover:scale-110 transition",
                                            action.color,
                                        ].join(" ")}
                                    >
                                        <span className="text-xl">{action.icon}</span>
                                    </div>
                                    <p className="text-white font-semibold">{action.name}</p>
                                    <p className="mt-1 text-xs text-white/40">Open</p>
                                </div>
                            )

                            if (action.href) {
                                return (
                                    <Link key={action.name} href={action.href}>
                                        {Inner}
                                    </Link>
                                )
                            }

                            return (
                                <button key={action.name} type="button" onClick={action.onClick} className="text-left">
                                    {Inner}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Charts + Recent sales */}
                <div className="grid gap-8 lg:grid-cols-2">
                    <BarChart title="Profit by platform" rows={profitByPlatform} currencyView={currencyView} />

                    <DonutChart
                        title="Sales count by platform"
                        subtitle="sales in period"
                        segments={platformDonutSegments.map((s) => ({
                            label: s.label,
                            value: s.value,
                            colour: s.colour,
                        }))}
                    />
                </div>

                <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Recent sales</h2>
                        <Link href="/program/sales" className="text-sm text-white/60 hover:text-white transition">
                            View all →
                        </Link>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                        <div className="divide-y divide-white/10">
                            {loadingSales ? (
                                <div className="p-4 text-white/60 text-sm">Loading…</div>
                            ) : recentSales.length === 0 ? (
                                <div className="p-4 text-white/60 text-sm">No sales yet.</div>
                            ) : (
                                recentSales.map((sale) => (
                                    <div key={sale.id} className="p-4 hover:bg-white/5 transition">
                                        <div className="flex items-start justify-between mb-2 gap-4">
                                            <div className="min-w-0">
                                                <p className="text-white font-semibold truncate">{sale.item}</p>
                                                <p className="text-white/40 text-sm">
                                                    {sale.platform} • {sale.dateLabel}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-white font-semibold">{sale.netView}</p>
                                                <p className="text-emerald-300 text-sm">{sale.profitView}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* FX footer */}
                <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-white">FX status</div>
                            <div className="mt-1 text-xs text-white/50">
                                {fx.loading
                                    ? "Loading…"
                                    : fx.error
                                        ? fx.error
                                        : fx.nextUpdateUtc
                                            ? `Next update: ${new Date(fx.nextUpdateUtc).toLocaleString()}`
                                            : "Loaded"}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={loadFx}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Refresh FX
                        </button>
                    </div>
                </div>

                {/* Toast */}
                {toast.msg ? (
                    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
                        <div
                            className={[
                                "rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur",
                                toast.type === "ok"
                                    ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                                    : "border-red-400/20 bg-red-500/10 text-red-100",
                            ].join(" ")}
                        >
                            {toast.msg}
                        </div>
                    </div>
                ) : null}

                {/* Add item modal */}
                {addItemOpen ? (
                    <Modal
                        title="Add item"
                        onClose={() => setAddItemOpen(false)}
                        footer={
                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setAddItemOpen(false)}
                                    className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/90 hover:bg-white/10"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="add-item-form"
                                    disabled={addItemSaving}
                                    className="h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
                                >
                                    {addItemSaving ? "Saving…" : "Save item"}
                                </button>
                            </div>
                        }
                        maxWidth="max-w-5xl"
                    >
                        <form id="add-item-form" onSubmit={submitAddItem} className="grid gap-4 md:grid-cols-2">
                            <Field label="Title">
                                <input
                                    value={addItemForm.title}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, title: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="e.g. Nike Air Max 95"
                                />
                            </Field>

                            <Field label="SKU (optional)">
                                <input
                                    value={addItemForm.sku}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, sku: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="Optional…"
                                />
                            </Field>

                            <Field label="Quantity">
                                <input
                                    type="number"
                                    min="0"
                                    value={addItemForm.quantity}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, quantity: safeInt(e.target.value, 0) }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                />
                            </Field>

                            <Field label="Status">
                                <select
                                    value={addItemForm.status}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, status: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                >
                                    {STATUSES.map(([v, label]) => (
                                        <option key={v} value={v}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Category">
                                <select
                                    value={addItemForm.category}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, category: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                >
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Condition">
                                <select
                                    value={addItemForm.condition}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, condition: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                >
                                    {CONDITIONS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label={`Purchase total / unit (${currencyView})`}>
                                <input
                                    value={addItemForm.purchaseTotal}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, purchaseTotal: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="0.00"
                                />
                            </Field>

                            <Field label={`Estimated sale / unit (${currencyView})`}>
                                <input
                                    value={addItemForm.estimatedSale}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, estimatedSale: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="0.00"
                                />
                            </Field>

                            <div className="md:col-span-2 rounded-3xl border border-white/10 bg-zinc-950/40 p-4">
                                <div className="text-sm font-semibold text-white">Listings</div>
                                <div className="mt-1 text-xs text-zinc-300">
                                    Only used when Status is <span className="font-semibold">Listed</span> or <span className="font-semibold">Sold</span>.
                                </div>

                                <div className="mt-3 grid gap-3 md:grid-cols-3">
                                    <Field label="Platform">
                                        <select
                                            value={addItemForm.listingPlatform}
                                            onChange={(e) => setAddItemForm((p) => ({ ...p, listingPlatform: e.target.value }))}
                                            className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                            disabled={!addItemIsListed}
                                        >
                                            {PLATFORMS.map(([v, label]) => (
                                                <option key={v} value={v}>
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label={`Price / unit (${currencyView})`}>
                                        <input
                                            value={addItemForm.listingPrice}
                                            onChange={(e) => setAddItemForm((p) => ({ ...p, listingPrice: e.target.value }))}
                                            className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                            placeholder="0.00"
                                            disabled={!addItemIsListed}
                                        />
                                    </Field>

                                    <Field label="URL (optional)">
                                        <input
                                            value={addItemForm.listingUrl}
                                            onChange={(e) => setAddItemForm((p) => ({ ...p, listingUrl: e.target.value }))}
                                            className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                            placeholder="https://…"
                                            disabled={!addItemIsListed}
                                        />
                                    </Field>

                                    <div className="md:col-span-3">
                                        <button
                                            type="button"
                                            onClick={addListingToAddItem}
                                            disabled={!addItemIsListed}
                                            className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/90 hover:bg-white/10 disabled:opacity-60"
                                        >
                                            Add listing
                                        </button>
                                    </div>
                                </div>

                                {Array.isArray(addItemForm.listings) && addItemForm.listings.length ? (
                                    <div className="mt-3 space-y-2">
                                        {addItemForm.listings.map((l, idx) => (
                                            <div
                                                key={`${l.platform}-${idx}`}
                                                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 p-3"
                                            >
                                                <div className="text-xs text-white/80">
                                                    <span className="font-semibold">{String(l.platform || "OTHER")}</span>
                                                    {l.pricePence != null ? (
                                                        <span className="ml-2 text-emerald-200 font-semibold">{fmt(currencyView, Number(l.pricePence) || 0)}</span>
                                                    ) : null}
                                                    {l.url ? <span className="ml-2 text-white/50 truncate">{l.url}</span> : null}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAddItemListing(idx)}
                                                    className="h-9 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/90 hover:bg-white/10"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>

                            <Field label="Notes" className="md:col-span-2">
                                <textarea
                                    value={addItemForm.notes}
                                    onChange={(e) => setAddItemForm((p) => ({ ...p, notes: e.target.value }))}
                                    className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="Optional…"
                                />
                            </Field>
                        </form>
                    </Modal>
                ) : null}

                {/* Record sale modal */}
                {recordSaleOpen ? (
                    <Modal
                        title="Record sale"
                        onClose={() => setRecordSaleOpen(false)}
                        footer={
                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setRecordSaleOpen(false)}
                                    className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/90 hover:bg-white/10"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="record-sale-form"
                                    disabled={recordSaleSaving}
                                    className="h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
                                >
                                    {recordSaleSaving ? "Saving…" : "Save sale"}
                                </button>
                            </div>
                        }
                        maxWidth="max-w-5xl"
                    >
                        <form id="record-sale-form" onSubmit={submitRecordSale} className="grid gap-4 md:grid-cols-2">
                            <Field label="Item">
                                <select
                                    value={saleForm.itemId}
                                    onChange={(e) => setSaleForm((p) => ({ ...p, itemId: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                >
                                    {inventoryOptions.map(({ it, c }) => (
                                        <option key={String(it.id)} value={String(it.id)}>
                                            {String(it.name || "Untitled")} • Qty {Number(it.quantity) || 0} • {String(c.status || "UNLISTED")}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Platform">
                                <select
                                    value={saleForm.platform}
                                    onChange={(e) => setSaleForm((p) => ({ ...p, platform: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                >
                                    {PLATFORMS.map(([v, label]) => (
                                        <option key={v} value={v}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Sold at">
                                <input
                                    type="datetime-local"
                                    value={saleForm.soldAt}
                                    onChange={(e) => setSaleForm((p) => ({ ...p, soldAt: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                />
                            </Field>

                            <Field label="Quantity sold">
                                <input
                                    type="number"
                                    min="1"
                                    value={saleForm.quantitySold}
                                    onChange={(e) => setSaleForm((p) => ({ ...p, quantitySold: safeInt(e.target.value, 1) }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                />
                            </Field>

                            <Field label={`Sale price / unit (${selectedSaleItemComputed?.cur || currencyView})`}>
                                <input
                                    value={saleForm.salePricePerUnit}
                                    onChange={(e) => setSaleForm((p) => ({ ...p, salePricePerUnit: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="0.00"
                                />
                            </Field>

                            <div className="rounded-3xl border border-white/10 bg-zinc-950/40 p-4 md:col-span-2">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-white">Remove from inventory</div>
                                        <div className="mt-1 text-xs text-zinc-300">After saving the sale, apply the inventory change automatically.</div>
                                    </div>

                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!saleForm.removeFromInventory}
                                            onChange={(e) => setSaleForm((p) => ({ ...p, removeFromInventory: e.target.checked }))}
                                            className="h-4 w-4 rounded border-white/20 bg-transparent accent-white"
                                        />
                                        <span className="text-sm font-semibold text-white/90">Enabled</span>
                                    </label>
                                </div>

                                {saleForm.removeFromInventory ? (
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={() => setSaleForm((p) => ({ ...p, removeMode: "DECREMENT" }))}
                                            className={[
                                                "h-11 rounded-2xl border px-4 text-sm font-semibold transition",
                                                saleForm.removeMode === "DECREMENT"
                                                    ? "border-white/10 bg-white text-zinc-950"
                                                    : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                                            ].join(" ")}
                                        >
                                            Decrement quantity
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setSaleForm((p) => ({ ...p, removeMode: "DELETE" }))}
                                            className={[
                                                "h-11 rounded-2xl border px-4 text-sm font-semibold transition",
                                                saleForm.removeMode === "DELETE"
                                                    ? "border-red-400/20 bg-red-500/10 text-red-100"
                                                    : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                                            ].join(" ")}
                                        >
                                            Delete item row
                                        </button>

                                        {saleForm.removeMode === "DELETE" ? (
                                            <div className="sm:col-span-2 text-xs text-zinc-300">
                                                Delete will remove the entire inventory row (even if only some units are sold). Decrement is recommended.
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <div className="text-[11px] font-semibold text-zinc-300">Gross</div>
                                        <div className="mt-1 text-sm font-semibold text-white">
                                            {fmt(selectedSaleItemComputed?.cur || currencyView, sellGrossPence)}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <div className="text-[11px] font-semibold text-zinc-300">Cost</div>
                                        <div className="mt-1 text-sm font-semibold text-white">
                                            {fmt(selectedSaleItemComputed?.cur || currencyView, purchaseTotalForSoldUnitsPence)}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <div className="text-[11px] font-semibold text-zinc-300">Profit</div>
                                        <div
                                            className={[
                                                "mt-1 text-sm font-semibold",
                                                sellGrossPence - purchaseTotalForSoldUnitsPence >= 0 ? "text-emerald-200" : "text-red-200",
                                            ].join(" ")}
                                        >
                                            {fmt(selectedSaleItemComputed?.cur || currencyView, sellGrossPence - purchaseTotalForSoldUnitsPence)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Field label="Notes" className="md:col-span-2">
                                <textarea
                                    value={saleForm.notes}
                                    onChange={(e) => setSaleForm((p) => ({ ...p, notes: e.target.value }))}
                                    className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="Optional… e.g. bundle, partial refund, buyer issue…"
                                />
                            </Field>
                        </form>
                    </Modal>
                ) : null}
            </div>
        </div>
    )
}
