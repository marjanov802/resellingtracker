// app/program/analytics/page.js
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

const safeNum = (x, d = 0) => {
    const n = Number(x)
    if (!Number.isFinite(n)) return d
    return n
}

const safeStr = (x) => String(x ?? "").trim()
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const pad2 = (n) => String(n).padStart(2, "0")

/* ============================ Date helpers ============================ */

// Parse date string robustly - handles both "2025-01-09" and "2025-01-09T10:30:00Z" formats
const parseDate = (dateStr) => {
    if (!dateStr) return null
    // If it's already a Date object, return it
    if (dateStr instanceof Date) return dateStr
    const s = String(dateStr).trim()
    if (!s) return null

    // For date-only strings (YYYY-MM-DD), parse as local date to avoid timezone shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [year, month, day] = s.split("-").map(Number)
        return new Date(year, month - 1, day)
    }

    // For full ISO strings, parse normally
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
}

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
    const day = x.getDay()
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

const getRangeBounds = (range, customFrom = null, customTo = null) => {
    const now = new Date()
    if (range === "today") return { from: startOfLocalDay(now), to: endOfLocalDay(now) }
    if (range === "week") return { from: startOfLocalWeek(now), to: endOfLocalDay(now) }
    if (range === "month") return { from: startOfLocalMonth(now), to: endOfLocalDay(now) }
    if (range === "year") return { from: startOfLocalYear(now), to: endOfLocalDay(now) }
    if (range === "custom" && customFrom && customTo) {
        return { from: startOfLocalDay(new Date(customFrom)), to: endOfLocalDay(new Date(customTo)) }
    }
    return { from: startOfLocalYear(now), to: endOfLocalDay(now) }
}

const toISODate = (d) => {
    const x = new Date(d)
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`
}

const addDays = (d, days) => {
    const x = new Date(d)
    x.setDate(x.getDate() + days)
    return x
}

const monthLabelShort = (d) => {
    const dt = new Date(d)
    return dt.toLocaleDateString(undefined, { month: "short" })
}

/* ============================ Notes helpers =========================== */

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
    const category = safeStr(m.category) || "Other"
    const condition = safeStr(m.condition) || "—"
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

    return { currency, status, category, condition, purchaseTotalPence, listings }
}

function computeItem(it) {
    const decoded = decodeNotes(it.notes)
    const meta = normaliseMeta(decoded.meta)

    const q = safeNum(it.quantity, 0)
    const status = (meta.status || it.status || "UNLISTED").toUpperCase()
    const cur = (meta.currency || it.currency || "GBP").toUpperCase()

    const perUnit =
        meta.purchaseTotalPence > 0 ? meta.purchaseTotalPence : safeNum(it.purchaseSubtotalPence || it.costPence || 0, 0)

    const invValue = Math.max(0, perUnit * q)

    const firstListing = meta.listings?.[0] || null
    const listedPricePerUnit = firstListing?.pricePence ?? null

    return {
        cur,
        q,
        status,
        perUnit,
        invValue,
        category: meta.category,
        condition: meta.condition,
        listedPricePerUnit,
        listings: meta.listings || [],
    }
}

/* ============================== UI =================================== */

function Segmented({ value, onChange, options }) {
    return (
        <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
            {options.map((o) => {
                const active = o.value === value
                return (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => onChange(o.value)}
                        className={[
                            "h-9 rounded-xl px-3 text-sm font-semibold transition",
                            active ? "bg-white text-zinc-950" : "text-white/75 hover:text-white",
                        ].join(" ")}
                    >
                        {o.label}
                    </button>
                )
            })}
        </div>
    )
}

function Card({ title, subtitle, right, children, className = "" }) {
    return (
        <div
            className={[
                "rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur",
                className,
            ].join(" ")}
        >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/90">{title}</div>
                    {subtitle ? <div className="mt-1 text-xs text-white/45">{subtitle}</div> : null}
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
            </div>
            {children}
        </div>
    )
}

function KPI({ label, value, sub, tone = "neutral" }) {
    const valueCls =
        tone === "good"
            ? "text-emerald-200"
            : tone === "bad"
                ? "text-red-200"
                : tone === "warn"
                    ? "text-orange-200"
                    : "text-white"
    return (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/25 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</div>
            <div className={["mt-2 text-2xl font-semibold", valueCls].join(" ")}>{value}</div>
            {sub ? <div className="mt-1 text-xs text-white/40">{sub}</div> : null}
        </div>
    )
}

function Table({ columns, rows, emptyText = "No data" }) {
    return (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div
                className="grid border-b border-white/10 bg-white/5"
                style={{ gridTemplateColumns: columns.map((c) => c.w).join(" ") }}
            >
                {columns.map((c) => (
                    <div key={c.k} className="px-3 py-2 text-xs font-semibold text-zinc-200">
                        {c.t}
                    </div>
                ))}
            </div>
            <div className="divide-y divide-white/10">
                {rows.length === 0 ? <div className="px-3 py-6 text-sm text-zinc-300">{emptyText}</div> : null}
                {rows.map((r, idx) => (
                    <div
                        key={r._k || idx}
                        className={["grid", idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"].join(" ")}
                        style={{ gridTemplateColumns: columns.map((c) => c.w).join(" ") }}
                    >
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

function Tooltip({ open, x, y, title, lines }) {
    if (!open) return null
    return (
        <div className="pointer-events-none fixed z-50" style={{ left: x + 12, top: y + 12 }}>
            <div className="w-[240px] rounded-2xl border border-white/10 bg-zinc-950/95 px-3 py-2 shadow-xl backdrop-blur">
                <div className="text-xs font-semibold text-white/90">{title}</div>
                <div className="mt-1 space-y-1">
                    {lines.map((l, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
                            <span className="text-white/50">{l.k}</span>
                            <span className={["font-semibold", l.tone || "text-white/85"].join(" ")}>{l.v}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function HeatLegend({ labelLeft, labelRight }) {
    return (
        <div className="flex items-center justify-between gap-3 text-xs text-white/45">
            <span>{labelLeft}</span>
            <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-white/10" />
                <span className="h-2.5 w-2.5 rounded bg-white/20" />
                <span className="h-2.5 w-2.5 rounded bg-emerald-400/20" />
                <span className="h-2.5 w-2.5 rounded bg-emerald-400/35" />
                <span className="h-2.5 w-2.5 rounded bg-emerald-400/55" />
                <span className="h-2.5 w-2.5 rounded bg-emerald-400/80" />
            </div>
            <span>{labelRight}</span>
        </div>
    )
}

function levelClass(level) {
    if (level <= 0) return "bg-white/10"
    if (level === 1) return "bg-white/20"
    if (level === 2) return "bg-emerald-400/20"
    if (level === 3) return "bg-emerald-400/35"
    if (level === 4) return "bg-emerald-400/55"
    return "bg-emerald-400/80"
}

function Heatmap({ weeks, onHoverCell, onLeave, onClickCell, selectedKey, isDisabledKey }) {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    return (
        <div className="grid gap-3">
            <div className="grid grid-cols-[36px_1fr] gap-3">
                <div className="pt-[22px]">
                    <div className="grid grid-rows-7 gap-1">
                        {dayNames.map((d, i) => (
                            <div key={d} className="h-3 text-[11px] text-white/35 flex items-center">
                                {i % 2 === 0 ? d : ""}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="min-w-0">
                    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
                        {weeks.map((w, wi) => (
                            <div key={w.key || wi} className="grid grid-rows-7 gap-1">
                                {w.days.map((cell) => {
                                    const isSelected = selectedKey && cell.key === selectedKey
                                    const disabled = isDisabledKey ? isDisabledKey(cell.key) : false
                                    const base = disabled ? "bg-white/5 border-white/5 opacity-60" : levelClass(cell.level)

                                    return (
                                        <button
                                            key={cell.key}
                                            type="button"
                                            disabled={disabled || cell.key.startsWith("empty-")}
                                            className={[
                                                "h-3 w-3 rounded-[4px] border border-transparent transition",
                                                disabled ? base : base,
                                                disabled ? "cursor-not-allowed" : "",
                                                isSelected ? "ring-2 ring-white/60" : disabled ? "" : "hover:ring-2 hover:ring-white/30",
                                            ].join(" ")}
                                            onMouseEnter={(e) => !disabled && onHoverCell(e, cell)}
                                            onMouseMove={(e) => !disabled && onHoverCell(e, cell)}
                                            onMouseLeave={onLeave}
                                            onClick={() => !disabled && onClickCell(cell)}
                                            aria-label={`${cell.key}`}
                                        />
                                    )
                                })}
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
                        {weeks.map((w, wi) => (
                            <div key={wi} className="text-[11px] text-white/35">
                                {w.monthLabel}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ===================== Simple charts (no scroll) ====================== */

function Donut({ segments, centreTop, centreBottom }) {
    const total = Math.max(1, segments.reduce((a, s) => a + (s.value || 0), 0))
    let start = 0
    const stops = segments.map((s) => {
        const pct = ((s.value || 0) / total) * 100
        const from = start
        const to = start + pct
        start = to
        return { ...s, from, to }
    })
    const bg = `conic-gradient(${stops.map((s) => `${s.colour} ${s.from.toFixed(2)}% ${s.to.toFixed(2)}%`).join(", ")})`

    return (
        <div className="grid gap-4 md:grid-cols-[180px_1fr] items-center">
            <div className="relative h-44 w-44 mx-auto md:mx-0">
                <div className="absolute inset-0 rounded-full" style={{ background: bg }} />
                <div className="absolute inset-6 rounded-full bg-zinc-950/80 border border-white/10" />
                <div className="absolute inset-0 flex items-center justify-center text-center">
                    <div>
                        <div className="text-2xl font-bold text-white">{centreTop}</div>
                        <div className="text-xs text-white/40">{centreBottom}</div>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                {segments.map((s) => (
                    <div
                        key={s.label}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/25 px-3 py-2"
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.colour }} />
                            <div className="truncate text-sm font-semibold text-white/85">{s.label}</div>
                        </div>
                        <div className="text-sm font-semibold text-white">{s.right}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function Bars({ title, items, maxValue, tone = "bg-white/20", valueLabel, rightKey = "right" }) {
    return (
        <div className="space-y-3">
            <div className="text-xs font-semibold text-white/55">{title}</div>
            {items.length === 0 ? (
                <div className="text-sm text-white/55">No data.</div>
            ) : (
                items.map((it) => {
                    const pct = maxValue > 0 ? clamp(it.value / maxValue, 0, 1) : 0
                    return (
                        <div key={it.label} className="rounded-2xl border border-white/10 bg-zinc-950/25 p-4 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 truncate text-sm font-semibold text-white/90">{it.label}</div>
                                <div className="shrink-0 text-xs font-semibold text-white/70">{it[rightKey]}</div>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                <div className={["h-full rounded-full", tone].join(" ")} style={{ width: `${pct * 100}%` }} />
                            </div>
                            {valueLabel ? <div className="text-[11px] text-white/40">{valueLabel(it)}</div> : null}
                        </div>
                    )
                })
            )}
        </div>
    )
}

/* ============================ Page =================================== */

export default function AnalyticsPage() {
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState(null)

    const [sales, setSales] = useState([])
    const [items, setItems] = useState([])

    // Range affects KPIs + charts + heatmap
    const [range, setRange] = useState("month")

    // Custom date range
    const [customFrom, setCustomFrom] = useState(() => {
        const d = new Date()
        d.setDate(d.getDate() - 30)
        return toISODate(d)
    })
    const [customTo, setCustomTo] = useState(() => toISODate(new Date()))

    const [categoryFilter, setCategoryFilter] = useState("ALL")

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

    const [tooltip, setTooltip] = useState({ open: false, x: 0, y: 0, title: "", lines: [] })
    const [selectedDayKey, setSelectedDayKey] = useState(null)
    const [heatMetric, setHeatMetric] = useState("revenue") // revenue | spend

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const itemById = useMemo(() => {
        const map = new Map()
        for (const it of items) {
            map.set(String(it.id), { it, c: computeItem(it) })
        }
        return map
    }, [items])

    const categories = useMemo(() => {
        const set = new Set()
        for (const it of items) {
            const c = computeItem(it)
            set.add(c.category || "Other")
        }
        const arr = Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b)))
        return ["ALL", ...arr]
    }, [items])

    // Range bounds for KPIs + charts + heatmap
    const { from: rangeFrom, to: rangeTo } = useMemo(() => getRangeBounds(range, customFrom, customTo), [range, customFrom, customTo])

    // sales -> computed (for selected range)
    const computedSales = useMemo(() => {
        const fromMs = rangeFrom.getTime()
        const toMs = rangeTo.getTime()

        const list = sales
            .map((s) => {
                const dt = parseDate(s.soldAt)
                const t = dt ? dt.getTime() : null
                return { s, dt, t }
            })
            .filter((x) => x.t != null && x.t >= fromMs && x.t <= toMs)
            .map((x) => {
                const s = x.s
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
                const costView = convertMinor(costTotal, cur, currencyView, fx.rates).value

                const itemId = s.itemId != null ? String(s.itemId) : null
                const itemRow = itemId ? itemById.get(itemId) : null
                const category = itemRow?.c?.category || "Other"

                return {
                    ...s,
                    _dt: x.dt,
                    _t: x.t,
                    _dayKey: x.dt ? toISODate(x.dt) : "—",
                    _netView: netView,
                    _profitView: profitView,
                    _costView: costView,
                    _qty: qty,
                    _category: category,
                }
            })

        if (categoryFilter === "ALL") return list.sort((a, b) => (b._t || 0) - (a._t || 0))
        return list.filter((s) => s._category === categoryFilter).sort((a, b) => (b._t || 0) - (a._t || 0))
    }, [sales, rangeFrom, rangeTo, currencyView, fx.rates, itemById, categoryFilter])

    const headline = useMemo(() => {
        let revenue = 0
        let profit = 0
        let units = 0
        let rows = 0
        for (const s of computedSales) {
            revenue += s._netView
            profit += s._profitView
            units += s._qty
            rows += 1
        }
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0
        const aov = rows > 0 ? Math.round(revenue / rows) : 0
        const ppu = units > 0 ? Math.round(profit / units) : 0
        return {
            rows,
            units,
            revenue,
            profit,
            margin: Number.isFinite(margin) ? Math.round(margin * 10) / 10 : 0,
            aov,
            profitPerUnit: ppu,
        }
    }, [computedSales])

    /* ===================== Heatmap build (uses selected range) ===================== */

    const heat = useMemo(() => {
        const from = startOfLocalDay(rangeFrom)
        const to = endOfLocalDay(rangeTo)

        const start = startOfLocalWeek(from)

        const end = new Date(to)
        const endDay = end.getDay()
        const add = endDay === 0 ? 0 : 7 - endDay
        const endAligned = endOfLocalDay(addDays(end, add))

        const daysCount = Math.ceil((endAligned.getTime() - start.getTime()) / 86400000) + 1
        const dayAgg = new Map()

        // Aggregate REVENUE from sales (use computedSales which is already filtered by range)
        for (const s of computedSales) {
            if (!s._dt) continue
            const k = s._dayKey
            if (!dayAgg.has(k)) dayAgg.set(k, { key: k, revenue: 0, spend: 0, profit: 0, units: 0, rows: 0, spendItems: 0 })
            const a = dayAgg.get(k)
            a.revenue += s._netView
            a.profit += s._profitView
            a.units += s._qty
            a.rows += 1
        }

        // Aggregate SPEND from inventory items by creation date (filter by range)
        const fromMs = from.getTime()
        const toMs = to.getTime()
        for (const it of items) {
            const dt = parseDate(it.createdAt)
            if (!dt) continue
            const t = dt.getTime()
            if (t < fromMs || t > toMs) continue

            const c = computeItem(it)
            const cur = c.itemCur || "GBP"
            const spendPence = c.purchaseTotal || 0
            const spendView = convertMinor(spendPence, cur, currencyView, fx.rates).value

            const k = toISODate(dt)
            if (!dayAgg.has(k)) dayAgg.set(k, { key: k, revenue: 0, spend: 0, profit: 0, units: 0, rows: 0, spendItems: 0 })
            const a = dayAgg.get(k)
            a.spend += spendView
            a.spendItems += 1
        }

        const allDays = []
        for (let i = 0; i < daysCount; i++) {
            const d = addDays(start, i)
            const key = toISODate(d)
            const inWindow = d.getTime() >= from.getTime() && d.getTime() <= to.getTime()
            const a = dayAgg.get(key) || { key, revenue: 0, spend: 0, profit: 0, units: 0, rows: 0, spendItems: 0 }
            allDays.push({ ...a, date: d, inYearWindow: inWindow })
        }

        // levels based on selected metric - improved thresholds for better color distribution
        const metricKey = heatMetric === "spend" ? "spend" : "revenue"
        const vals = allDays
            .filter((d) => d.inYearWindow)
            .map((d) => safeNum(d[metricKey], 0))
            .filter((v) => v > 0)
            .sort((a, b) => a - b)

        // Use simpler thresholds: any value > 0 gets color, scale by max
        const maxVal = vals.length > 0 ? vals[vals.length - 1] : 0

        const getLevel = (v) => {
            if (v <= 0) return 0
            if (maxVal <= 0) return 1
            const ratio = v / maxVal
            if (ratio <= 0.1) return 1
            if (ratio <= 0.25) return 2
            if (ratio <= 0.5) return 3
            if (ratio <= 0.75) return 4
            return 5
        }

        const withLevels = allDays.map((d) => ({
            ...d,
            level: getLevel(safeNum(d[metricKey], 0)),
            weekdayIdx: (() => {
                const js = d.date.getDay()
                return js === 0 ? 6 : js - 1
            })(),
        }))

        const weeks = []
        for (let i = 0; i < withLevels.length; i += 7) {
            const chunk = withLevels.slice(i, i + 7)
            const days = new Array(7).fill(null).map((_, idx) => chunk.find((c) => c.weekdayIdx === idx) || null)

            const first = chunk[0]?.date || null
            const monthLabel = first && first.getDate() <= 7 ? monthLabelShort(first) : ""

            weeks.push({
                key: chunk[0]?.key || String(i),
                monthLabel,
                days: days.map(
                    (x) =>
                        x || {
                            key: `empty-${i}`,
                            revenue: 0,
                            spend: 0,
                            profit: 0,
                            units: 0,
                            rows: 0,
                            spendItems: 0,
                            date: new Date(),
                            inYearWindow: false,
                            level: 0,
                            weekdayIdx: 0,
                        }
                ),
            })
        }

        return { from, to, weeks }
    }, [computedSales, items, rangeFrom, rangeTo, currencyView, fx.rates, heatMetric])

    const isDisabledKey = (key) => {
        if (!key || key.startsWith("empty-")) return true
        // Parse as local date
        const d = parseDate(key)
        if (!d) return true
        const t = d.getTime()
        if (Number.isNaN(t)) return true
        // Check if within selected range
        const fromMs = rangeFrom.getTime()
        const toMs = rangeTo.getTime()
        if (t < fromMs || t > toMs) return true
        return false
    }

    /* ===================== Charts ===================== */

    const platformCharts = useMemo(() => {
        const map = new Map()
        for (const s of computedSales) {
            const k = String(s.platform || "OTHER").toUpperCase()
            if (!map.has(k)) map.set(k, { k, revenue: 0, profit: 0, rows: 0, units: 0 })
            const a = map.get(k)
            a.revenue += s._netView
            a.profit += s._profitView
            a.rows += 1
            a.units += s._qty
        }

        const arr = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
        const top = arr.slice(0, 6)
        const total = top.reduce((t, x) => t + x.revenue, 0)

        const palette = [
            "rgba(16,185,129,0.85)",
            "rgba(59,130,246,0.85)",
            "rgba(168,85,247,0.85)",
            "rgba(244,63,94,0.85)",
            "rgba(245,158,11,0.85)",
            "rgba(148,163,184,0.6)",
        ]

        const segments = top.map((x, i) => ({
            label: x.k,
            value: x.revenue,
            colour: palette[i % palette.length],
            right: total > 0 ? `${Math.round((x.revenue / total) * 100)}%` : "—",
        }))

        const maxRev = top.reduce((m, x) => Math.max(m, x.revenue), 0)

        const bars = top.map((x) => ({
            label: x.k,
            value: x.revenue,
            right: `${fmt(currencyView, Math.round(x.revenue))} • ${fmt(currencyView, Math.round(x.profit))}`,
            rows: x.rows,
            units: x.units,
        }))

        return { segments, total, maxRev, bars }
    }, [computedSales, currencyView])

    const categoryBars = useMemo(() => {
        const map = new Map()
        for (const s of computedSales) {
            const k = String(s._category || "Other")
            if (!map.has(k)) map.set(k, { k, revenue: 0, profit: 0, units: 0, rows: 0 })
            const a = map.get(k)
            a.revenue += s._netView
            a.profit += s._profitView
            a.units += s._qty
            a.rows += 1
        }

        const arr = Array.from(map.values())
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 6)
        const max = arr.reduce((m, x) => Math.max(m, Math.max(0, x.profit)), 0)

        const bars = arr.map((x) => ({
            label: x.k,
            value: Math.max(0, x.profit),
            right: `${fmt(currencyView, Math.round(x.profit))} • ${fmt(currencyView, Math.round(x.revenue))}`,
            rows: x.rows,
            units: x.units,
        }))

        return { bars, max }
    }, [computedSales, currencyView])

    /* ===================== Drill-down (move under heatmap) ===================== */

    const selectedDaySales = useMemo(() => {
        if (!selectedDayKey) return []
        return computedSales.filter((s) => s._dayKey === selectedDayKey).slice(0, 12)
    }, [computedSales, selectedDayKey])

    const columnsDay = useMemo(
        () => [
            {
                k: "item",
                t: "Item",
                w: "minmax(0,2fr)",
                render: (r) => <span className="truncate block">{r.itemName || r.item?.name || "—"}</span>,
            },
            { k: "cat", t: "Category", w: "140px", render: (r) => r._category || "Other" },
            { k: "platform", t: "Platform", w: "120px", render: (r) => String(r.platform || "—").toUpperCase() },
            { k: "qty", t: "Qty", w: "70px", render: (r) => String(r._qty || 0) },
            { k: "rev", t: `Revenue (${currencyView})`, w: "150px", render: (r) => fmt(currencyView, Math.round(r._netView)) },
            {
                k: "prof",
                t: `Profit (${currencyView})`,
                w: "150px",
                render: (r) => (
                    <span className={r._profitView >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>
                        {fmt(currencyView, Math.round(r._profitView))}
                    </span>
                ),
            },
        ],
        [currencyView]
    )

    const onHoverCell = (e, cell) => {
        if (!cell || !cell.key || cell.key.startsWith("empty-")) return
        if (isDisabledKey(cell.key)) return

        setTooltip({
            open: true,
            x: e.clientX,
            y: e.clientY,
            title: cell.key,
            lines: [
                ...(heatMetric === "spend"
                    ? [{ k: "Spend", v: fmt(currencyView, Math.round(cell.spend)), tone: "text-white" }]
                    : [{ k: "Revenue", v: fmt(currencyView, Math.round(cell.revenue)), tone: "text-white" }]),
                {
                    k: "Profit",
                    v: fmt(currencyView, Math.round(cell.profit)),
                    tone: cell.profit >= 0 ? "text-emerald-200" : "text-red-200",
                },
                ...(heatMetric === "spend"
                    ? [
                        { k: "Items added", v: String(cell.spendItems || 0), tone: "text-white/85" },
                        { k: "Revenue", v: fmt(currencyView, Math.round(cell.revenue)), tone: "text-white/70" },
                    ]
                    : [{ k: "Spend", v: fmt(currencyView, Math.round(cell.spend)), tone: "text-white/70" }]),
                { k: "Units sold", v: String(cell.units), tone: "text-white/85" },
                { k: "Sales", v: String(cell.rows), tone: "text-white/85" },
            ],
        })
    }

    const onLeave = () => setTooltip((p) => ({ ...p, open: false }))

    const onClickCell = (cell) => {
        if (!cell || !cell.key || cell.key.startsWith("empty-")) return
        if (isDisabledKey(cell.key)) return
        setSelectedDayKey(cell.key)
    }

    const attribution = fx.attributionHtml || '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>'

    return (
        <div className="min-h-[calc(100vh-64px)] bg-black text-zinc-50">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_520px_at_18%_-10%,rgba(59,130,246,0.18),transparent),radial-gradient(900px_520px_at_82%_0%,rgba(16,185,129,0.14),transparent),radial-gradient(900px_520px_at_40%_120%,rgba(168,85,247,0.12),transparent)]" />

            <Tooltip open={tooltip.open} x={tooltip.x} y={tooltip.y} title={tooltip.title} lines={tooltip.lines} />

            <div className="relative mx-auto w-full max-w-[1200px] px-4 py-8">
                {/* Header */}
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
                        <p className="mt-1 text-sm text-white/50">
                            Spend tracks inventory by date added. Revenue tracks sales by date sold.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/program"
                            className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/85 hover:bg-white/10 flex items-center"
                        >
                            Dashboard
                        </Link>

                        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-xs font-semibold text-white/55">Display</div>
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
                    <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {err}
                    </div>
                ) : null}

                {/* Controls */}
                <div className="mb-6 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: "today", label: "Today" },
                                { value: "week", label: "Week" },
                                { value: "month", label: "Month" },
                                { value: "year", label: "Year" },
                                { value: "custom", label: "Custom" },
                            ].map((o) => (
                                <button
                                    key={o.value}
                                    onClick={() => {
                                        setRange(o.value)
                                        setSelectedDayKey(null)
                                    }}
                                    className={[
                                        "px-4 py-2 rounded-2xl text-sm font-semibold transition border",
                                        range === o.value
                                            ? "bg-white text-black border-white/10"
                                            : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border-white/10",
                                    ].join(" ")}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xs font-semibold text-white/55">Category</div>
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => {
                                        setCategoryFilter(e.target.value)
                                        setSelectedDayKey(null)
                                    }}
                                    className="h-10 rounded-2xl border border-white/10 bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none"
                                >
                                    {categories.map((c) => (
                                        <option key={c} value={c} className="bg-zinc-950 text-zinc-100">
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                                Showing: <span className="font-semibold text-white">{rangeFrom.toLocaleDateString()} – {rangeTo.toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    {range === "custom" ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-xs font-semibold text-zinc-300">From</div>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => {
                                    setCustomFrom(e.target.value)
                                    setSelectedDayKey(null)
                                }}
                                className="h-10 rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm font-semibold text-white/90 outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10 [color-scheme:dark]"
                            />
                            <div className="text-xs font-semibold text-zinc-300">To</div>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => {
                                    setCustomTo(e.target.value)
                                    setSelectedDayKey(null)
                                }}
                                className="h-10 rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm font-semibold text-white/90 outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10 [color-scheme:dark]"
                            />
                        </div>
                    ) : null}
                </div>

                {/* KPIs (profit + revenue first) */}
                <div className="mb-6 grid gap-4 md:grid-cols-4">
                    <KPI
                        label={`Profit (${currencyView})`}
                        value={loading ? "—" : fmt(currencyView, Math.round(headline.profit))}
                        sub={loading ? "—" : `Margin ${headline.margin}% • profit/unit ${fmt(currencyView, Math.round(headline.profitPerUnit))}`}
                        tone={headline.profit >= 0 ? "good" : "bad"}
                    />
                    <KPI
                        label={`Revenue (${currencyView})`}
                        value={loading ? "—" : fmt(currencyView, Math.round(headline.revenue))}
                        sub={loading ? "—" : `AOV ${fmt(currencyView, Math.round(headline.aov))}`}
                        tone="good"
                    />
                    <KPI label="Units sold" value={loading ? "—" : String(headline.units)} sub="Sum of quantities" />
                    <KPI label="Sales (rows)" value={loading ? "—" : String(headline.rows)} sub="Records in selected range" />
                </div>

                {/* Heatmap + drilldown kept together */}
                <Card
                    title={`${heatMetric === "spend" ? "Inventory spend" : "Revenue"} heatmap`}
                    subtitle={`${rangeFrom.toLocaleDateString()} → ${rangeTo.toLocaleDateString()} • ${heatMetric === "spend" ? "Items by date added" : "Sales by date sold"}`}
                    right={
                        <div className="flex flex-wrap items-center gap-2">
                            <Segmented
                                value={heatMetric}
                                onChange={setHeatMetric}
                                options={[
                                    { value: "revenue", label: "Revenue" },
                                    { value: "spend", label: "Spend" },
                                ]}
                            />
                            <div className="text-xs text-white/45">{categoryFilter === "ALL" ? "All categories" : categoryFilter}</div>
                        </div>
                    }
                >
                    {heat.weeks.length === 0 ? (
                        <div className="text-sm text-white/55">No data.</div>
                    ) : (
                        <div className="space-y-4">
                            <HeatLegend labelLeft="Less" labelRight="More" />

                            <Heatmap
                                weeks={heat.weeks}
                                onHoverCell={onHoverCell}
                                onLeave={onLeave}
                                onClickCell={onClickCell}
                                selectedKey={selectedDayKey}
                                isDisabledKey={isDisabledKey}
                            />

                            <div className="text-xs text-white/45">
                                {heatMetric === "spend"
                                    ? "Darker = more spend on that day. Grey squares are outside the selected range."
                                    : "Darker = more revenue on that day. Grey squares are outside the selected range."}
                            </div>

                            {/* Drilldown directly under heatmap */}
                            <div className="mt-2 rounded-3xl border border-white/10 bg-zinc-950/20 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                    <div className="text-sm font-semibold text-white/90">
                                        {selectedDayKey ? `Day drill-down: ${selectedDayKey}` : "Day drill-down"}
                                    </div>
                                    {selectedDayKey ? (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDayKey(null)}
                                            className="h-9 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/80 hover:bg-white/10"
                                        >
                                            Clear
                                        </button>
                                    ) : null}
                                </div>

                                {selectedDayKey ? (
                                    <Table
                                        columns={columnsDay}
                                        rows={selectedDaySales.map((r) => ({ ...r, _k: r.id }))}
                                        emptyText="No sales on this day."
                                    />
                                ) : (
                                    <div className="text-sm text-white/55">Click a square inside the selected range.</div>
                                )}
                            </div>
                        </div>
                    )}
                </Card>

                {/* Rest of analytics (same flow, no harsh separation) */}
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <Card title="Platform revenue split" subtitle="Pie shows revenue share. Bar shows revenue and profit per platform.">
                        {platformCharts.segments.length === 0 ? (
                            <div className="text-sm text-white/55">No platform data.</div>
                        ) : (
                            <div className="space-y-6">
                                <Donut
                                    segments={platformCharts.segments}
                                    centreTop={fmt(currencyView, Math.round(platformCharts.total))}
                                    centreBottom="platform revenue"
                                />
                                <Bars
                                    title="Top platforms"
                                    items={platformCharts.bars}
                                    maxValue={platformCharts.maxRev}
                                    tone="bg-white/20"
                                    valueLabel={(it) => `${it.rows} sale(s) • ${it.units} unit(s)`}
                                />
                            </div>
                        )}
                    </Card>

                    <Card title="Category performance" subtitle="Top categories by profit (selected range).">
                        <Bars
                            title="Top categories"
                            items={categoryBars.bars}
                            maxValue={categoryBars.max}
                            tone="bg-emerald-400/30"
                            valueLabel={(it) => `${it.rows} sale(s) • ${it.units} unit(s)`}
                            rightKey="right"
                        />
                        <div className="mt-3 text-xs text-white/45">
                            Profit bars use positive profit only for fill length (negative profit still shows in the label).
                        </div>
                    </Card>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
                    <div>{fx.nextUpdateUtc ? `FX next update: ${fx.nextUpdateUtc}` : "FX next update: —"}</div>
                    <div className="flex items-center gap-2">
                        <span>Attribution:</span>
                        <span className="text-white/55 underline underline-offset-2" dangerouslySetInnerHTML={{ __html: attribution }} />
                    </div>
                </div>
            </div>
        </div>
    )
}