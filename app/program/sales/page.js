// app/program/sales/page.js
"use client"

import { useEffect, useMemo, useState } from "react"

const CURRENCY_META = {
    GBP: { symbol: "£", label: "GBP" },
    USD: { symbol: "$", label: "USD" },
    EUR: { symbol: "€", label: "EUR" },
    CAD: { symbol: "$", label: "CAD" },
    AUD: { symbol: "$", label: "AUD" },
    JPY: { symbol: "¥", label: "JPY" },
}

const PLATFORMS = [
    ["NONE", "None"],
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

const fmt = (currency, minorUnits) => {
    const c = CURRENCY_META[currency] || CURRENCY_META.GBP
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

const safeStr = (x) => String(x ?? "").trim()

/**
 * NOTES payload for items (matches inventory page)
 * v4:
 *  - purchaseTotalPence: total all-in purchase cost PER UNIT
 *  - estimatedSalePence: estimated sale PER UNIT (unlisted)
 *  - listings: [{ platform, url, pricePence }] (per unit)
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

const encodeNotes = (plainNotes, meta) => {
    const payload = {
        v: 4,
        notes: String(plainNotes || "").trim() || "",
        meta: meta && typeof meta === "object" ? meta : {},
    }
    return JSON.stringify(payload)
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
        estimatedSalePence != null
            ? estimatedSalePence
            : legacyBest != null
                ? legacyBest
                : legacyWorst != null
                    ? legacyWorst
                    : null

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

function computeItem(it) {
    const decoded = decodeNotes(it.notes)
    const meta = normaliseMeta(decoded.meta)

    const itemCur = meta.currency
    const q = Number(it.quantity) || 0
    const status = meta.status

    const purchaseTotalPerUnit = meta.purchaseTotalPence > 0 ? meta.purchaseTotalPence : Number(it.costPence) || 0
    const purchaseTotal = purchaseTotalPerUnit * q

    const firstListing = meta.listings?.[0] || null
    const listingPricePerUnit = firstListing?.pricePence ?? null

    const salePricePerUnit =
        status === "LISTED" || status === "SOLD" ? listingPricePerUnit : meta.estimatedSalePence == null ? null : meta.estimatedSalePence

    const salePriceTotal = salePricePerUnit == null ? null : salePricePerUnit * q

    const profitPerUnit = salePricePerUnit == null ? null : salePricePerUnit - purchaseTotalPerUnit
    const profitTotal = profitPerUnit == null ? null : profitPerUnit * q

    return {
        notesPlain: decoded.notes,
        meta,
        itemCur,
        q,
        status,
        purchaseTotalPerUnit,
        purchaseTotal,
        listingPricePerUnit,
        salePricePerUnit,
        salePriceTotal,
        profitPerUnit,
        profitTotal,
    }
}

function Modal({ title, onClose, children, footer, maxWidth = "max-w-3xl" }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
            <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
            <div className={["relative w-full rounded-3xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur", maxWidth].join(" ")}>
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="text-lg font-semibold text-white">{title}</div>
                    <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10">
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

function StatCard({ label, value, sub }) {
    return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{label}</div>
            <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
            <div className="mt-1 text-xs text-zinc-300">{sub}</div>
        </div>
    )
}

function Row({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div className="text-xs font-semibold text-zinc-300">{label}</div>
            <div className="text-sm text-white">{value}</div>
        </div>
    )
}

function Snapshot({ label, value, good = false }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] font-semibold text-zinc-300">{label}</div>
            <div className={["mt-1 text-sm font-semibold", good ? "text-emerald-200" : "text-white"].join(" ")}>{value}</div>
        </div>
    )
}

function linkify(url) {
    const u = String(url || "").trim()
    if (!u) return null
    if (/^https?:\/\//i.test(u)) return u
    return `https://${u}`
}

function IconButton({ title, onClick, className = "", children }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={["inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white/90 transition hover:bg-white/15", className].join(" ")}
        >
            {children}
        </button>
    )
}

function TrashIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        </svg>
    )
}

/**
 * SALES DATA MODEL (frontend assumptions)
 * - GET /api/sales -> array of:
 *   { id, itemId, itemName, sku, platform, soldAt, quantitySold, salePricePerUnitPence, feesPence, netPence, currency, notes, createdAt }
 *
 * - POST /api/sales payload:
 *   { itemId, platform, soldAt, quantitySold, salePricePerUnitPence, feesPence, currency, notes }
 *
 * INVENTORY UPDATE LOGIC:
 * - PATCH /api/items/:id with:
 *   { quantity, notes, costPence }
 * and notes.meta.status set to SOLD if remaining 0, else LISTED (or UNLISTED)
 */

export default function SalesPage() {
    const [items, setItems] = useState([])
    const [sales, setSales] = useState([])

    const [loadingItems, setLoadingItems] = useState(true)
    const [loadingSales, setLoadingSales] = useState(true)

    const [toast, setToast] = useState({ type: "", msg: "" })

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

    const [search, setSearch] = useState("")

    const [addOpen, setAddOpen] = useState(false)
    const [addSaving, setAddSaving] = useState(false)

    const [sellForm, setSellForm] = useState(() => ({
        itemId: "",
        platform: "EBAY",
        soldAt: new Date().toISOString().slice(0, 16), // yyyy-mm-ddThh:mm (local input)
        quantitySold: 1,
        salePricePerUnit: "0.00",
        fees: "0.00",
        notes: "",
        removeFromInventory: true, // if true: decrement quantity and possibly mark SOLD
        removeMode: "DECREMENT", // DECREMENT or DELETE
    }))

    const [selectedSale, setSelectedSale] = useState(null)
    const [detailOpen, setDetailOpen] = useState(false)

    const showToast = (type, msg) => {
        setToast({ type, msg })
        window.clearTimeout(showToast._t)
        showToast._t = window.setTimeout(() => setToast({ type: "", msg: "" }), 1800)
    }

    const loadItems = async () => {
        setLoadingItems(true)
        try {
            const res = await fetch("/api/items", { cache: "no-store" })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Failed to load items (${res.status})`)
            setItems(Array.isArray(data) ? data : [])
        } catch (e) {
            showToast("error", e?.message || "Failed to load items")
            setItems([])
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
            showToast("error", e?.message || "Failed to load sales")
            setSales([])
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

    useEffect(() => {
        if (typeof window !== "undefined") localStorage.setItem("rt_currency_view", currencyView)
    }, [currencyView])

    const inventoryOptions = useMemo(() => {
        const alive = items
            .map((it) => ({ it, c: computeItem(it) }))
            .filter(({ it, c }) => (Number(it.quantity) || 0) > 0 && String(c.status || "").toUpperCase() !== "SOLD")

        alive.sort((a, b) => String(a.it.name || "").localeCompare(String(b.it.name || "")))
        return alive
    }, [items])

    const selectedItem = useMemo(() => {
        const id = sellForm.itemId
        if (!id) return null
        return items.find((x) => String(x.id) === String(id)) || null
    }, [sellForm.itemId, items])

    const selectedItemComputed = useMemo(() => (selectedItem ? computeItem(selectedItem) : null), [selectedItem])

    const sellQty = Math.max(0, safeInt(sellForm.quantitySold, 0))
    const sellPricePerUnitPence = parseMoneyToPence(sellForm.salePricePerUnit)
    const sellFeesPence = parseMoneyToPence(sellForm.fees)

    const sellGrossPence = sellQty * sellPricePerUnitPence
    const sellNetPence = Math.max(0, sellGrossPence - sellFeesPence)

    const purchasePerUnitPence = selectedItemComputed ? selectedItemComputed.purchaseTotalPerUnit : 0
    const purchaseTotalForSoldUnitsPence = sellQty * (Number(purchasePerUnitPence) || 0)
    const profitPence = sellNetPence - purchaseTotalForSoldUnitsPence

    const openAdd = () => {
        const first = inventoryOptions[0]?.it?.id ? String(inventoryOptions[0].it.id) : ""
        setSellForm({
            itemId: first,
            platform: "EBAY",
            soldAt: new Date().toISOString().slice(0, 16),
            quantitySold: 1,
            salePricePerUnit: "0.00",
            fees: "0.00",
            notes: "",
            removeFromInventory: true,
            removeMode: "DECREMENT",
        })
        setAddOpen(true)
    }

    const openSaleDetail = (s) => {
        setSelectedSale(s)
        setDetailOpen(true)
    }

    const deleteSale = async (saleId) => {
        try {
            const res = await fetch(`/api/sales/${saleId}`, { method: "DELETE" })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Delete failed (${res.status})`)
            showToast("ok", "Sale deleted")
            setDetailOpen(false)
            setSelectedSale(null)
            await loadSales()
        } catch (e) {
            showToast("error", e?.message || "Delete failed")
        }
    }

    const submitSale = async (e) => {
        e?.preventDefault?.()

        if (!sellForm.itemId) return showToast("error", "Select an item")
        const it = selectedItem
        if (!it) return showToast("error", "Item not found")

        const c = computeItem(it)
        const available = Number(it.quantity) || 0
        if (sellQty <= 0) return showToast("error", "Quantity sold must be at least 1")
        if (sellQty > available) return showToast("error", "Quantity sold exceeds inventory quantity")

        if (sellPricePerUnitPence <= 0) return showToast("error", "Sale price per unit is required")

        const platform = (sellForm.platform || "OTHER").toUpperCase()

        // soldAt from datetime-local input -> store ISO (best effort)
        const soldAtLocal = String(sellForm.soldAt || "").trim()
        const soldAt = soldAtLocal ? new Date(soldAtLocal).toISOString() : new Date().toISOString()

        const salePayload = {
            itemId: String(it.id),
            itemName: it.name || null,
            sku: it.sku || null,

            platform,
            soldAt,

            quantitySold: sellQty,
            salePricePerUnitPence: sellPricePerUnitPence,
            feesPence: sellFeesPence,

            netPence: sellNetPence,
            currency: c.itemCur || "GBP",

            notes: String(sellForm.notes || "").trim() || null,
        }

        setAddSaving(true)
        try {
            // 1) Create sale record
            const resSale = await fetch("/api/sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(salePayload),
            })
            const saleData = await resSale.json().catch(() => null)
            if (!resSale.ok) throw new Error(saleData?.error || `Create sale failed (${resSale.status})`)

            // 2) Update inventory (remove from inventory)
            if (sellForm.removeFromInventory) {
                if (sellForm.removeMode === "DELETE") {
                    const resDel = await fetch(`/api/items/${it.id}`, { method: "DELETE" })
                    const delData = await resDel.json().catch(() => null)
                    if (!resDel.ok) throw new Error(delData?.error || `Inventory delete failed (${resDel.status})`)
                } else {
                    const remaining = Math.max(0, available - sellQty)
                    const decoded = decodeNotes(it.notes)
                    const meta = normaliseMeta(decoded.meta)

                    const nextStatus = remaining === 0 ? "SOLD" : "LISTED"
                    const nextMeta = {
                        ...meta,
                        status: nextStatus,
                    }

                    // If fully sold, store the realised sale (per unit) as the first listing price for consistency
                    // and keep any URLs unchanged
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
                        name: it.name,
                        sku: it.sku || null,
                        quantity: remaining,
                        costPence: Number(nextMeta.purchaseTotalPence || it.costPence || 0) || 0,
                        notes: encodeNotes(decoded.notes, { ...nextMeta, currency: meta.currency || c.itemCur || "GBP" }),
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
            setAddOpen(false)

            await Promise.all([loadSales(), loadItems()])
        } catch (e2) {
            showToast("error", e2?.message || "Failed to record sale")
        } finally {
            setAddSaving(false)
        }
    }

    const filteredSales = useMemo(() => {
        const q = String(search || "").trim().toLowerCase()
        if (!q) return sales

        return sales.filter((s) => {
            const name = String(s.itemName || s.item?.name || "").toLowerCase()
            const sku = String(s.sku || s.itemSku || "").toLowerCase()
            const platform = String(s.platform || "").toLowerCase()
            const notes = String(s.notes || "").toLowerCase()
            const id = String(s.id || "").toLowerCase()
            return name.includes(q) || sku.includes(q) || platform.includes(q) || notes.includes(q) || id.includes(q)
        })
    }, [sales, search])

    const totals = useMemo(() => {
        let gross = 0
        let net = 0
        let fees = 0
        let profit = 0
        let count = 0

        for (const s of filteredSales) {
            const cur = (s.currency || "GBP").toUpperCase()
            const qty = Number(s.quantitySold || 0) || 0
            const ppu = Number(s.salePricePerUnitPence || 0) || 0
            const grossPence = qty * ppu

            const feesPence = Number(s.feesPence || 0) || 0
            const netPence = s.netPence != null ? Number(s.netPence) || 0 : Math.max(0, grossPence - feesPence)

            // best-effort profit if cost exists on sale record
            const costPence = Number(s.costTotalPence || 0) || 0
            const profitPence = Number.isFinite(costPence) && costPence > 0 ? netPence - costPence : 0

            gross += convertMinor(grossPence, cur, currencyView, fx.rates).value
            net += convertMinor(netPence, cur, currencyView, fx.rates).value
            fees += convertMinor(feesPence, cur, currencyView, fx.rates).value
            profit += convertMinor(profitPence, cur, currencyView, fx.rates).value
            count += 1
        }

        return { count, gross, net, fees, profit }
    }, [filteredSales, currencyView, fx.rates])

    const ROW_H = "h-[58px]"
    const HEAD_H = "h-[42px]"
    const CELL_PAD = "px-3"
    const CELL_Y = "py-2"
    const HEADER_BG = "bg-white/5"

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-50">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Sales</h1>
                        <p className="mt-1 text-sm text-zinc-300">Record a sale, and it will remove units from inventory (decrement or delete).</p>
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

                        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-9 w-[260px] rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                placeholder="Search item, SKU, platform, notes…"
                            />
                            {search ? (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    className="h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white/90 hover:bg-white/15"
                                >
                                    Clear
                                </button>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                loadSales()
                                loadItems()
                            }}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Refresh
                        </button>

                        <button
                            type="button"
                            onClick={openAdd}
                            disabled={loadingItems || inventoryOptions.length === 0}
                            className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Record sale
                        </button>
                    </div>
                </div>

                {toast.msg ? (
                    <div className="mb-5">
                        <div
                            className={[
                                "rounded-2xl border px-4 py-3 text-sm",
                                toast.type === "error" ? "border-red-400/20 bg-red-500/10 text-red-100" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
                            ].join(" ")}
                        >
                            {toast.msg}
                        </div>
                    </div>
                ) : null}

                <div className="mb-6 grid gap-4 md:grid-cols-4">
                    <StatCard label="Sales (rows)" value={totals.count} sub="Visible sales records" />
                    <StatCard label={`Gross (${currencyView})`} value={fmt(currencyView, totals.gross)} sub="Qty × sale price (sum)" />
                    <StatCard label={`Fees (${currencyView})`} value={fmt(currencyView, totals.fees)} sub="Fees (sum)" />
                    <StatCard label={`Net (${currencyView})`} value={fmt(currencyView, totals.net)} sub="Gross - fees (sum)" />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Sales history</div>
                            <div className="text-xs text-zinc-300">{loadingSales ? "Loading…" : `${filteredSales.length} sale(s)`} • click a row for details</div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 overflow-hidden">
                        <div className={["grid border-b border-white/10", HEAD_H, HEADER_BG].join(" ")} style={{ gridTemplateColumns: "minmax(0,2fr) 120px 110px 150px 150px 110px 60px" }}>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Item</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Platform</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Qty</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Sale / unit</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Net</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Sold at</div>
                            <div className={["flex min-w-0 items-center justify-end text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}> </div>
                        </div>

                        <div className="divide-y divide-white/10">
                            {!loadingSales && filteredSales.length === 0 ? (
                                <div className={["text-sm text-zinc-300", CELL_PAD, "py-6"].join(" ")}>No sales yet.</div>
                            ) : null}

                            {filteredSales.map((s, idx) => {
                                const rowBg = idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"
                                const cur = (s.currency || "GBP").toUpperCase()
                                const qty = Number(s.quantitySold || 0) || 0
                                const ppu = Number(s.salePricePerUnitPence || 0) || 0
                                const grossPence = qty * ppu
                                const feesPence = Number(s.feesPence || 0) || 0
                                const netPence = s.netPence != null ? Number(s.netPence) || 0 : Math.max(0, grossPence - feesPence)

                                const ppuView = fmt(currencyView, convertMinor(ppu, cur, currencyView, fx.rates).value)
                                const netView = fmt(currencyView, convertMinor(netPence, cur, currencyView, fx.rates).value)

                                const dt = s.soldAt ? new Date(s.soldAt) : null
                                const soldAtLabel = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString() : "—"

                                return (
                                    <div
                                        key={s.id || `${s.itemId}-${idx}`}
                                        className={["grid cursor-pointer", ROW_H, rowBg, "hover:bg-white/5"].join(" ")}
                                        style={{ gridTemplateColumns: "minmax(0,2fr) 120px 110px 150px 150px 110px 60px" }}
                                        onClick={() => openSaleDetail(s)}
                                    >
                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <div className="min-w-0">
                                                <div className="truncate text-[13px] font-semibold text-white">{s.itemName || s.item?.name || "—"}</div>
                                                <div className="mt-0.5 truncate text-[11px] text-zinc-400">{s.sku || s.itemSku || "—"}</div>
                                            </div>
                                        </div>

                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <span className="truncate text-[13px] text-zinc-200">{String(s.platform || "—").toUpperCase()}</span>
                                        </div>

                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <span className="truncate text-[13px] text-zinc-200">{qty}</span>
                                        </div>

                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <span className="truncate text-[13px] text-white">{ppuView}</span>
                                        </div>

                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <span className="truncate text-[13px] font-semibold text-emerald-200">{netView}</span>
                                        </div>

                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <span className="truncate text-[13px] text-zinc-200">{soldAtLabel}</span>
                                        </div>

                                        <div className={["flex items-center justify-end gap-2", CELL_PAD, CELL_Y].join(" ")} onClick={(e) => e.stopPropagation()}>
                                            <IconButton
                                                title="Delete sale"
                                                onClick={() => deleteSale(s.id)}
                                                className="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                                            >
                                                <TrashIcon />
                                            </IconButton>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
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

            {/* RECORD SALE MODAL */}
            {addOpen ? (
                <Modal
                    title="Record sale"
                    onClose={() => setAddOpen(false)}
                    maxWidth="max-w-4xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setAddOpen(false)} className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10">
                                Cancel
                            </button>
                            <button type="submit" form="rt-sale-form" disabled={addSaving} className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60">
                                {addSaving ? "Saving…" : "Save sale"}
                            </button>
                        </div>
                    }
                >
                    <form id="rt-sale-form" onSubmit={submitSale} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Item *" className="md:col-span-2">
                                <select
                                    value={sellForm.itemId}
                                    onChange={(e) => setSellForm((p) => ({ ...p, itemId: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                >
                                    {inventoryOptions.length === 0 ? <option value="">No inventory items available</option> : null}
                                    {inventoryOptions.map(({ it, c }) => (
                                        <option key={it.id} value={String(it.id)}>
                                            {it.name} {it.sku ? `• ${it.sku}` : ""} • qty {Number(it.quantity) || 0} • buy {fmt(c.itemCur, c.purchaseTotalPerUnit)}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Platform">
                                <select
                                    value={sellForm.platform}
                                    onChange={(e) => setSellForm((p) => ({ ...p, platform: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                >
                                    {PLATFORMS.filter(([v]) => v !== "NONE").map(([v, l]) => (
                                        <option key={v} value={v}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Sold at">
                                <input
                                    type="datetime-local"
                                    value={sellForm.soldAt}
                                    onChange={(e) => setSellForm((p) => ({ ...p, soldAt: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                />
                            </Field>

                            <Field label="Quantity sold *">
                                <input
                                    type="number"
                                    min={0}
                                    value={sellForm.quantitySold}
                                    onChange={(e) => setSellForm((p) => ({ ...p, quantitySold: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                />
                            </Field>

                            <Field label={`Sale price per unit * (${selectedItemComputed?.itemCur || "GBP"})`}>
                                <input
                                    inputMode="decimal"
                                    value={sellForm.salePricePerUnit}
                                    onChange={(e) => setSellForm((p) => ({ ...p, salePricePerUnit: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="0.00"
                                />
                            </Field>

                            <Field label={`Fees (total) (${selectedItemComputed?.itemCur || "GBP"})`} className="md:col-span-2">
                                <input
                                    inputMode="decimal"
                                    value={sellForm.fees}
                                    onChange={(e) => setSellForm((p) => ({ ...p, fees: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="0.00"
                                />
                            </Field>

                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4 md:col-span-2">
                                <div className="grid gap-2 sm:grid-cols-4">
                                    <Snapshot label="Gross" value={fmt(selectedItemComputed?.itemCur || "GBP", sellGrossPence)} good />
                                    <Snapshot label="Fees" value={fmt(selectedItemComputed?.itemCur || "GBP", sellFeesPence)} />
                                    <Snapshot label="Net" value={fmt(selectedItemComputed?.itemCur || "GBP", sellNetPence)} good />
                                    <Snapshot
                                        label="Profit"
                                        value={fmt(selectedItemComputed?.itemCur || "GBP", profitPence)}
                                        good={profitPence >= 0}
                                    />
                                </div>

                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <div className="text-[11px] font-semibold text-zinc-300">Cost basis</div>
                                        <div className="mt-1 text-sm font-semibold text-white">
                                            {fmt(selectedItemComputed?.itemCur || "GBP", purchaseTotalForSoldUnitsPence)} ({sellQty} × {fmt(selectedItemComputed?.itemCur || "GBP", purchasePerUnitPence)})
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <div className="text-[11px] font-semibold text-zinc-300">Inventory impact</div>
                                        <div className="mt-1 text-sm font-semibold text-white">
                                            {selectedItem
                                                ? `Qty ${Number(selectedItem.quantity) || 0} → ${Math.max(0, (Number(selectedItem.quantity) || 0) - sellQty)}`
                                                : "—"}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-white">Remove from inventory</div>
                                        <div className="mt-1 text-xs text-zinc-300">After saving the sale, apply the inventory change automatically.</div>
                                    </div>

                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!sellForm.removeFromInventory}
                                            onChange={(e) => setSellForm((p) => ({ ...p, removeFromInventory: e.target.checked }))}
                                            className="h-4 w-4 rounded border-white/20 bg-transparent accent-white"
                                        />
                                        <span className="text-sm font-semibold text-white/90">Enabled</span>
                                    </label>
                                </div>

                                {sellForm.removeFromInventory ? (
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={() => setSellForm((p) => ({ ...p, removeMode: "DECREMENT" }))}
                                            className={[
                                                "h-11 rounded-2xl border px-4 text-sm font-semibold transition",
                                                sellForm.removeMode === "DECREMENT" ? "border-white/10 bg-white text-zinc-950" : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                                            ].join(" ")}
                                        >
                                            Decrement quantity
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setSellForm((p) => ({ ...p, removeMode: "DELETE" }))}
                                            className={[
                                                "h-11 rounded-2xl border px-4 text-sm font-semibold transition",
                                                sellForm.removeMode === "DELETE" ? "border-red-400/20 bg-red-500/10 text-red-100" : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                                            ].join(" ")}
                                        >
                                            Delete item row
                                        </button>

                                        {sellForm.removeMode === "DELETE" ? (
                                            <div className="sm:col-span-2 text-xs text-zinc-300">
                                                Delete will remove the entire inventory row (even if only some units are sold). Decrement is recommended.
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            <Field label="Notes" className="md:col-span-2">
                                <textarea
                                    value={sellForm.notes}
                                    onChange={(e) => setSellForm((p) => ({ ...p, notes: e.target.value }))}
                                    className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="Optional… e.g. returned buyer, partial refund, bundle info…"
                                />
                            </Field>

                            {selectedItemComputed?.meta?.listings?.length ? (
                                <div className="md:col-span-2 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                    <div className="text-xs font-semibold text-zinc-300">Existing listing links</div>
                                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                                        {selectedItemComputed.meta.listings.slice(0, 4).map((l, idx) => {
                                            const href = linkify(l.url)
                                            return (
                                                <a
                                                    key={`${l.platform}-${idx}`}
                                                    href={href || "#"}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(ev) => {
                                                        if (!href) ev.preventDefault()
                                                    }}
                                                    className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-200 hover:bg-white/10"
                                                    title={href || "No URL"}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="font-semibold">{String(l.platform || "OTHER").toUpperCase()}</div>
                                                        <div className="text-zinc-300">{l.pricePence == null ? "No price" : fmt(selectedItemComputed.itemCur, Number(l.pricePence) || 0)}</div>
                                                    </div>
                                                    <div className="mt-1 truncate text-zinc-400">{href || "No URL"}</div>
                                                </a>
                                            )
                                        })}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </form>
                </Modal>
            ) : null}

            {/* SALE DETAIL MODAL */}
            {detailOpen && selectedSale ? (
                <Modal
                    title="Sale details"
                    onClose={() => {
                        setDetailOpen(false)
                        setSelectedSale(null)
                    }}
                    maxWidth="max-w-4xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button
                                type="button"
                                onClick={() => deleteSale(selectedSale.id)}
                                className="h-11 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/15"
                            >
                                Delete sale
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setDetailOpen(false)
                                    setSelectedSale(null)
                                }}
                                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10"
                            >
                                Close
                            </button>
                        </div>
                    }
                >
                    <SaleDetail sale={selectedSale} currencyView={currencyView} rates={fx.rates} />
                </Modal>
            ) : null}
        </div>
    )
}

function SaleDetail({ sale, currencyView, rates }) {
    const cur = (sale.currency || "GBP").toUpperCase()
    const qty = Number(sale.quantitySold || 0) || 0
    const ppu = Number(sale.salePricePerUnitPence || 0) || 0
    const grossPence = qty * ppu
    const feesPence = Number(sale.feesPence || 0) || 0
    const netPence = sale.netPence != null ? Number(sale.netPence) || 0 : Math.max(0, grossPence - feesPence)

    const toView = (minor) => fmt(currencyView, convertMinor(minor, cur, currencyView, rates).value)

    const soldAt = sale.soldAt ? new Date(sale.soldAt) : null
    const soldAtLabel = soldAt && !Number.isNaN(soldAt.getTime()) ? soldAt.toLocaleString() : "—"

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-300">Sale</div>
                <Row label="Item" value={sale.itemName || sale.item?.name || "—"} />
                <Row label="SKU" value={sale.sku || sale.itemSku || "—"} />
                <Row label="Platform" value={String(sale.platform || "—").toUpperCase()} />
                <Row label="Sold at" value={soldAtLabel} />
                <Row label="Quantity" value={qty} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-300">Finance</div>
                <Row label={`Sale / unit (${cur})`} value={fmt(cur, ppu)} />
                <Row label={`Gross (${cur})`} value={fmt(cur, grossPence)} />
                <Row label={`Fees (${cur})`} value={fmt(cur, feesPence)} />
                <Row label={`Net (${cur})`} value={fmt(cur, netPence)} />

                <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <Snapshot label={`Gross (${currencyView})`} value={toView(grossPence)} good />
                        <Snapshot label={`Fees (${currencyView})`} value={toView(feesPence)} />
                        <Snapshot label={`Net (${currencyView})`} value={toView(netPence)} good />
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 md:col-span-2">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-300">Notes</div>
                <div className="text-sm text-zinc-200 whitespace-pre-wrap">{sale.notes || "—"}</div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 md:col-span-2">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-300">Meta</div>
                <Row label="Sale ID" value={<code className="rounded bg-white/5 px-2 py-1 text-xs">{sale.id || "—"}</code>} />
                <Row label="Item ID" value={<code className="rounded bg-white/5 px-2 py-1 text-xs">{sale.itemId || "—"}</code>} />
                <Row label="Created" value={sale.createdAt ? new Date(sale.createdAt).toLocaleString() : "—"} />
            </div>
        </div>
    )
}
