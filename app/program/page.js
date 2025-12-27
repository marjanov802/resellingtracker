// app/program/page.js - Resellers Dashboard (real data wired up)
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

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

/**
 * NOTES payload for items (v4 expected from your inventory page)
 */
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

const safeStr = (x) => String(x ?? "").trim()

function normaliseMeta(meta) {
    const m = meta && typeof meta === "object" ? meta : {}
    const currency = (m.currency || "GBP").toUpperCase()
    const status = (m.status || "UNLISTED").toUpperCase()
    const purchaseTotalPence = Number(m.purchaseTotalPence) || 0

    const listings = Array.isArray(m.listings)
        ? m.listings
            .map((x) => ({
                platform: (x?.platform || "OTHER").toUpperCase(),
                url: safeStr(x?.url) || "",
                pricePence: x?.pricePence == null ? null : Number(x.pricePence),
            }))
            .filter((x) => x.url || Number.isFinite(x.pricePence))
        : []

    return { currency, status, purchaseTotalPence, listings }
}

function computeItemForDashboard(it) {
    const decoded = decodeNotes(it.notes)
    const meta = normaliseMeta(decoded.meta)

    const q = Number(it.quantity) || 0
    const cur = (it.currency || meta.currency || "GBP").toUpperCase()
    const status = (it.status || meta.status || "UNLISTED").toUpperCase()

    // prefer meta.purchaseTotalPence (all-in per unit), fallback to purchaseSubtotalPence / cost field if exists
    const perUnit =
        meta.purchaseTotalPence > 0
            ? meta.purchaseTotalPence
            : Number(it.purchaseSubtotalPence || it.costPence || 0) || 0

    const invValue = perUnit * q

    const firstListing = meta.listings?.[0] || null
    const listedPricePerUnit = firstListing?.pricePence ?? null

    return {
        cur,
        q,
        status,
        perUnit,
        invValue,
        listedPricePerUnit,
    }
}

function StatCard({ label, value, sub, className = "" }) {
    return (
        <div className={["rounded-2xl border border-white/10 bg-white/5 p-6", className].join(" ")}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-sm font-medium">{label}</p>
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="text-white/40 text-sm mt-1">{sub}</p>
        </div>
    )
}

function RangePills({ value, onChange }) {
    return (
        <div className="mb-6 flex flex-wrap gap-2">
            {["today", "week", "month", "year"].map((range) => (
                <button
                    key={range}
                    onClick={() => onChange(range)}
                    className={[
                        "px-4 py-2 rounded-lg text-sm font-medium transition",
                        value === range
                            ? "bg-white text-black"
                            : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
            ))}
        </div>
    )
}

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
    // Monday start
    const x = startOfLocalDay(d)
    const day = x.getDay() // 0 Sun ... 6 Sat
    const diff = (day === 0 ? 6 : day - 1) // days since Monday
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
    if (timeRange === "today") {
        return { from: startOfLocalDay(now), to: endOfLocalDay(now) }
    }
    if (timeRange === "week") {
        const from = startOfLocalWeek(now)
        return { from, to: endOfLocalDay(now) }
    }
    if (timeRange === "month") {
        const from = startOfLocalMonth(now)
        return { from, to: endOfLocalDay(now) }
    }
    // year
    const from = startOfLocalYear(now)
    return { from, to: endOfLocalDay(now) }
}

export default function ProgramDashboard() {
    const [timeRange, setTimeRange] = useState("week")

    const [items, setItems] = useState([])
    const [sales, setSales] = useState([])

    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState(null)

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

    useEffect(() => {
        if (typeof window !== "undefined") localStorage.setItem("rt_currency_view", currencyView)
    }, [currencyView])

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

    const loadAll = async () => {
        setLoading(true)
        setErr(null)
        try {
            const [rItems, rSales] = await Promise.all([
                fetch("/api/items", { cache: "no-store" }),
                fetch("/api/sales", { cache: "no-store" }),
            ])

            const dItems = await rItems.json().catch(() => null)
            const dSales = await rSales.json().catch(() => null)

            if (!rItems.ok) throw new Error(dItems?.error || `Failed to load items (${rItems.status})`)
            if (!rSales.ok) throw new Error(dSales?.error || `Failed to load sales (${rSales.status})`)

            setItems(Array.isArray(dItems) ? dItems : [])
            setSales(Array.isArray(dSales) ? dSales : [])
        } catch (e) {
            setErr(e?.message || "Failed to load dashboard data")
            setItems([])
            setSales([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAll()
        loadFx()
    }, [])

    const computedItems = useMemo(() => {
        return items.map((it) => ({ it, c: computeItemForDashboard(it) }))
    }, [items])

    const { from: rangeFrom, to: rangeTo } = useMemo(() => getRangeBounds(timeRange), [timeRange])

    const salesInRange = useMemo(() => {
        const fromMs = rangeFrom.getTime()
        const toMs = rangeTo.getTime()
        return sales
            .map((s) => ({
                s,
                soldAt: s.soldAt ? new Date(s.soldAt) : null,
            }))
            .filter(({ soldAt }) => soldAt && !Number.isNaN(soldAt.getTime()))
            .filter(({ soldAt }) => {
                const t = soldAt.getTime()
                return t >= fromMs && t <= toMs
            })
            .map(({ s }) => s)
    }, [sales, rangeFrom, rangeTo])

    const stats = useMemo(() => {
        let revenue = 0
        let profit = 0
        let soldCount = 0

        for (const s of salesInRange) {
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

            revenue += convertMinor(netPence, cur, currencyView, fx.rates).value
            profit += convertMinor(profitPence, cur, currencyView, fx.rates).value
            soldCount += 1
        }

        // Active listings + inventory value from items
        let activeListings = 0
        let inventoryValue = 0
        let lowStockCount = 0

        for (const { c } of computedItems) {
            const q = c.q || 0
            const status = (c.status || "UNLISTED").toUpperCase()
            if (q > 0 && status !== "SOLD") {
                // treat LISTED as active listing, but also count UNLISTED as inventory (not listing)
                if (status === "LISTED") activeListings += 1

                inventoryValue += convertMinor(c.invValue, c.cur, currencyView, fx.rates).value
                if (q <= 2) lowStockCount += 1
            }
        }

        const roi = revenue > 0 ? (profit / revenue) * 100 : 0

        return {
            revenue,
            profit,
            soldCount,
            activeListings,
            inventoryValue,
            roi: Number.isFinite(roi) ? Math.round(roi * 10) / 10 : 0,
            lowStockCount,
        }
    }, [salesInRange, computedItems, currencyView, fx.rates])

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

    const lowStock = useMemo(() => {
        const list = computedItems
            .filter(({ c }) => (c.q || 0) > 0 && (c.status || "UNLISTED").toUpperCase() !== "SOLD")
            .filter(({ c }) => (c.q || 0) <= 2)
            .sort((a, b) => (a.c.q || 0) - (b.c.q || 0))
            .slice(0, 6)
            .map(({ it, c }) => {
                const unitCostView = fmt(currencyView, convertMinor(c.perUnit, c.cur, currencyView, fx.rates).value)
                return {
                    id: it.id,
                    item: it.name || "—",
                    quantity: c.q || 0,
                    unitCostView,
                }
            })

        return list
    }, [computedItems, currencyView, fx.rates])

    const quickActions = useMemo(
        () => [
            { name: "Inventory", icon: "📦", href: "/program/inventory", color: "from-blue-500 to-cyan-500" },
            { name: "Record Sale", icon: "💰", href: "/program/sales", color: "from-green-500 to-emerald-500" },
            { name: "Sales", icon: "🧾", href: "/program/sales", color: "from-purple-500 to-pink-500" },
            { name: "Add Item", icon: "➕", href: "/program/inventory", color: "from-orange-500 to-red-500" },
        ],
        []
    )

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
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
                            onClick={loadAll}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Errors */}
                {err ? (
                    <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {err}
                    </div>
                ) : null}

                {/* Range */}
                <RangePills value={timeRange} onChange={setTimeRange} />

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    <StatCard
                        label={`Revenue (${currencyView})`}
                        value={loading ? "—" : fmt(currencyView, stats.revenue)}
                        sub={`Net sales in selected period`}
                        className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20"
                    />

                    <StatCard
                        label={`Profit (${currencyView})`}
                        value={loading ? "—" : fmt(currencyView, stats.profit)}
                        sub={loading ? "—" : `${stats.roi}% ROI`}
                        className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20"
                    />

                    <StatCard
                        label="Active Listings"
                        value={loading ? "—" : String(stats.activeListings)}
                        sub={loading ? "—" : `Inventory value: ${fmt(currencyView, stats.inventoryValue)}`}
                        className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20"
                    />
                </div>

                {/* Quick Actions */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {quickActions.map((action) => (
                            <Link
                                key={action.name}
                                href={action.href}
                                className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition group"
                            >
                                <div
                                    className={[
                                        "h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3 group-hover:scale-110 transition",
                                        action.color,
                                    ].join(" ")}
                                >
                                    <span className="text-xl">{action.icon}</span>
                                </div>
                                <p className="text-white font-medium">{action.name}</p>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                    {/* Recent Sales */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Recent Sales</h2>
                            <Link href="/program/sales" className="text-sm text-white/60 hover:text-white transition">
                                View all →
                            </Link>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            <div className="divide-y divide-white/10">
                                {loading ? (
                                    <div className="p-4 text-white/60 text-sm">Loading…</div>
                                ) : recentSales.length === 0 ? (
                                    <div className="p-4 text-white/60 text-sm">No sales yet.</div>
                                ) : (
                                    recentSales.map((sale) => (
                                        <div key={sale.id} className="p-4 hover:bg-white/5 transition">
                                            <div className="flex items-start justify-between mb-2 gap-4">
                                                <div className="min-w-0">
                                                    <p className="text-white font-medium truncate">{sale.item}</p>
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

                    {/* Low Stock */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Low Stock Alert</h2>
                            <Link href="/program/inventory" className="text-sm text-white/60 hover:text-white transition">
                                Manage →
                            </Link>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            <div className="divide-y divide-white/10">
                                {loading ? (
                                    <div className="p-4 text-white/60 text-sm">Loading…</div>
                                ) : lowStock.length === 0 ? (
                                    <div className="p-4 text-white/60 text-sm">No low stock items.</div>
                                ) : (
                                    lowStock.map((item) => (
                                        <div key={item.id} className="p-4 hover:bg-white/5 transition">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <p className="text-white font-medium truncate">{item.item}</p>
                                                    <p className="text-orange-300 text-sm">Only {item.quantity} left</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-white/60 text-sm">{item.unitCostView}/unit</p>
                                                    <Link
                                                        href="/program/inventory"
                                                        className="text-xs text-white/40 hover:text-white transition"
                                                    >
                                                        Open inventory →
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Performance Overview */}
                <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="text-lg font-semibold text-white">Performance Overview</h2>
                        <div className="text-xs text-white/50">
                            Period: {rangeFrom.toLocaleDateString()} → {rangeTo.toLocaleDateString()} • Sales:{" "}
                            {loading ? "—" : stats.soldCount}
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-white/60">Revenue</div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                                {loading ? "—" : fmt(currencyView, stats.revenue)}
                            </div>
                            <div className="mt-1 text-xs text-white/40">Net sales (after fees)</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-white/60">Profit</div>
                            <div className="mt-2 text-2xl font-semibold text-emerald-200">
                                {loading ? "—" : fmt(currencyView, stats.profit)}
                            </div>
                            <div className="mt-1 text-xs text-white/40">Net minus cost basis on sale rows</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-white/60">Inventory</div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                                {loading ? "—" : fmt(currencyView, stats.inventoryValue)}
                            </div>
                            <div className="mt-1 text-xs text-white/40">
                                Low stock items: {loading ? "—" : stats.lowStockCount}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 text-xs text-white/40">
                        {fx.nextUpdateUtc ? `FX next update: ${fx.nextUpdateUtc}` : "FX next update: —"}
                    </div>
                </div>

                {/* Tips */}
                <div className="mt-8 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6">
                    <h3 className="text-white font-semibold mb-2">💡 Pro Tip</h3>
                    <p className="text-white/70">
                        Profit on the dashboard uses your stored cost fields on each sale row (costTotalPence / costPerUnitPence).
                        If a sale has no cost saved, profit will be under-reported.
                    </p>
                </div>
            </div>
        </div>
    )
}
