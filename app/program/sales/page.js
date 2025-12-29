// FILE: app/program/sales/page.js
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
    const c = CURRENCY_META[(currency || "GBP").toUpperCase()] || CURRENCY_META.GBP
    const n = Number.isFinite(minorUnits) ? minorUnits : 0
    const sign = n < 0 ? "-" : ""
    return `${sign}${c.symbol}${(Math.abs(n) / 100).toFixed(2)}`
}

// rates map is "units per USD" (i.e. 1 USD -> rates[CUR] CUR)
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

function computeItem(it) {
    const decoded = decodeNotes(it.notes)
    const meta = normaliseMeta(decoded.meta)

    const itemCur = meta.currency
    const q = Number(it.quantity) || 0
    const status = meta.status

    const purchaseTotalPerUnit = meta.purchaseTotalPence > 0 ? meta.purchaseTotalPence : 0
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
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = prev
        }
    }, [])

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
            <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />

            <div
                className={[
                    "relative w-full overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur",
                    "max-h-[calc(100vh-2rem)]",
                    "flex flex-col",
                    maxWidth,
                ].join(" ")}
            >
                <div className="shrink-0 p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="text-lg font-semibold text-white">{title}</div>
                        <button
                            onClick={onClose}
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                        >
                            Close
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                    <div className="min-w-0">{children}</div>
                </div>

                {footer ? <div className="shrink-0 border-t border-white/10 p-5">{footer}</div> : null}
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

function Snapshot({ label, value, good = false }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] font-semibold text-zinc-300">{label}</div>
            <div className={["mt-1 text-sm font-semibold", good ? "text-emerald-200" : "text-white"].join(" ")}>{value}</div>
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

function CheckIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    )
}

const startOfDayLocal = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const startOfWeekLocal = (d) => {
    const day = d.getDay()
    const diff = (day + 6) % 7 // Monday=0
    const s = new Date(d)
    s.setDate(d.getDate() - diff)
    return startOfDayLocal(s)
}
const isSameBucket = (a, b, bucket) => {
    const da = new Date(a)
    const db = new Date(b)
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false

    if (bucket === "day") return startOfDayLocal(da).getTime() === startOfDayLocal(db).getTime()
    if (bucket === "week") return startOfWeekLocal(da).getTime() === startOfWeekLocal(db).getTime()
    if (bucket === "month") return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()
    return da.getFullYear() === db.getFullYear()
}

const toDateInput = (d) => {
    if (!d || Number.isNaN(d.getTime())) return ""
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
}

const parseDateInputToLocalRange = (fromYmd, toYmd) => {
    const from = String(fromYmd || "").trim()
    const to = String(toYmd || "").trim()
    if (!from && !to) return { from: null, to: null }

    const fromDate = from ? new Date(`${from}T00:00:00`) : null
    const toDate = to ? new Date(`${to}T23:59:59`) : null

    return {
        from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null,
        to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : null,
    }
}

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
    const [period, setPeriod] = useState("week") // day|week|month|year

    const [addOpen, setAddOpen] = useState(false)
    const [addSaving, setAddSaving] = useState(false)

    const [sellForm, setSellForm] = useState(() => ({
        itemId: "",
        platform: "EBAY",
        soldAt: new Date().toISOString().slice(0, 16),
        quantitySold: 1,
        salePricePerUnit: "0.00",
        notes: "",
        removeFromInventory: true,
        removeMode: "DECREMENT",
    }))

    const [selectedSale, setSelectedSale] = useState(null)
    const [detailOpen, setDetailOpen] = useState(false)

    // Bulk delete
    const [selectedIds, setSelectedIds] = useState(() => new Set())
    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulkWorking, setBulkWorking] = useState(false)
    const [bulkRange, setBulkRange] = useState(() => {
        const now = new Date()
        return { from: toDateInput(now), to: toDateInput(now) }
    })

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
    const sellGrossPence = sellQty * sellPricePerUnitPence

    const purchasePerUnitPence = selectedItemComputed ? Number(selectedItemComputed.purchaseTotalPerUnit) || 0 : 0
    const purchaseTotalForSoldUnitsPence = sellQty * purchasePerUnitPence
    const profitPence = sellGrossPence - purchaseTotalForSoldUnitsPence

    const openAdd = () => {
        const first = inventoryOptions[0]?.it?.id ? String(inventoryOptions[0].it.id) : ""
        setSellForm({
            itemId: first,
            platform: "EBAY",
            soldAt: new Date().toISOString().slice(0, 16),
            quantitySold: 1,
            salePricePerUnit: "0.00",
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

    const tryDeleteSaleRequest = async (saleId) => {
        // Primary: REST style /api/sales/:id
        const r1 = await fetch(`/api/sales/${saleId}`, { method: "DELETE" })
        if (r1.ok) return { ok: true }
        const d1 = await r1.json().catch(() => null)

        // Fallback: query param /api/sales?id=
        const r2 = await fetch(`/api/sales?id=${encodeURIComponent(String(saleId))}`, { method: "DELETE" })
        if (r2.ok) return { ok: true }
        const d2 = await r2.json().catch(() => null)

        return { ok: false, error: d2?.error || d1?.error || `Delete failed (${r1.status})` }
    }

    const deleteSale = async (saleId) => {
        try {
            const out = await tryDeleteSaleRequest(saleId)
            if (!out.ok) throw new Error(out.error || "Delete failed")
            showToast("ok", "Sale deleted")
            setSelectedIds((prev) => {
                const next = new Set(prev)
                next.delete(String(saleId))
                return next
            })
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

        if (available <= 0) return showToast("error", "This item has 0 quantity in inventory")
        if (sellQty <= 0) return showToast("error", "Quantity sold must be at least 1")
        if (sellQty > available) return showToast("error", "Quantity sold exceeds inventory quantity")
        if (sellPricePerUnitPence <= 0) return showToast("error", "Sale price per unit is required")

        const platform = (sellForm.platform || "OTHER").toUpperCase()

        const soldAtLocal = String(sellForm.soldAt || "").trim()
        const soldAt = soldAtLocal ? new Date(soldAtLocal).toISOString() : new Date().toISOString()

        const saleCur = (c.itemCur || "GBP").toUpperCase()

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
            notes: String(sellForm.notes || "").trim() || null,
        }

        setAddSaving(true)
        try {
            const resSale = await fetch("/api/sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(salePayload),
            })
            const saleData = await resSale.json().catch(() => null)
            if (!resSale.ok) throw new Error(saleData?.error || `Create sale failed (${resSale.status})`)

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

    // keep selection stable: drop ids that no longer exist in filtered list after reload/search
    useEffect(() => {
        setSelectedIds((prev) => {
            const allowed = new Set(filteredSales.map((s) => String(s.id)))
            const next = new Set()
            for (const id of prev) if (allowed.has(String(id))) next.add(String(id))
            return next
        })
    }, [filteredSales])

    const periodLabel = useMemo(() => {
        const now = new Date()
        if (period === "day") return now.toLocaleDateString()
        if (period === "week") {
            const s = startOfWeekLocal(now)
            const e = new Date(s)
            e.setDate(s.getDate() + 6)
            return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`
        }
        if (period === "month") return `${now.toLocaleString(undefined, { month: "long" })} ${now.getFullYear()}`
        return String(now.getFullYear())
    }, [period])

    const periodTotals = useMemo(() => {
        const now = new Date()

        let revenue = 0
        let profit = 0
        let units = 0
        let rows = 0

        for (const s of filteredSales) {
            const soldAt = s.soldAt ? new Date(s.soldAt) : null
            if (!soldAt || Number.isNaN(soldAt.getTime())) continue
            if (!isSameBucket(soldAt, now, period)) continue

            const cur = (s.currency || "GBP").toUpperCase()
            const qty = Number(s.quantitySold || 0) || 0
            const ppu = Number(s.salePricePerUnitPence || 0) || 0
            const revenuePence = qty * ppu

            const costPence = Number(s.costTotalPence || 0) || 0
            const profitPence = revenuePence - costPence

            revenue += convertMinor(revenuePence, cur, currencyView, fx.rates).value
            profit += convertMinor(profitPence, cur, currencyView, fx.rates).value

            units += qty
            rows += 1
        }

        const avgSale = rows > 0 ? Math.round(revenue / rows) : 0
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0

        return { revenue, profit, units, rows, avgSale, margin }
    }, [filteredSales, period, currencyView, fx.rates])

    const allVisibleIds = useMemo(() => filteredSales.map((s) => String(s.id)).filter(Boolean), [filteredSales])
    const allVisibleSelected = useMemo(() => allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id)), [allVisibleIds, selectedIds])
    const selectedCount = selectedIds.size

    const toggleSelectAllVisible = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (allVisibleSelected) {
                for (const id of allVisibleIds) next.delete(id)
            } else {
                for (const id of allVisibleIds) next.add(id)
            }
            return next
        })
    }

    const toggleOne = (id) => {
        const sid = String(id)
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(sid)) next.delete(sid)
            else next.add(sid)
            return next
        })
    }

    const rangeMatchesSale = (sale, rangeFrom, rangeTo) => {
        const dt = sale?.soldAt ? new Date(sale.soldAt) : null
        if (!dt || Number.isNaN(dt.getTime())) return false
        if (rangeFrom && dt.getTime() < rangeFrom.getTime()) return false
        if (rangeTo && dt.getTime() > rangeTo.getTime()) return false
        return true
    }

    const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds])

    const bulkDeleteByIds = async (ids) => {
        const list = Array.from(new Set((ids || []).map((x) => String(x)).filter(Boolean)))
        if (list.length === 0) return showToast("error", "No sales selected")

        setBulkWorking(true)
        try {
            let ok = 0
            let fail = 0

            // serial to avoid hammering and to keep UX predictable
            for (const id of list) {
                const out = await tryDeleteSaleRequest(id)
                if (out.ok) ok += 1
                else fail += 1
            }

            if (fail === 0) showToast("ok", `Deleted ${ok} sale(s)`)
            else showToast("error", `Deleted ${ok} sale(s), failed ${fail}`)

            setSelectedIds((prev) => {
                const next = new Set(prev)
                for (const id of list) next.delete(String(id))
                return next
            })

            await loadSales()
        } catch (e) {
            showToast("error", e?.message || "Bulk delete failed")
        } finally {
            setBulkWorking(false)
        }
    }

    const bulkDeleteWithinRange = async () => {
        const { from, to } = parseDateInputToLocalRange(bulkRange.from, bulkRange.to)
        if (!from && !to) return showToast("error", "Select a date range")

        const ids = filteredSales.filter((s) => rangeMatchesSale(s, from, to)).map((s) => String(s.id)).filter(Boolean)
        if (ids.length === 0) return showToast("error", "No sales found in that date range")

        await bulkDeleteByIds(ids)
    }

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
                        <p className="mt-1 text-sm text-zinc-300">Record a sale, and it will remove units from inventory (decrement or delete) and set status to SOLD when quantity hits 0.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-xs font-semibold text-zinc-300">Display</div>
                            <select value={currencyView} onChange={(e) => setCurrencyView(e.target.value)} className="h-9 rounded-xl border border-white/10 bg-zinc-950/60 px-2 text-sm text-white outline-none">
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
                                title={fx.error ? `FX error: ${fx.error}` : "Refresh exchange rates"}
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
                                <button type="button" onClick={() => setSearch("")} className="h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white/90 hover:bg-white/15">
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
                            onClick={() => setBulkOpen(true)}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Bulk delete
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
                        <div className={["rounded-2xl border px-4 py-3 text-sm", toast.type === "error" ? "border-red-400/20 bg-red-500/10 text-red-100" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"].join(" ")}>
                            {toast.msg}
                        </div>
                    </div>
                ) : null}

                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur">
                    <div className="flex items-center gap-2">
                        <div className="text-xs font-semibold text-zinc-300">Period</div>
                        <div className="inline-flex rounded-2xl border border-white/10 bg-zinc-950/30 p-1">
                            {["day", "week", "month", "year"].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPeriod(p)}
                                    className={["h-10 rounded-2xl px-4 text-sm font-semibold transition", period === p ? "bg-white text-zinc-950" : "text-white/90 hover:bg-white/10"].join(" ")}
                                >
                                    {p[0].toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
                        <div>
                            Showing: <span className="font-semibold text-white">{periodLabel}</span>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 px-3 py-2">
                            Selected: <span className="font-semibold text-white">{selectedCount}</span>
                        </div>
                        {selectedCount > 0 ? (
                            <button
                                type="button"
                                onClick={() => bulkDeleteByIds(selectedIdsArray)}
                                disabled={bulkWorking}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                            >
                                <TrashIcon />
                                {bulkWorking ? "Deleting…" : "Delete selected"}
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="mb-6 grid gap-4 md:grid-cols-4">
                    <StatCard label={`Revenue (${currencyView})`} value={fmt(currencyView, periodTotals.revenue)} sub={`${periodTotals.rows} sale(s) this period`} />
                    <StatCard label={`Profit (${currencyView})`} value={fmt(currencyView, periodTotals.profit)} sub="Revenue − cost" />
                    <StatCard label="Units sold" value={String(periodTotals.units)} sub="Total quantity sold" />
                    <StatCard label="Average sale" value={fmt(currencyView, periodTotals.avgSale)} sub={`${periodTotals.margin.toFixed(1)}% margin`} />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Sales history</div>
                            <div className="text-xs text-zinc-300">{loadingSales ? "Loading…" : `${filteredSales.length} sale(s)`} • click a row for details</div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={toggleSelectAllVisible}
                                className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                            >
                                {allVisibleSelected ? "Unselect visible" : "Select visible"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedIds(new Set())}
                                disabled={selectedIds.size === 0}
                                className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
                            >
                                Clear selection
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 overflow-hidden">
                        <div className={["grid border-b border-white/10", HEAD_H, HEADER_BG].join(" ")} style={{ gridTemplateColumns: "54px minmax(0,2fr) 120px 110px 150px 150px 150px 110px 60px" }}>
                            <div className={["flex items-center justify-center text-xs font-semibold text-zinc-200"].join(" ")}>
                                <button
                                    type="button"
                                    onClick={toggleSelectAllVisible}
                                    className={["inline-flex h-7 w-7 items-center justify-center rounded-xl border transition", allVisibleSelected ? "border-white/10 bg-white text-zinc-950" : "border-white/10 bg-white/10 text-white/90 hover:bg-white/15"].join(" ")}
                                    title={allVisibleSelected ? "Unselect visible" : "Select visible"}
                                >
                                    {allVisibleSelected ? <CheckIcon /> : null}
                                </button>
                            </div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Item</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Platform</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Qty</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Sale / unit</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Revenue</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Profit</div>
                            <div className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>Sold at</div>
                            <div className={["flex min-w-0 items-center justify-end text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}> </div>
                        </div>

                        <div className="divide-y divide-white/10">
                            {!loadingSales && filteredSales.length === 0 ? <div className={["text-sm text-zinc-300", CELL_PAD, "py-6"].join(" ")}>No sales yet.</div> : null}

                            {filteredSales.map((s, idx) => {
                                const rowBg = idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"

                                const cur = (s.currency || "GBP").toUpperCase()
                                const qty = Number(s.quantitySold || 0) || 0
                                const ppu = Number(s.salePricePerUnitPence || 0) || 0
                                const revenuePence = qty * ppu

                                const costPence = Number(s.costTotalPence || 0) || 0
                                const profitPence = revenuePence - costPence

                                const ppuView = fmt(currencyView, convertMinor(ppu, cur, currencyView, fx.rates).value)
                                const revenueView = fmt(currencyView, convertMinor(revenuePence, cur, currencyView, fx.rates).value)
                                const profitView = fmt(currencyView, convertMinor(profitPence, cur, currencyView, fx.rates).value)

                                const dt = s.soldAt ? new Date(s.soldAt) : null
                                const soldAtLabel = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString() : "—"

                                const sid = String(s.id)
                                const checked = selectedIds.has(sid)

                                return (
                                    <div
                                        key={s.id || `${s.itemId}-${idx}`}
                                        className={["grid cursor-pointer", ROW_H, rowBg, "hover:bg-white/5"].join(" ")}
                                        style={{ gridTemplateColumns: "54px minmax(0,2fr) 120px 110px 150px 150px 150px 110px 60px" }}
                                        onClick={() => openSaleDetail(s)}
                                    >
                                        <div className={["flex items-center justify-center", CELL_Y].join(" ")} onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => toggleOne(sid)}
                                                className={[
                                                    "inline-flex h-7 w-7 items-center justify-center rounded-xl border transition",
                                                    checked ? "border-white/10 bg-white text-zinc-950" : "border-white/10 bg-white/10 text-white/90 hover:bg-white/15",
                                                ].join(" ")}
                                                title={checked ? "Unselect" : "Select"}
                                            >
                                                {checked ? <CheckIcon /> : null}
                                            </button>
                                        </div>

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
                                            <span className="truncate text-[13px] text-white">{revenueView}</span>
                                        </div>

                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <span className={["truncate text-[13px] font-semibold", profitPence >= 0 ? "text-emerald-200" : "text-red-200"].join(" ")}>{profitView}</span>
                                        </div>

                                        <div className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                            <span className="truncate text-[13px] text-zinc-200">{soldAtLabel}</span>
                                        </div>

                                        <div className={["flex items-center justify-end gap-2", CELL_PAD, CELL_Y].join(" ")} onClick={(e) => e.stopPropagation()}>
                                            <IconButton
                                                title="Delete sale"
                                                onClick={(e) => {
                                                    e?.preventDefault?.()
                                                    e?.stopPropagation?.()
                                                    deleteSale(s.id)
                                                }}
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
                                dangerouslySetInnerHTML={{
                                    __html: fx.attributionHtml || '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>',
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* BULK DELETE MODAL */}
            {bulkOpen ? (
                <Modal
                    title="Bulk delete sales"
                    onClose={() => setBulkOpen(false)}
                    maxWidth="max-w-4xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button
                                type="button"
                                onClick={() => setBulkOpen(false)}
                                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10"
                            >
                                Close
                            </button>

                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => bulkDeleteByIds(selectedIdsArray)}
                                    disabled={bulkWorking || selectedIdsArray.length === 0}
                                    className="h-11 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                                >
                                    {bulkWorking ? "Deleting…" : `Delete selected (${selectedIdsArray.length})`}
                                </button>

                                <button
                                    type="button"
                                    onClick={bulkDeleteWithinRange}
                                    disabled={bulkWorking}
                                    className="h-11 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                                >
                                    {bulkWorking ? "Deleting…" : "Delete within date range"}
                                </button>
                            </div>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm font-semibold text-white">Selected rows</div>
                            <div className="mt-1 text-xs text-zinc-300">Uses the tick boxes in the table (current filtered view).</div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={toggleSelectAllVisible}
                                    className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                                >
                                    {allVisibleSelected ? "Unselect visible" : "Select visible"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSelectedIds(new Set())}
                                    disabled={selectedIds.size === 0}
                                    className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
                                >
                                    Clear selection
                                </button>

                                <div className="ml-auto rounded-2xl border border-white/10 bg-zinc-950/30 px-3 py-2 text-xs text-zinc-300">
                                    Selected: <span className="font-semibold text-white">{selectedIdsArray.length}</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm font-semibold text-white">Delete within date range</div>
                            <div className="mt-1 text-xs text-zinc-300">Deletes all sales whose Sold at falls between these dates (inclusive), using the current filtered list.</div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <Field label="From">
                                    <input
                                        type="date"
                                        value={bulkRange.from}
                                        onChange={(e) => setBulkRange((p) => ({ ...p, from: e.target.value }))}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    />
                                </Field>
                                <Field label="To">
                                    <input
                                        type="date"
                                        value={bulkRange.to}
                                        onChange={(e) => setBulkRange((p) => ({ ...p, to: e.target.value }))}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    />
                                </Field>
                            </div>

                            <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-950/30 p-3 text-xs text-zinc-300">
                                Matches:{" "}
                                <span className="font-semibold text-white">
                                    {(() => {
                                        const { from, to } = parseDateInputToLocalRange(bulkRange.from, bulkRange.to)
                                        if (!from && !to) return 0
                                        return filteredSales.filter((s) => rangeMatchesSale(s, from, to)).length
                                    })()}
                                </span>{" "}
                                sale(s)
                            </div>
                        </div>
                    </div>
                </Modal>
            ) : null}

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

                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4 md:col-span-2">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <Snapshot label="Revenue" value={fmt(selectedItemComputed?.itemCur || "GBP", sellGrossPence)} good />
                                    <Snapshot label="Cost basis" value={fmt(selectedItemComputed?.itemCur || "GBP", purchaseTotalForSoldUnitsPence)} />
                                    <Snapshot label="Profit" value={fmt(selectedItemComputed?.itemCur || "GBP", profitPence)} good={profitPence >= 0} />
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
                                            {selectedItem ? `Qty ${Number(selectedItem.quantity) || 0} → ${Math.max(0, (Number(selectedItem.quantity) || 0) - sellQty)}` : "—"}
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
                                            className={["h-11 rounded-2xl border px-4 text-sm font-semibold transition", sellForm.removeMode === "DECREMENT" ? "border-white/10 bg-white text-zinc-950" : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"].join(" ")}
                                        >
                                            Decrement quantity
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setSellForm((p) => ({ ...p, removeMode: "DELETE" }))}
                                            className={["h-11 rounded-2xl border px-4 text-sm font-semibold transition", sellForm.removeMode === "DELETE" ? "border-red-400/20 bg-red-500/10 text-red-100" : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"].join(" ")}
                                        >
                                            Delete item row
                                        </button>

                                        {sellForm.removeMode === "DELETE" ? <div className="sm:col-span-2 text-xs text-zinc-300">Delete will remove the entire inventory row (even if only some units are sold). Decrement is recommended.</div> : null}
                                    </div>
                                ) : null}
                            </div>

                            <Field label="Notes" className="md:col-span-2">
                                <textarea
                                    value={sellForm.notes}
                                    onChange={(e) => setSellForm((p) => ({ ...p, notes: e.target.value }))}
                                    className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="Optional… e.g. bundle, partial refund, buyer issue…"
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
                            <button type="button" onClick={() => deleteSale(selectedSale.id)} className="h-11 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/15">
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
    const revenuePence = qty * ppu

    const costPence = Number(sale.costTotalPence || 0) || 0
    const profitPence = revenuePence - costPence

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
                <Row label={`Revenue (${cur})`} value={fmt(cur, revenuePence)} />
                <Row label={`Cost (${cur})`} value={fmt(cur, costPence)} />
                <Row label={`Profit (${cur})`} value={fmt(cur, profitPence)} />

                <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <Snapshot label={`Revenue (${currencyView})`} value={toView(revenuePence)} good />
                        <Snapshot label={`Cost (${currencyView})`} value={toView(costPence)} />
                        <Snapshot label={`Profit (${currencyView})`} value={toView(profitPence)} good={profitPence >= 0} />
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
