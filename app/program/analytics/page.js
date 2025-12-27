// app/program/analytics/page.js
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

const safeNum = (x, d = 0) => {
    const n = Number(x)
    if (!Number.isFinite(n)) return d
    return n
}

const pad2 = (n) => String(n).padStart(2, "0")

const startOfLocalDay = (d) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}
const endOfLocalDay = (d) => {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
}
const startOfLocalWeek = (d) => {
    const x = startOfLocalDay(d)
    const day = x.getDay() // 0 Sun ... 6 Sat
    const diff = day === 0 ? 6 : day - 1 // Monday start
    x.setDate(x.getDate() - diff)
    return x
}
const startOfLocalMonth = (d) => {
    const x = startOfLocalDay(d)
    x.setDate(1)
    return x
}
const startOfLocalYear = (d) => {
    const x = startOfLocalDay(d)
    x.setMonth(0, 1)
    return x
}

const getRangeBounds = (range) => {
    const now = new Date()
    if (range === "today") return { from: startOfLocalDay(now), to: endOfLocalDay(now) }
    if (range === "week") return { from: startOfLocalWeek(now), to: endOfLocalDay(now) }
    if (range === "month") return { from: startOfLocalMonth(now), to: endOfLocalDay(now) }
    return { from: startOfLocalYear(now), to: endOfLocalDay(now) } // year
}

const toISODate = (d) => {
    const x = new Date(d)
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`
}

function Pill({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "h-10 rounded-2xl px-4 text-sm font-semibold transition",
                active ? "bg-white text-zinc-950" : "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
            ].join(" ")}
        >
            {children}
        </button>
    )
}

function Card({ title, subtitle, right, children }) {
    return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{title}</div>
                    {subtitle ? <div className="mt-1 text-xs text-zinc-300">{subtitle}</div> : null}
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
            </div>
            {children}
        </div>
    )
}

function Stat({ label, value, sub, good = false }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">{label}</div>
            <div className={["mt-2 text-2xl font-semibold", good ? "text-emerald-200" : "text-white"].join(" ")}>
                {value}
            </div>
            {sub ? <div className="mt-1 text-xs text-zinc-400">{sub}</div> : null}
        </div>
    )
}

function MiniRow({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <div className="text-xs font-semibold text-zinc-300">{label}</div>
            <div className="text-sm text-white">{value}</div>
        </div>
    )
}

function BarRow({ label, value, max, right, tone = "bg-white/20" }) {
    const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-[13px] font-semibold text-white">{label}</div>
                <div className="shrink-0 text-xs font-semibold text-zinc-200">{right}</div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className={["h-full rounded-full", tone].join(" ")} style={{ width: `${pct * 100}%` }} />
            </div>
        </div>
    )
}

function Table({ columns, rows, emptyText = "No data" }) {
    return (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid border-b border-white/10 bg-white/5" style={{ gridTemplateColumns: columns.map((c) => c.w).join(" ") }}>
                {columns.map((c) => (
                    <div key={c.k} className="px-3 py-2 text-xs font-semibold text-zinc-200">
                        {c.t}
                    </div>
                ))}
            </div>
            <div className="divide-y divide-white/10">
                {rows.length === 0 ? <div className="px-3 py-6 text-sm text-zinc-300">{emptyText}</div> : null}
                {rows.map((r, idx) => (
                    <div key={r._k || idx} className={["grid", idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"].join(" ")} style={{ gridTemplateColumns: columns.map((c) => c.w).join(" ") }}>
                        {columns.map((c) => (
                            <div key={c.k} className="px-3 py-2 text-[13px] text-zinc-100">
                                {typeof c.render === "function" ? c.render(r) : r[c.k]}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function AnalyticsPage() {
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState(null)

    const [sales, setSales] = useState([])
    const [items, setItems] = useState([])

    const [range, setRange] = useState("month")
    const [view, setView] = useState("day") // day|week|month
    const [topN, setTopN] = useState(8)

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
            const [rSales, rItems] = await Promise.all([
                fetch("/api/sales", { cache: "no-store" }),
                fetch("/api/items", { cache: "no-store" }),
            ])

            const dSales = await rSales.json().catch(() => null)
            const dItems = await rItems.json().catch(() => null)

            if (!rSales.ok) throw new Error(dSales?.error || `Failed to load sales (${rSales.status})`)
            if (!rItems.ok) throw new Error(dItems?.error || `Failed to load items (${rItems.status})`)

            setSales(Array.isArray(dSales) ? dSales : [])
            setItems(Array.isArray(dItems) ? dItems : [])
        } catch (e) {
            setErr(e?.message || "Failed to load analytics")
            setSales([])
            setItems([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAll()
        loadFx()
    }, [])

    const { from: rangeFrom, to: rangeTo } = useMemo(() => getRangeBounds(range), [range])

    const salesInRange = useMemo(() => {
        const fromMs = rangeFrom.getTime()
        const toMs = rangeTo.getTime()
        return sales
            .map((s) => {
                const dt = s.soldAt ? new Date(s.soldAt) : null
                return { s, dt, t: dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : null }
            })
            .filter((x) => x.t != null && x.t >= fromMs && x.t <= toMs)
            .sort((a, b) => (b.t || 0) - (a.t || 0))
            .map((x) => x.s)
    }, [sales, rangeFrom, rangeTo])

    const computedSales = useMemo(() => {
        return salesInRange.map((s) => {
            const cur = (s.currency || "GBP").toUpperCase()
            const qty = safeNum(s.quantitySold, 0)
            const ppu = safeNum(s.salePricePerUnitPence, 0)
            const fees = safeNum(s.feesPence, 0)

            const grossPence = qty * ppu
            const netPence = s.netPence != null ? safeNum(s.netPence, 0) : Math.max(0, grossPence - fees)

            const costTotal =
                s.costTotalPence != null
                    ? safeNum(s.costTotalPence, 0)
                    : s.costPerUnitPence != null
                        ? safeNum(s.costPerUnitPence, 0) * qty
                        : 0

            const profitPence = netPence - costTotal

            const netView = convertMinor(netPence, cur, currencyView, fx.rates).value
            const profitView = convertMinor(profitPence, cur, currencyView, fx.rates).value
            const grossView = convertMinor(grossPence, cur, currencyView, fx.rates).value
            const feesView = convertMinor(fees, cur, currencyView, fx.rates).value
            const costView = convertMinor(costTotal, cur, currencyView, fx.rates).value

            const dt = s.soldAt ? new Date(s.soldAt) : null
            const t = dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : null

            return {
                ...s,
                _cur: cur,
                _t: t,
                _dateKey: dt ? toISODate(dt) : "—",
                _weekKey: dt ? `${dt.getFullYear()}-W${pad2(getISOWeek(dt))}` : "—",
                _monthKey: dt ? `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}` : "—",
                _netView: netView,
                _profitView: profitView,
                _grossView: grossView,
                _feesView: feesView,
                _costView: costView,
                _qty: qty,
            }
        })
    }, [salesInRange, currencyView, fx.rates])

    const headline = useMemo(() => {
        let revenue = 0
        let profit = 0
        let gross = 0
        let fees = 0
        let cost = 0
        let units = 0
        let rows = 0

        for (const s of computedSales) {
            revenue += s._netView
            profit += s._profitView
            gross += s._grossView
            fees += s._feesView
            cost += s._costView
            units += s._qty
            rows += 1
        }

        const aov = rows > 0 ? Math.round((revenue / rows) * 1) : 0
        const ppu = units > 0 ? Math.round((profit / units) * 1) : 0
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0

        return {
            rows,
            units,
            revenue,
            profit,
            gross,
            fees,
            cost,
            aov,
            profitPerUnit: ppu,
            margin: Number.isFinite(margin) ? Math.round(margin * 10) / 10 : 0,
        }
    }, [computedSales])

    const series = useMemo(() => {
        const keyFn =
            view === "day" ? (x) => x._dateKey : view === "week" ? (x) => x._weekKey : (x) => x._monthKey

        const map = new Map()
        for (const s of computedSales) {
            const k = keyFn(s)
            if (!map.has(k)) map.set(k, { k, revenue: 0, profit: 0, rows: 0, units: 0 })
            const agg = map.get(k)
            agg.revenue += s._netView
            agg.profit += s._profitView
            agg.rows += 1
            agg.units += s._qty
        }

        const arr = Array.from(map.values()).sort((a, b) => String(a.k).localeCompare(String(b.k)))
        const maxRevenue = arr.reduce((m, x) => Math.max(m, x.revenue), 0)
        const maxProfitAbs = arr.reduce((m, x) => Math.max(m, Math.abs(x.profit)), 0)

        return { arr, maxRevenue, maxProfitAbs }
    }, [computedSales, view])

    const byPlatform = useMemo(() => {
        const map = new Map()
        for (const s of computedSales) {
            const k = String(s.platform || "OTHER").toUpperCase()
            if (!map.has(k)) map.set(k, { k, revenue: 0, profit: 0, rows: 0, units: 0 })
            const agg = map.get(k)
            agg.revenue += s._netView
            agg.profit += s._profitView
            agg.rows += 1
            agg.units += s._qty
        }
        const arr = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
        const max = arr.reduce((m, x) => Math.max(m, x.revenue), 0)
        return { arr: arr.slice(0, 10), max }
    }, [computedSales])

    const byItem = useMemo(() => {
        const map = new Map()
        for (const s of computedSales) {
            const name = String(s.itemName || s.item?.name || "—")
            const k = `${String(s.itemId || "none")}::${name}`
            if (!map.has(k)) map.set(k, { k, itemId: s.itemId || null, name, revenue: 0, profit: 0, rows: 0, units: 0 })
            const agg = map.get(k)
            agg.revenue += s._netView
            agg.profit += s._profitView
            agg.rows += 1
            agg.units += s._qty
        }
        const arr = Array.from(map.values()).sort((a, b) => b.profit - a.profit)
        const max = arr.reduce((m, x) => Math.max(m, x.profit), 0)
        return { arr: arr.slice(0, Math.max(1, Math.min(25, topN))), max }
    }, [computedSales, topN])

    const inventorySnapshot = useMemo(() => {
        // Best-effort: inventory value (purchaseSubtotalPence) + counts by status
        let invValue = 0
        let rows = 0
        let units = 0
        let listed = 0
        let unlisted = 0
        let sold = 0

        for (const it of items) {
            const q = safeNum(it.quantity, 0)
            const cur = (it.currency || "GBP").toUpperCase()
            const status = String(it.status || "UNLISTED").toUpperCase()

            const perUnit = safeNum(it.purchaseSubtotalPence || it.costPence || 0, 0)
            const total = Math.max(0, perUnit * q)

            rows += 1
            units += q

            if (status === "LISTED") listed += 1
            else if (status === "SOLD") sold += 1
            else unlisted += 1

            invValue += convertMinor(total, cur, currencyView, fx.rates).value
        }

        return { invValue, rows, units, listed, unlisted, sold }
    }, [items, currencyView, fx.rates])

    const columnsSales = useMemo(
        () => [
            { k: "item", t: "Item", w: "minmax(0,2fr)", render: (r) => <span className="truncate block">{r.itemName || r.item?.name || "—"}</span> },
            { k: "platform", t: "Platform", w: "120px", render: (r) => String(r.platform || "—").toUpperCase() },
            { k: "qty", t: "Qty", w: "80px", render: (r) => String(r._qty || 0) },
            { k: "revenue", t: `Revenue (${currencyView})`, w: "160px", render: (r) => fmt(currencyView, r._netView) },
            { k: "profit", t: `Profit (${currencyView})`, w: "160px", render: (r) => <span className={r._profitView >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>{fmt(currencyView, r._profitView)}</span> },
            { k: "soldAt", t: "Sold at", w: "130px", render: (r) => (r.soldAt ? new Date(r.soldAt).toLocaleDateString() : "—") },
        ],
        [currencyView]
    )

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-50">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
                        <p className="mt-1 text-sm text-zinc-300">Trends, breakdowns, and performance across time.</p>
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

                {err ? (
                    <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {err}
                    </div>
                ) : null}

                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                        <Pill active={range === "today"} onClick={() => setRange("today")}>Today</Pill>
                        <Pill active={range === "week"} onClick={() => setRange("week")}>Week</Pill>
                        <Pill active={range === "month"} onClick={() => setRange("month")}>Month</Pill>
                        <Pill active={range === "year"} onClick={() => setRange("year")}>Year</Pill>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="text-xs font-semibold text-zinc-300">Group</div>
                        <select
                            value={view}
                            onChange={(e) => setView(e.target.value)}
                            className="h-10 rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                        >
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                        </select>

                        <div className="ml-2 text-xs font-semibold text-zinc-300">Top</div>
                        <select
                            value={topN}
                            onChange={(e) => setTopN(Number(e.target.value))}
                            className="h-10 rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                        >
                            {[5, 8, 10, 15, 20, 25].map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mb-6 grid gap-4 md:grid-cols-4">
                    <Stat label="Sales (rows)" value={loading ? "—" : String(headline.rows)} sub="Records in period" />
                    <Stat label="Units sold" value={loading ? "—" : String(headline.units)} sub="Sum of quantities" />
                    <Stat label={`Revenue (${currencyView})`} value={loading ? "—" : fmt(currencyView, headline.revenue)} sub="Net sales (after fees)" good />
                    <Stat label={`Profit (${currencyView})`} value={loading ? "—" : fmt(currencyView, headline.profit)} sub={`Margin ${headline.margin}%`} good={headline.profit >= 0} />
                </div>

                <div className="mb-6 grid gap-4 lg:grid-cols-3">
                    <Card
                        title="Trend"
                        subtitle={`Grouped by ${view} • ${rangeFrom.toLocaleDateString()} → ${rangeTo.toLocaleDateString()}`}
                        right={
                            <Link href="/program/sales" className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10">
                                Open sales
                            </Link>
                        }
                    >
                        <div className="space-y-4">
                            {series.arr.length === 0 ? (
                                <div className="text-sm text-zinc-300">No sales in this period.</div>
                            ) : (
                                series.arr.map((x) => (
                                    <div key={x.k} className="space-y-3">
                                        <BarRow
                                            label={x.k}
                                            value={x.revenue}
                                            max={series.maxRevenue}
                                            right={`${fmt(currencyView, x.revenue)} • ${x.rows} sale(s)`}
                                            tone="bg-white/20"
                                        />
                                        <BarRow
                                            label="Profit"
                                            value={Math.abs(x.profit)}
                                            max={series.maxProfitAbs}
                                            right={fmt(currencyView, x.profit)}
                                            tone={x.profit >= 0 ? "bg-emerald-400/30" : "bg-red-400/30"}
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>

                    <Card title="Platform performance" subtitle="Revenue and profit by platform">
                        <div className="space-y-3">
                            {byPlatform.arr.length === 0 ? (
                                <div className="text-sm text-zinc-300">No platform data in this period.</div>
                            ) : (
                                byPlatform.arr.map((p) => (
                                    <BarRow
                                        key={p.k}
                                        label={p.k}
                                        value={p.revenue}
                                        max={byPlatform.max}
                                        right={`${fmt(currencyView, p.revenue)} • ${fmt(currencyView, p.profit)}`}
                                        tone="bg-white/20"
                                    />
                                ))
                            )}
                        </div>
                    </Card>

                    <Card title="Inventory snapshot" subtitle="Current inventory (all items)">
                        <div className="divide-y divide-white/10">
                            <MiniRow label="Inventory rows" value={loading ? "—" : String(inventorySnapshot.rows)} />
                            <MiniRow label="Total units" value={loading ? "—" : String(inventorySnapshot.units)} />
                            <MiniRow label="Listed rows" value={loading ? "—" : String(inventorySnapshot.listed)} />
                            <MiniRow label="Unlisted rows" value={loading ? "—" : String(inventorySnapshot.unlisted)} />
                            <MiniRow label="Sold rows" value={loading ? "—" : String(inventorySnapshot.sold)} />
                            <div className="pt-3">
                                <div className="text-xs font-semibold text-zinc-300">Inventory value</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{loading ? "—" : fmt(currencyView, inventorySnapshot.invValue)}</div>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card title="Top items by profit" subtitle="Best performers (profit sum)">
                        <div className="space-y-3">
                            {byItem.arr.length === 0 ? (
                                <div className="text-sm text-zinc-300">No item performance data in this period.</div>
                            ) : (
                                byItem.arr.map((it) => (
                                    <div key={it.k} className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold text-white">{it.name}</div>
                                                <div className="mt-1 text-xs text-zinc-400">
                                                    {it.rows} sale(s) • {it.units} unit(s) • revenue {fmt(currencyView, it.revenue)}
                                                </div>
                                            </div>
                                            <div className={["shrink-0 text-sm font-semibold", it.profit >= 0 ? "text-emerald-200" : "text-red-200"].join(" ")}>
                                                {fmt(currencyView, it.profit)}
                                            </div>
                                        </div>
                                        {it.itemId ? (
                                            <div className="mt-3">
                                                <Link
                                                    href="/program/sales"
                                                    className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                                                >
                                                    View in sales →
                                                </Link>
                                            </div>
                                        ) : null}
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>

                    <Card title="Sales table" subtitle="Latest records in selected period">
                        <Table
                            columns={columnsSales}
                            rows={computedSales.slice(0, 12).map((r) => ({
                                ...r,
                                _k: r.id,
                            }))}
                            emptyText="No sales to show."
                        />
                    </Card>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
                    <div>{fx.nextUpdateUtc ? `FX next update: ${fx.nextUpdateUtc}` : "FX next update: —"}</div>
                    <div className="flex items-center gap-2">
                        <span>Attribution:</span>
                        <span
                            className="text-zinc-300 underline underline-offset-2"
                            dangerouslySetInnerHTML={{ __html: fx.attributionHtml || '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ISO week number helper
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}
