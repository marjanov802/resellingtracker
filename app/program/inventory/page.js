// app/program/inventory/page.js
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

const STATUSES = [
    ["UNLISTED", "Unlisted"],
    ["LISTED", "Listed"],
    ["SOLD", "Sold"],
]

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

const CATEGORIES = [
    "Clothes",
    "Shoes",
    "Tech",
    "Collectables",
    "Cards",
    "Watches",
    "Bags",
    "Jewellery",
    "Home",
    "Other",
]

const CONDITIONS = ["New", "New (with tags)", "Like new", "Good", "Fair", "Poor"]

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

    const amountUSD = (m / 100) / rates[f]
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
 * Notes payload (v3)
 * - purchaseTotalPence: total all-in purchase cost PER UNIT
 * - expectedBestPence / expectedWorstPence: expected sale PER UNIT
 * - listings: array of { platform, url, pricePence } (price is per unit)
 */
const encodeNotes = (plainNotes, meta) => {
    const payload = {
        v: 3,
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
        if (o && typeof o === "object" && (o.v === 1 || o.v === 2 || o.v === 3)) {
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
    const expectedBestPence = m.expectedBestPence == null ? null : Number(m.expectedBestPence)
    const expectedWorstPence = m.expectedWorstPence == null ? null : Number(m.expectedWorstPence)

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
        expectedBestPence,
        expectedWorstPence,
        listings,
    }
}

function compute(it) {
    const decoded = decodeNotes(it.notes)
    const meta = normaliseMeta(decoded.meta)

    const itemCur = meta.currency
    const q = Number(it.quantity) || 0
    const status = meta.status

    const purchaseTotalPerUnit =
        meta.purchaseTotalPence > 0 ? meta.purchaseTotalPence : Number(it.costPence) || 0

    const purchaseTotal = purchaseTotalPerUnit * q

    const bestPerUnit = meta.expectedBestPence == null ? null : meta.expectedBestPence
    const worstPerUnit = meta.expectedWorstPence == null ? null : meta.expectedWorstPence

    const profitBestPerUnit = bestPerUnit == null ? null : bestPerUnit - purchaseTotalPerUnit
    const profitWorstPerUnit = worstPerUnit == null ? null : worstPerUnit - purchaseTotalPerUnit

    const profitBestTotal = profitBestPerUnit == null ? null : profitBestPerUnit * q
    const profitWorstTotal = profitWorstPerUnit == null ? null : profitWorstPerUnit * q

    // primary listing display: first listing price if present
    const firstListing = meta.listings?.[0] || null
    const listingPricePerUnit = firstListing?.pricePence ?? null
    const listingPriceTotal = listingPricePerUnit == null ? null : listingPricePerUnit * q

    return {
        notesPlain: decoded.notes,
        meta,
        itemCur,
        q,
        status,
        purchaseTotalPerUnit,
        purchaseTotal,
        listingPricePerUnit,
        listingPriceTotal,
        profitBestPerUnit,
        profitWorstPerUnit,
        profitBestTotal,
        profitWorstTotal,
    }
}

function Pill({ text }) {
    const t = String(text || "").toUpperCase()
    const cls =
        t === "SOLD"
            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
            : t === "LISTED"
                ? "border-blue-400/20 bg-blue-500/10 text-blue-100"
                : "border-white/10 bg-white/5 text-zinc-200"

    return (
        <span className={["inline-flex items-center rounded-2xl border px-3 py-1 text-xs font-semibold", cls].join(" ")}>
            {t}
        </span>
    )
}

function Modal({ title, onClose, children, footer, maxWidth = "max-w-3xl" }) {
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

function SectionTabs({ tabs, value, onChange }) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
            {tabs.map((t) => (
                <button
                    key={t.value}
                    type="button"
                    onClick={() => onChange(t.value)}
                    className={[
                        "h-10 rounded-2xl px-4 text-sm font-semibold transition",
                        value === t.value ? "bg-white text-zinc-950" : "bg-transparent text-white/90 hover:bg-white/10",
                    ].join(" ")}
                >
                    {t.label}
                </button>
            ))}
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

function Card({ title, children, className = "" }) {
    return (
        <div className={["rounded-3xl border border-white/10 bg-white/5 p-5", className].join(" ")}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</div>
            {children}
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

const DEFAULT_COLUMNS = {
    sku: true,
    category: true,
    condition: true,
    quantity: true,
    purchase: true,
    status: true,
    listings: false, // show ALL listing links (chips) in the table
    listingPrice: true,

    // reseller finance / performance columns
    purchasePerUnit: false,
    expectedBest: false,
    expectedWorst: false,
    bestProfit: true,
    worstProfit: true,
    bestProfitPerUnit: false,
    worstProfitPerUnit: false,
    roiBest: false,
    roiWorst: false,
    ageDays: false,
    updated: false,
}

const COLUMN_DEFS = [
    { key: "sku", label: "SKU", width: "150px" },
    { key: "category", label: "Category", width: "160px" },
    { key: "condition", label: "Condition", width: "160px" },
    { key: "quantity", label: "Qty", width: "80px" },
    { key: "purchase", label: "Purchase total", width: "190px" },
    { key: "purchasePerUnit", label: "Purchase / unit", width: "170px" },
    { key: "status", label: "Status", width: "130px" },
    { key: "listings", label: "Listings", width: "420px" },
    { key: "listingPrice", label: "Listing price", width: "170px" },
    { key: "expectedBest", label: "Expected best total", width: "210px" },
    { key: "expectedWorst", label: "Expected worst total", width: "210px" },
    { key: "bestProfit", label: "Best profit", width: "170px" },
    { key: "worstProfit", label: "Worst profit", width: "170px" },
    { key: "bestProfitPerUnit", label: "Best profit / unit", width: "190px" },
    { key: "worstProfitPerUnit", label: "Worst profit / unit", width: "190px" },
    { key: "roiBest", label: "ROI best", width: "140px" },
    { key: "roiWorst", label: "ROI worst", width: "140px" },
    { key: "ageDays", label: "Age (days)", width: "120px" },
    { key: "updated", label: "Updated", width: "190px" },
]

export default function InventoryPage() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState({ type: "", msg: "" })

    const [selected, setSelected] = useState(() => new Set())

    const [detailOpen, setDetailOpen] = useState(false)
    const [detailItem, setDetailItem] = useState(null)

    const [columnsOpen, setColumnsOpen] = useState(false)
    const [columns, setColumns] = useState(() => {
        if (typeof window === "undefined") return DEFAULT_COLUMNS
        try {
            const raw = localStorage.getItem("rt_inventory_columns_v1")
            if (!raw) return DEFAULT_COLUMNS
            const parsed = JSON.parse(raw)
            return { ...DEFAULT_COLUMNS, ...(parsed && typeof parsed === "object" ? parsed : {}) }
        } catch {
            return DEFAULT_COLUMNS
        }
    })

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

    // ADD MODAL
    const [addOpen, setAddOpen] = useState(false)
    const [addSaving, setAddSaving] = useState(false)
    const [addTab, setAddTab] = useState("BASIC")

    const [addForm, setAddForm] = useState(() => ({
        title: "",
        sku: "",
        quantity: 1,

        category: "Clothes",
        condition: "Good",
        status: "UNLISTED",

        // money (per unit)
        purchaseTotal: "0.00",
        expectedBest: "0.00",
        expectedWorst: "0.00",

        // listing (multi)
        listingPlatform: "EBAY",
        listingUrl: "",
        listingPrice: "0.00",
        listings: [],

        notes: "",
    }))

    // EDIT MODAL
    const [editOpen, setEditOpen] = useState(false)
    const [editSaving, setEditSaving] = useState(false)
    const [editTab, setEditTab] = useState("BASIC")
    const [editItem, setEditItem] = useState(null)
    const [editForm, setEditForm] = useState(() => ({
        title: "",
        sku: "",
        quantity: 1,

        category: "Clothes",
        condition: "Good",
        status: "UNLISTED",

        // money (per unit)
        purchaseTotal: "0.00",
        expectedBest: "0.00",
        expectedWorst: "0.00",

        // listing (multi)
        listingPlatform: "EBAY",
        listingUrl: "",
        listingPrice: "0.00",
        listings: [],

        notes: "",
    }))

    const showToast = (type, msg) => {
        setToast({ type, msg })
        window.clearTimeout(showToast._t)
        showToast._t = window.setTimeout(() => setToast({ type: "", msg: "" }), 1800)
    }

    const loadItems = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/items", { cache: "no-store" })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Failed to load (${res.status})`)
            setItems(Array.isArray(data) ? data : [])
        } catch (e) {
            showToast("error", e?.message || "Failed to load items")
            setItems([])
        } finally {
            setLoading(false)
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
        loadFx()
    }, [])

    useEffect(() => {
        if (typeof window !== "undefined") localStorage.setItem("rt_currency_view", currencyView)
    }, [currencyView])

    useEffect(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem("rt_inventory_columns_v1", JSON.stringify(columns))
        }
    }, [columns])

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAll = () => setSelected(new Set(items.map((x) => x.id)))
    const clearSelection = () => setSelected(new Set())

    const openDetail = (it) => {
        setDetailItem(it)
        setDetailOpen(true)
    }

    const singleDelete = async (id) => {
        try {
            const res = await fetch(`/api/items/${id}`, { method: "DELETE" })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Delete failed (${res.status})`)
            showToast("ok", "Deleted")
            setSelected((prev) => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
            await loadItems()
            setDetailOpen(false)
            setDetailItem(null)
            if (editOpen && editItem?.id === id) {
                setEditOpen(false)
                setEditItem(null)
            }
        } catch (e) {
            showToast("error", e?.message || "Delete failed")
        }
    }

    const bulkDelete = async () => {
        const ids = Array.from(selected)
        if (ids.length === 0) return showToast("error", "No items selected")
        try {
            const res = await fetch("/api/items/bulk-delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`)
            showToast("ok", `Deleted ${data?.deleted ?? ids.length}`)
            clearSelection()
            await loadItems()
        } catch (e) {
            showToast("error", e?.message || "Bulk delete failed")
        }
    }

    const openAdd = () => {
        setAddTab("BASIC")
        setAddForm({
            title: "",
            sku: "",
            quantity: 1,

            category: "Clothes",
            condition: "Good",
            status: "UNLISTED",

            purchaseTotal: "0.00",
            expectedBest: "0.00",
            expectedWorst: "0.00",

            listingPlatform: "EBAY",
            listingUrl: "",
            listingPrice: "0.00",
            listings: [],

            notes: "",
        })
        setAddOpen(true)
    }

    const onAddChange = (patch) => setAddForm((p) => ({ ...p, ...patch }))

    const addStatus = String(addForm.status || "UNLISTED").toUpperCase()
    const showListingFieldsInAdd = addStatus === "LISTED" || addStatus === "SOLD"

    useEffect(() => {
        if (!showListingFieldsInAdd && addTab === "LISTING") setAddTab("BASIC")
    }, [showListingFieldsInAdd, addTab])

    const addListingToForm = () => {
        const url = safeStr(addForm.listingUrl)
        if (!url) return showToast("error", "Listing link is required")
        const platform = (addForm.listingPlatform || "OTHER").toUpperCase()
        const pricePence = parseMoneyToPence(addForm.listingPrice)
        const listing = { platform, url, pricePence }

        onAddChange({
            listingUrl: "",
            listingPrice: "0.00",
            listings: Array.isArray(addForm.listings) ? [...addForm.listings, listing] : [listing],
        })
    }

    const removeListingFromForm = (idx) => {
        const arr = Array.isArray(addForm.listings) ? [...addForm.listings] : []
        arr.splice(idx, 1)
        onAddChange({ listings: arr })
    }

    const submitAdd = async (e) => {
        e?.preventDefault?.()
        const name = String(addForm.title || "").trim()
        if (!name) return showToast("error", "Title is required")

        const status = (addForm.status || "UNLISTED").toUpperCase()

        const purchaseTotalPence = parseMoneyToPence(addForm.purchaseTotal)
        const expectedBestPence = parseMoneyToPence(addForm.expectedBest)
        const expectedWorstPence = parseMoneyToPence(addForm.expectedWorst)

        const listings =
            showListingFieldsInAdd && Array.isArray(addForm.listings)
                ? addForm.listings
                    .map((x) => ({
                        platform: (x?.platform || "OTHER").toUpperCase(),
                        url: safeStr(x?.url) || "",
                        pricePence: x?.pricePence == null ? null : Number(x.pricePence),
                    }))
                    .filter((x) => x.url || Number.isFinite(x.pricePence))
                : []

        const meta = {
            currency: currencyView,
            status,
            category: addForm.category || null,
            condition: addForm.condition || null,

            purchaseTotalPence,
            expectedBestPence,
            expectedWorstPence,

            listings,
        }

        const payload = {
            name,
            sku: safeStr(addForm.sku) || null,
            quantity: safeInt(addForm.quantity, 0),
            costPence: purchaseTotalPence,
            notes: encodeNotes(addForm.notes, meta),
        }

        setAddSaving(true)
        try {
            const res = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Create failed (${res.status})`)
            showToast("ok", "Item created")
            setAddOpen(false)
            await loadItems()
        } catch (e2) {
            showToast("error", e2?.message || "Create failed")
        } finally {
            setAddSaving(false)
        }
    }

    const openEdit = (it) => {
        const decoded = decodeNotes(it.notes)
        const meta = normaliseMeta(decoded.meta)

        setEditItem(it)
        setEditTab("BASIC")

        setEditForm({
            title: it.name || "",
            sku: it.sku || "",
            quantity: Number(it.quantity) || 0,

            category: meta.category || "Clothes",
            condition: meta.condition || "Good",
            status: (meta.status || "UNLISTED").toUpperCase(),

            purchaseTotal: ((Number(meta.purchaseTotalPence || it.costPence || 0) || 0) / 100).toFixed(2),
            expectedBest: meta.expectedBestPence == null ? "0.00" : ((Number(meta.expectedBestPence) || 0) / 100).toFixed(2),
            expectedWorst: meta.expectedWorstPence == null ? "0.00" : ((Number(meta.expectedWorstPence) || 0) / 100).toFixed(2),

            listingPlatform: "EBAY",
            listingUrl: "",
            listingPrice: "0.00",
            listings: Array.isArray(meta.listings) ? meta.listings.map((l) => ({ ...l })) : [],

            notes: decoded.notes || "",
        })

        setEditOpen(true)
    }

    const onEditChange = (patch) => setEditForm((p) => ({ ...p, ...patch }))

    const editStatus = String(editForm.status || "UNLISTED").toUpperCase()
    const showListingFieldsInEdit = editStatus === "LISTED" || editStatus === "SOLD"

    useEffect(() => {
        if (!showListingFieldsInEdit && editTab === "LISTING") setEditTab("BASIC")
    }, [showListingFieldsInEdit, editTab])

    const addListingToEditForm = () => {
        const url = safeStr(editForm.listingUrl)
        if (!url) return showToast("error", "Listing link is required")
        const platform = (editForm.listingPlatform || "OTHER").toUpperCase()
        const pricePence = parseMoneyToPence(editForm.listingPrice)
        const listing = { platform, url, pricePence }

        onEditChange({
            listingUrl: "",
            listingPrice: "0.00",
            listings: Array.isArray(editForm.listings) ? [...editForm.listings, listing] : [listing],
        })
    }

    const removeListingFromEditForm = (idx) => {
        const arr = Array.isArray(editForm.listings) ? [...editForm.listings] : []
        arr.splice(idx, 1)
        onEditChange({ listings: arr })
    }

    const submitEdit = async (e) => {
        e?.preventDefault?.()
        if (!editItem?.id) return showToast("error", "No item selected")

        const name = String(editForm.title || "").trim()
        if (!name) return showToast("error", "Title is required")

        const status = (editForm.status || "UNLISTED").toUpperCase()

        const purchaseTotalPence = parseMoneyToPence(editForm.purchaseTotal)
        const expectedBestPence = parseMoneyToPence(editForm.expectedBest)
        const expectedWorstPence = parseMoneyToPence(editForm.expectedWorst)

        const listings =
            showListingFieldsInEdit && Array.isArray(editForm.listings)
                ? editForm.listings
                    .map((x) => ({
                        platform: (x?.platform || "OTHER").toUpperCase(),
                        url: safeStr(x?.url) || "",
                        pricePence: x?.pricePence == null ? null : Number(x.pricePence),
                    }))
                    .filter((x) => x.url || Number.isFinite(x.pricePence))
                : []

        const meta = {
            currency: currencyView,
            status,
            category: editForm.category || null,
            condition: editForm.condition || null,

            purchaseTotalPence,
            expectedBestPence,
            expectedWorstPence,

            listings,
        }

        const payload = {
            name,
            sku: safeStr(editForm.sku) || null,
            quantity: safeInt(editForm.quantity, 0),
            costPence: purchaseTotalPence,
            notes: encodeNotes(editForm.notes, meta),
        }

        setEditSaving(true)
        try {
            const res = await fetch(`/api/items/${editItem.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Update failed (${res.status})`)
            showToast("ok", "Updated")
            setEditOpen(false)
            setEditItem(null)
            await loadItems()
        } catch (e2) {
            showToast("error", e2?.message || "Update failed")
        } finally {
            setEditSaving(false)
        }
    }

    const columnKeys = useMemo(() => {
        const keys = []
        for (const def of COLUMN_DEFS) {
            if (columns[def.key]) keys.push(def.key)
        }
        return keys
    }, [columns])

    const gridCols = useMemo(() => {
        const base = ["44px", "minmax(260px, 1fr)"] // checkbox + title
        const dynamic = columnKeys.map((k) => COLUMN_DEFS.find((d) => d.key === k)?.width || "160px")
        const actions = ["190px"]
        return [...base, ...dynamic, ...actions].join(" ")
    }, [columnKeys])

    const totals = useMemo(() => {
        const rowCount = items.length
        const unitCount = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0)

        let invested = 0
        let best = 0
        let worst = 0

        for (const it of items) {
            const c = compute(it)
            const toView = (minor) => convertMinor(minor, c.itemCur, currencyView, fx.rates).value

            invested += toView(c.purchaseTotal)

            if (c.profitBestTotal != null) best += toView(c.profitBestTotal)
            if (c.profitWorstTotal != null) worst += toView(c.profitWorstTotal)
        }

        return { rowCount, unitCount, invested, best, worst }
    }, [items, currencyView, fx.rates])

    const renderPurchaseTotal = (it) => {
        const c = compute(it)
        const perUnit = convertMinor(c.purchaseTotalPerUnit, c.itemCur, currencyView, fx.rates).value
        const total = convertMinor(c.purchaseTotal, c.itemCur, currencyView, fx.rates).value

        return (
            <div className="flex flex-col leading-tight">
                <span className="text-sm text-white">{fmt(currencyView, total)}</span>
                <span className="text-[11px] text-zinc-400">{fmt(currencyView, perUnit)} / unit</span>
            </div>
        )
    }

    const renderPurchasePerUnit = (it) => {
        const c = compute(it)
        const perUnit = convertMinor(c.purchaseTotalPerUnit, c.itemCur, currencyView, fx.rates).value
        return <span className="text-sm text-white">{fmt(currencyView, perUnit)}</span>
    }

    const renderExpectedTotal = (it, which) => {
        const c = compute(it)
        const perUnit = which === "BEST" ? c.meta.expectedBestPence : c.meta.expectedWorstPence
        if (perUnit == null) return <span className="text-zinc-400">—</span>
        const total = convertMinor(perUnit * c.q, c.itemCur, currencyView, fx.rates).value
        return <span className="text-sm text-white">{fmt(currencyView, total)}</span>
    }

    const renderProfitTotal = (it, which) => {
        const c = compute(it)
        const p = which === "BEST" ? c.profitBestTotal : c.profitWorstTotal
        if (p == null) return <span className="text-zinc-400">—</span>
        const v = convertMinor(p, c.itemCur, currencyView, fx.rates).value
        return (
            <span className={v >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>
                {fmt(currencyView, v)}
            </span>
        )
    }

    const renderProfitPerUnit = (it, which) => {
        const c = compute(it)
        const p = which === "BEST" ? c.profitBestPerUnit : c.profitWorstPerUnit
        if (p == null) return <span className="text-zinc-400">—</span>
        const v = convertMinor(p, c.itemCur, currencyView, fx.rates).value
        return (
            <span className={v >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>
                {fmt(currencyView, v)}
            </span>
        )
    }

    const renderROI = (it, which) => {
        const c = compute(it)
        const perUnit = c.purchaseTotalPerUnit || 0
        const profitPerUnit = which === "BEST" ? c.profitBestPerUnit : c.profitWorstPerUnit
        if (profitPerUnit == null || perUnit <= 0) return <span className="text-zinc-400">—</span>
        const roi = (profitPerUnit / perUnit) * 100
        const val = Number.isFinite(roi) ? roi : null
        if (val == null) return <span className="text-zinc-400">—</span>
        return (
            <span className={val >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>
                {val.toFixed(1)}%
            </span>
        )
    }

    const renderAgeDays = (it) => {
        const created = it.createdAt ? new Date(it.createdAt).getTime() : null
        if (!created || !Number.isFinite(created)) return <span className="text-zinc-400">—</span>
        const days = Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)))
        return <span className="text-sm text-white">{days}</span>
    }

    const renderUpdated = (it) => {
        if (!it.updatedAt) return <span className="text-zinc-400">—</span>
        const d = new Date(it.updatedAt)
        if (Number.isNaN(d.getTime())) return <span className="text-zinc-400">—</span>
        return <span className="text-sm text-white">{d.toLocaleString()}</span>
    }

    const renderListingsChips = (it) => {
        const c = compute(it)
        const ls = c.meta.listings || []
        if (!ls.length) return <span className="text-zinc-400">—</span>

        return (
            <div className="flex flex-wrap items-center gap-2">
                {ls.map((l, idx) => {
                    const href = linkify(l.url)
                    const label = (l.platform || "LINK").toUpperCase()
                    return (
                        <a
                            key={`${label}-${idx}`}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            title={href}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex max-w-[220px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
                        >
                            <span className="truncate">{label}</span>
                            <span className="text-white/50">↗</span>
                        </a>
                    )
                })}
            </div>
        )
    }

    const renderListingPrice = (it) => {
        const c = compute(it)
        if (c.listingPriceTotal == null) return <span className="text-zinc-400">—</span>
        const v = convertMinor(c.listingPriceTotal, c.itemCur, currencyView, fx.rates).value
        return <span className="text-sm text-white">{fmt(currencyView, v)}</span>
    }

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-50">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
                        <p className="mt-1 text-sm text-zinc-300">
                            Customise columns, add items, bulk delete, and keep listing links per platform.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
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
                            onClick={() => setColumnsOpen(true)}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Columns
                        </button>

                        <button
                            type="button"
                            onClick={loadItems}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Refresh
                        </button>

                        <button
                            type="button"
                            onClick={openAdd}
                            className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
                        >
                            Add item
                        </button>
                    </div>
                </div>

                {toast.msg ? (
                    <div className="mb-5">
                        <div
                            className={[
                                "rounded-2xl border px-4 py-3 text-sm",
                                toast.type === "error"
                                    ? "border-red-400/20 bg-red-500/10 text-red-100"
                                    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
                            ].join(" ")}
                        >
                            {toast.msg}
                        </div>
                    </div>
                ) : null}

                <div className="mb-6 grid gap-4 md:grid-cols-5">
                    <StatCard label="Items (rows)" value={totals.rowCount} sub="Unique records" />
                    <StatCard label="Quantity (units)" value={totals.unitCount} sub="Sum of all quantities" />
                    <StatCard label={`Invested (${currencyView})`} value={fmt(currencyView, totals.invested)} sub="Total purchase cost" />
                    <StatCard label={`Best profit (${currencyView})`} value={fmt(currencyView, totals.best)} sub="Expected best sale - cost" />
                    <StatCard label={`Worst profit (${currencyView})`} value={fmt(currencyView, totals.worst)} sub="Expected worst sale - cost" />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Your items</div>
                            <div className="text-xs text-zinc-300">
                                {loading ? "Loading…" : `${items.length} row(s)`} • click a row for details
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => (items.length && selected.size === items.length ? clearSelection() : selectAll())}
                                className="h-10 rounded-2xl border border-white/10 bg-transparent px-4 text-sm font-semibold text-white/90 transition hover:bg-white/5"
                            >
                                {items.length && selected.size === items.length ? "Clear all" : "Select all"}
                            </button>

                            <button
                                type="button"
                                onClick={bulkDelete}
                                disabled={selected.size === 0}
                                className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Bulk delete ({selected.size})
                            </button>
                        </div>
                    </div>

                    {/* SIDE SCROLL */}
                    <div className="rounded-2xl border border-white/10 overflow-hidden">
                        <div className="overflow-x-auto">
                            <div className="min-w-[920px]">
                                <div className="grid bg-white/5 text-xs font-semibold text-zinc-200" style={{ gridTemplateColumns: gridCols }}>
                                    <div className="px-4 py-3"></div>
                                    <div className="px-4 py-3">Title</div>

                                    {columns.sku ? <div className="px-4 py-3">SKU</div> : null}
                                    {columns.category ? <div className="px-4 py-3">Category</div> : null}
                                    {columns.condition ? <div className="px-4 py-3">Condition</div> : null}
                                    {columns.quantity ? <div className="px-4 py-3">Qty</div> : null}
                                    {columns.purchase ? <div className="px-4 py-3">Purchase total</div> : null}
                                    {columns.purchasePerUnit ? <div className="px-4 py-3">Purchase / unit</div> : null}
                                    {columns.status ? <div className="px-4 py-3">Status</div> : null}
                                    {columns.listings ? <div className="px-4 py-3">Listings</div> : null}
                                    {columns.listingPrice ? <div className="px-4 py-3">Listing price</div> : null}

                                    {columns.expectedBest ? <div className="px-4 py-3">Expected best total</div> : null}
                                    {columns.expectedWorst ? <div className="px-4 py-3">Expected worst total</div> : null}

                                    {columns.bestProfit ? <div className="px-4 py-3">Best profit</div> : null}
                                    {columns.worstProfit ? <div className="px-4 py-3">Worst profit</div> : null}

                                    {columns.bestProfitPerUnit ? <div className="px-4 py-3">Best profit / unit</div> : null}
                                    {columns.worstProfitPerUnit ? <div className="px-4 py-3">Worst profit / unit</div> : null}

                                    {columns.roiBest ? <div className="px-4 py-3">ROI best</div> : null}
                                    {columns.roiWorst ? <div className="px-4 py-3">ROI worst</div> : null}

                                    {columns.ageDays ? <div className="px-4 py-3">Age (days)</div> : null}
                                    {columns.updated ? <div className="px-4 py-3">Updated</div> : null}

                                    <div className="px-4 py-3 text-right">Actions</div>
                                </div>

                                {!loading && items.length === 0 ? (
                                    <div className="px-4 py-6 text-sm text-zinc-300">No items yet. Click “Add item”.</div>
                                ) : null}

                                <div className="divide-y divide-white/10">
                                    {items.map((it, idx) => {
                                        const c = compute(it)
                                        return (
                                            <div
                                                key={it.id}
                                                className={[
                                                    "grid cursor-pointer select-none",
                                                    idx % 2 === 0 ? "bg-zinc-950/30" : "bg-zinc-950/10",
                                                    "hover:bg-white/5",
                                                ].join(" ")}
                                                style={{ gridTemplateColumns: gridCols }}
                                                onClick={() => openDetail(it)}
                                            >
                                                <div className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(it.id)}
                                                        onChange={() => toggleSelect(it.id)}
                                                        className="h-4 w-4 rounded border-white/20 bg-transparent accent-white"
                                                    />
                                                </div>

                                                <div className="px-4 py-3 text-sm text-zinc-200">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-white">{it.name}</span>
                                                    </div>
                                                    <div className="mt-1 text-[11px] text-zinc-400">
                                                        {(c.meta.category || "—") + " • " + (c.meta.condition || "—")}
                                                    </div>
                                                </div>

                                                {columns.sku ? <div className="px-4 py-3 text-sm text-zinc-200">{it.sku ?? "—"}</div> : null}
                                                {columns.category ? <div className="px-4 py-3 text-sm text-zinc-200">{c.meta.category ?? "—"}</div> : null}
                                                {columns.condition ? <div className="px-4 py-3 text-sm text-zinc-200">{c.meta.condition ?? "—"}</div> : null}
                                                {columns.quantity ? <div className="px-4 py-3 text-sm text-zinc-200">{c.q}</div> : null}
                                                {columns.purchase ? <div className="px-4 py-3 text-sm text-zinc-200">{renderPurchaseTotal(it)}</div> : null}
                                                {columns.purchasePerUnit ? <div className="px-4 py-3 text-sm text-zinc-200">{renderPurchasePerUnit(it)}</div> : null}
                                                {columns.status ? (
                                                    <div className="px-4 py-3 text-sm text-zinc-200">
                                                        <Pill text={c.status} />
                                                    </div>
                                                ) : null}
                                                {columns.listings ? <div className="px-4 py-3 text-sm text-zinc-200">{renderListingsChips(it)}</div> : null}
                                                {columns.listingPrice ? <div className="px-4 py-3 text-sm text-zinc-200">{renderListingPrice(it)}</div> : null}

                                                {columns.expectedBest ? <div className="px-4 py-3 text-sm text-zinc-200">{renderExpectedTotal(it, "BEST")}</div> : null}
                                                {columns.expectedWorst ? <div className="px-4 py-3 text-sm text-zinc-200">{renderExpectedTotal(it, "WORST")}</div> : null}

                                                {columns.bestProfit ? <div className="px-4 py-3 text-sm text-zinc-200">{renderProfitTotal(it, "BEST")}</div> : null}
                                                {columns.worstProfit ? <div className="px-4 py-3 text-sm text-zinc-200">{renderProfitTotal(it, "WORST")}</div> : null}

                                                {columns.bestProfitPerUnit ? <div className="px-4 py-3 text-sm text-zinc-200">{renderProfitPerUnit(it, "BEST")}</div> : null}
                                                {columns.worstProfitPerUnit ? <div className="px-4 py-3 text-sm text-zinc-200">{renderProfitPerUnit(it, "WORST")}</div> : null}

                                                {columns.roiBest ? <div className="px-4 py-3 text-sm text-zinc-200">{renderROI(it, "BEST")}</div> : null}
                                                {columns.roiWorst ? <div className="px-4 py-3 text-sm text-zinc-200">{renderROI(it, "WORST")}</div> : null}

                                                {columns.ageDays ? <div className="px-4 py-3 text-sm text-zinc-200">{renderAgeDays(it)}</div> : null}
                                                {columns.updated ? <div className="px-4 py-3 text-sm text-zinc-200">{renderUpdated(it)}</div> : null}

                                                <div className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEdit(it)}
                                                            className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => singleDelete(it.id)}
                                                            className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/15"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
                        <div>{fx.nextUpdateUtc ? `FX next update: ${fx.nextUpdateUtc}` : "FX next update: —"}</div>
                        <div className="flex items-center gap-2">
                            <span>Attribution:</span>
                            <span
                                className="text-zinc-300 underline underline-offset-2"
                                dangerouslySetInnerHTML={{
                                    __html:
                                        fx.attributionHtml ||
                                        '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>',
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* COLUMNS MODAL */}
            {columnsOpen ? (
                <Modal
                    title="Customise columns"
                    onClose={() => setColumnsOpen(false)}
                    maxWidth="max-w-2xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button
                                type="button"
                                onClick={() => setColumns(DEFAULT_COLUMNS)}
                                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10"
                            >
                                Reset to default
                            </button>
                            <button
                                type="button"
                                onClick={() => setColumnsOpen(false)}
                                className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
                            >
                                Done
                            </button>
                        </div>
                    }
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        {COLUMN_DEFS.map((d) => (
                            <label
                                key={d.key}
                                className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
                            >
                                <div className="text-sm font-semibold text-white">{d.label}</div>
                                <input
                                    type="checkbox"
                                    checked={!!columns[d.key]}
                                    onChange={() => setColumns((p) => ({ ...p, [d.key]: !p[d.key] }))}
                                    className="h-4 w-4 rounded border-white/20 bg-transparent accent-white"
                                />
                            </label>
                        ))}
                    </div>
                    <div className="mt-4 text-xs text-zinc-300">
                        Tip: enable <span className="font-semibold text-white">Listings</span> to show all listing links as chips in the table.
                    </div>
                </Modal>
            ) : null}

            {/* ADD MODAL */}
            {addOpen ? (
                <Modal
                    title="Add item"
                    onClose={() => setAddOpen(false)}
                    maxWidth="max-w-4xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setAddOpen(false)}
                                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="rt-add-item"
                                disabled={addSaving}
                                className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                            >
                                {addSaving ? "Saving…" : "Create"}
                            </button>
                        </div>
                    }
                >
                    <div className="mb-4">
                        <SectionTabs
                            value={addTab}
                            onChange={setAddTab}
                            tabs={[
                                { value: "BASIC", label: "Basic" },
                                { value: "FINANCE", label: "Finance" },
                                ...(showListingFieldsInAdd ? [{ value: "LISTING", label: "Listing" }] : []),
                            ]}
                        />
                    </div>

                    <form id="rt-add-item" onSubmit={submitAdd} className="space-y-4">
                        {addTab === "BASIC" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Title *">
                                    <input
                                        value={addForm.title}
                                        onChange={(e) => onAddChange({ title: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                        placeholder="e.g. Nike Air Max 95"
                                        autoFocus
                                    />
                                </Field>

                                <Field label="SKU (optional)">
                                    <input
                                        value={addForm.sku}
                                        onChange={(e) => onAddChange({ sku: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                        placeholder="e.g. AM95-001"
                                    />
                                </Field>

                                <Field label="Quantity (units)">
                                    <input
                                        type="number"
                                        min={0}
                                        value={addForm.quantity}
                                        onChange={(e) => onAddChange({ quantity: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    />
                                </Field>

                                <Field label="Status">
                                    <select
                                        value={addForm.status}
                                        onChange={(e) => onAddChange({ status: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        {STATUSES.map(([v, l]) => (
                                            <option key={v} value={v}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                </Field>

                                <Field label="Category">
                                    <select
                                        value={addForm.category}
                                        onChange={(e) => onAddChange({ category: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
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
                                        value={addForm.condition}
                                        onChange={(e) => onAddChange({ condition: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        {CONDITIONS.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </Field>

                                <Field label="Notes" className="md:col-span-2">
                                    <textarea
                                        value={addForm.notes}
                                        onChange={(e) => onAddChange({ notes: e.target.value })}
                                        className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                                        placeholder="Anything useful…"
                                    />
                                </Field>
                            </div>
                        ) : null}

                        {addTab === "FINANCE" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card title={`Finance (${currencyView})`}>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Field label="Total purchase price (all-in) per unit">
                                            <input
                                                inputMode="decimal"
                                                value={addForm.purchaseTotal}
                                                onChange={(e) => onAddChange({ purchaseTotal: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>

                                        <Field label="Expected best sale per unit">
                                            <input
                                                inputMode="decimal"
                                                value={addForm.expectedBest}
                                                onChange={(e) => onAddChange({ expectedBest: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>

                                        <Field label="Expected worst sale per unit" className="md:col-span-2">
                                            <input
                                                inputMode="decimal"
                                                value={addForm.expectedWorst}
                                                onChange={(e) => onAddChange({ expectedWorst: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                        <div className="text-xs font-semibold text-zinc-300">Quick snapshot</div>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                            <Snapshot label="Total cost" value={fmt(currencyView, parseMoneyToPence(addForm.purchaseTotal) * safeInt(addForm.quantity, 0))} />
                                            <Snapshot
                                                label="Best profit"
                                                value={fmt(
                                                    currencyView,
                                                    (parseMoneyToPence(addForm.expectedBest) - parseMoneyToPence(addForm.purchaseTotal)) * safeInt(addForm.quantity, 0)
                                                )}
                                                good
                                            />
                                            <Snapshot
                                                label="Worst profit"
                                                value={fmt(
                                                    currencyView,
                                                    (parseMoneyToPence(addForm.expectedWorst) - parseMoneyToPence(addForm.purchaseTotal)) * safeInt(addForm.quantity, 0)
                                                )}
                                            />
                                        </div>
                                        <div className="mt-2 text-[11px] text-zinc-400">Fees and sold breakdown can come later.</div>
                                    </div>
                                </Card>

                                <Card title="Finance notes">
                                    <ul className="space-y-2 text-sm text-zinc-300">
                                        <li>• Purchase is all-in per unit (what it actually cost you).</li>
                                        <li>• Expected best and worst are your range per unit.</li>
                                        <li>• Display currency is global; values convert using FX.</li>
                                    </ul>
                                </Card>
                            </div>
                        ) : null}

                        {addTab === "LISTING" && showListingFieldsInAdd ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card title="Add listing link(s)">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Field label="Platform">
                                            <select
                                                value={addForm.listingPlatform}
                                                onChange={(e) => onAddChange({ listingPlatform: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                            >
                                                {PLATFORMS.filter(([v]) => v !== "NONE").map(([v, l]) => (
                                                    <option key={v} value={v}>
                                                        {l}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>

                                        <Field label="Listing link (URL)">
                                            <input
                                                value={addForm.listingUrl}
                                                onChange={(e) => onAddChange({ listingUrl: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="https://…"
                                            />
                                        </Field>

                                        <Field label="Listing price per unit (optional)">
                                            <input
                                                inputMode="decimal"
                                                value={addForm.listingPrice}
                                                onChange={(e) => onAddChange({ listingPrice: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>

                                        <div className="flex items-end">
                                            <button
                                                type="button"
                                                onClick={addListingToForm}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
                                            >
                                                Add link
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        {(Array.isArray(addForm.listings) ? addForm.listings : []).length === 0 ? (
                                            <div className="text-sm text-zinc-300">No links added yet.</div>
                                        ) : (
                                            (addForm.listings || []).map((l, idx) => {
                                                const href = linkify(l.url)
                                                return (
                                                    <div
                                                        key={`${l.platform}-${idx}`}
                                                        className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-950/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-white">{l.platform}</div>
                                                            <a
                                                                href={href}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="block truncate text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
                                                            >
                                                                {href}
                                                            </a>
                                                            <div className="mt-1 text-xs text-zinc-400">
                                                                Price: {l.pricePence == null ? "—" : fmt(currencyView, l.pricePence)}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeListingFromForm(idx)}
                                                            className="h-10 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/15"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                </Card>

                                <Card title="Tip">
                                    <div className="text-sm text-zinc-300">
                                        You can add multiple listing links across platforms. Enable the <span className="font-semibold text-white">Listings</span>{" "}
                                        column to show them in the table.
                                    </div>
                                </Card>
                            </div>
                        ) : null}
                    </form>
                </Modal>
            ) : null}

            {/* EDIT MODAL */}
            {editOpen ? (
                <Modal
                    title="Edit item"
                    onClose={() => {
                        setEditOpen(false)
                        setEditItem(null)
                    }}
                    maxWidth="max-w-4xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setEditOpen(false)
                                    setEditItem(null)
                                }}
                                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="rt-edit-item"
                                disabled={editSaving}
                                className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                            >
                                {editSaving ? "Saving…" : "Save changes"}
                            </button>
                        </div>
                    }
                >
                    <div className="mb-4">
                        <SectionTabs
                            value={editTab}
                            onChange={setEditTab}
                            tabs={[
                                { value: "BASIC", label: "Basic" },
                                { value: "FINANCE", label: "Finance" },
                                ...(showListingFieldsInEdit ? [{ value: "LISTING", label: "Listing" }] : []),
                            ]}
                        />
                    </div>

                    <form id="rt-edit-item" onSubmit={submitEdit} className="space-y-4">
                        {editTab === "BASIC" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Title *">
                                    <input
                                        value={editForm.title}
                                        onChange={(e) => onEditChange({ title: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                        placeholder="e.g. Nike Air Max 95"
                                        autoFocus
                                    />
                                </Field>

                                <Field label="SKU (optional)">
                                    <input
                                        value={editForm.sku}
                                        onChange={(e) => onEditChange({ sku: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                        placeholder="e.g. AM95-001"
                                    />
                                </Field>

                                <Field label="Quantity (units)">
                                    <input
                                        type="number"
                                        min={0}
                                        value={editForm.quantity}
                                        onChange={(e) => onEditChange({ quantity: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    />
                                </Field>

                                <Field label="Status">
                                    <select
                                        value={editForm.status}
                                        onChange={(e) => onEditChange({ status: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        {STATUSES.map(([v, l]) => (
                                            <option key={v} value={v}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                </Field>

                                <Field label="Category">
                                    <select
                                        value={editForm.category}
                                        onChange={(e) => onEditChange({ category: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
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
                                        value={editForm.condition}
                                        onChange={(e) => onEditChange({ condition: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        {CONDITIONS.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </Field>

                                <Field label="Notes" className="md:col-span-2">
                                    <textarea
                                        value={editForm.notes}
                                        onChange={(e) => onEditChange({ notes: e.target.value })}
                                        className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                                        placeholder="Anything useful…"
                                    />
                                </Field>
                            </div>
                        ) : null}

                        {editTab === "FINANCE" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card title={`Finance (${currencyView})`}>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Field label="Total purchase price (all-in) per unit">
                                            <input
                                                inputMode="decimal"
                                                value={editForm.purchaseTotal}
                                                onChange={(e) => onEditChange({ purchaseTotal: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>

                                        <Field label="Expected best sale per unit">
                                            <input
                                                inputMode="decimal"
                                                value={editForm.expectedBest}
                                                onChange={(e) => onEditChange({ expectedBest: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>

                                        <Field label="Expected worst sale per unit" className="md:col-span-2">
                                            <input
                                                inputMode="decimal"
                                                value={editForm.expectedWorst}
                                                onChange={(e) => onEditChange({ expectedWorst: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                        <div className="text-xs font-semibold text-zinc-300">Quick snapshot</div>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                            <Snapshot label="Total cost" value={fmt(currencyView, parseMoneyToPence(editForm.purchaseTotal) * safeInt(editForm.quantity, 0))} />
                                            <Snapshot
                                                label="Best profit"
                                                value={fmt(
                                                    currencyView,
                                                    (parseMoneyToPence(editForm.expectedBest) - parseMoneyToPence(editForm.purchaseTotal)) * safeInt(editForm.quantity, 0)
                                                )}
                                                good
                                            />
                                            <Snapshot
                                                label="Worst profit"
                                                value={fmt(
                                                    currencyView,
                                                    (parseMoneyToPence(editForm.expectedWorst) - parseMoneyToPence(editForm.purchaseTotal)) * safeInt(editForm.quantity, 0)
                                                )}
                                            />
                                        </div>
                                        <div className="mt-2 text-[11px] text-zinc-400">Fees and sold breakdown can come later.</div>
                                    </div>
                                </Card>

                                <Card title="Finance notes">
                                    <ul className="space-y-2 text-sm text-zinc-300">
                                        <li>• Purchase is all-in per unit (what it actually cost you).</li>
                                        <li>• Expected best and worst are your range per unit.</li>
                                        <li>• Display currency is global; values convert using FX.</li>
                                    </ul>
                                </Card>
                            </div>
                        ) : null}

                        {editTab === "LISTING" && showListingFieldsInEdit ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card title="Edit listing link(s)">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Field label="Platform">
                                            <select
                                                value={editForm.listingPlatform}
                                                onChange={(e) => onEditChange({ listingPlatform: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                            >
                                                {PLATFORMS.filter(([v]) => v !== "NONE").map(([v, l]) => (
                                                    <option key={v} value={v}>
                                                        {l}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>

                                        <Field label="Listing link (URL)">
                                            <input
                                                value={editForm.listingUrl}
                                                onChange={(e) => onEditChange({ listingUrl: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="https://…"
                                            />
                                        </Field>

                                        <Field label="Listing price per unit (optional)">
                                            <input
                                                inputMode="decimal"
                                                value={editForm.listingPrice}
                                                onChange={(e) => onEditChange({ listingPrice: e.target.value })}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                                placeholder="0.00"
                                            />
                                        </Field>

                                        <div className="flex items-end">
                                            <button
                                                type="button"
                                                onClick={addListingToEditForm}
                                                className="h-11 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
                                            >
                                                Add link
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        {(Array.isArray(editForm.listings) ? editForm.listings : []).length === 0 ? (
                                            <div className="text-sm text-zinc-300">No links added yet.</div>
                                        ) : (
                                            (editForm.listings || []).map((l, idx) => {
                                                const href = linkify(l.url)
                                                return (
                                                    <div
                                                        key={`${l.platform}-${idx}`}
                                                        className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-950/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-white">{l.platform}</div>
                                                            <a
                                                                href={href}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="block truncate text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
                                                            >
                                                                {href}
                                                            </a>
                                                            <div className="mt-1 text-xs text-zinc-400">
                                                                Price: {l.pricePence == null ? "—" : fmt(currencyView, l.pricePence)}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeListingFromEditForm(idx)}
                                                            className="h-10 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/15"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                </Card>

                                <Card title="Tip">
                                    <div className="text-sm text-zinc-300">
                                        You can add multiple listing links across platforms. Enable the <span className="font-semibold text-white">Listings</span>{" "}
                                        column to show them in the table.
                                    </div>
                                </Card>
                            </div>
                        ) : null}
                    </form>
                </Modal>
            ) : null}

            {/* DETAIL MODAL */}
            {detailOpen && detailItem ? (
                <Modal
                    title={detailItem.name}
                    onClose={() => {
                        setDetailOpen(false)
                        setDetailItem(null)
                    }}
                    maxWidth="max-w-5xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button
                                type="button"
                                onClick={() => singleDelete(detailItem.id)}
                                className="h-11 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/15"
                            >
                                Delete
                            </button>

                            <button
                                type="button"
                                onClick={() => openEdit(detailItem)}
                                className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15"
                            >
                                Edit
                            </button>
                        </div>
                    }
                >
                    <DetailPanel item={detailItem} currencyView={currencyView} rates={fx.rates} />
                </Modal>
            ) : null}
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

function DetailPanel({ item, currencyView, rates }) {
    const c = compute(item)
    const toView = (minor) => fmt(currencyView, convertMinor(minor, c.itemCur, currencyView, rates).value)
    const showListing = c.status === "LISTED" || c.status === "SOLD"

    const bestProfit =
        c.profitBestTotal == null ? null : convertMinor(c.profitBestTotal, c.itemCur, currencyView, rates).value
    const worstProfit =
        c.profitWorstTotal == null ? null : convertMinor(c.profitWorstTotal, c.itemCur, currencyView, rates).value

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card title="Item">
                <Row label="Status" value={<Pill text={c.status} />} />
                <Row label="Category" value={c.meta.category || "—"} />
                <Row label="Condition" value={c.meta.condition || "—"} />
                <Row label="Quantity" value={c.q} />
                <Row label="SKU" value={item.sku ?? "—"} />
            </Card>

            <Card title={`Finance (${currencyView})`}>
                <Row label="Total purchase" value={toView(c.purchaseTotal)} />
                <Row label="Expected best total" value={c.meta.expectedBestPence == null ? "—" : toView(c.meta.expectedBestPence * c.q)} />
                <Row label="Expected worst total" value={c.meta.expectedWorstPence == null ? "—" : toView(c.meta.expectedWorstPence * c.q)} />
                <Row
                    label="Best profit"
                    value={
                        bestProfit == null ? (
                            "—"
                        ) : (
                            <span className={bestProfit >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>
                                {fmt(currencyView, bestProfit)}
                            </span>
                        )
                    }
                />
                <Row
                    label="Worst profit"
                    value={
                        worstProfit == null ? (
                            "—"
                        ) : (
                            <span className={worstProfit >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>
                                {fmt(currencyView, worstProfit)}
                            </span>
                        )
                    }
                />
            </Card>

            <Card title="Listing links" className="md:col-span-2">
                {!showListing ? (
                    <div className="text-sm text-zinc-300">Not listed. Listing links appear when status is Listed or Sold.</div>
                ) : (c.meta.listings || []).length === 0 ? (
                    <div className="text-sm text-zinc-300">No listing links added.</div>
                ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                        {(c.meta.listings || []).map((l, idx) => {
                            const href = linkify(l.url)
                            const price = l.pricePence == null ? "—" : toView((l.pricePence || 0) * c.q)
                            return (
                                <div key={`${l.platform}-${idx}`} className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-semibold text-white">{l.platform}</div>
                                        <div className="text-xs text-zinc-300">Listing: {price}</div>
                                    </div>
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-2 block truncate text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
                                        title={href}
                                    >
                                        {href}
                                    </a>
                                </div>
                            )
                        })}
                    </div>
                )}
            </Card>

            <Card title="Notes" className="md:col-span-2">
                <div className="text-sm text-zinc-200 whitespace-pre-wrap">{c.notesPlain || "—"}</div>
            </Card>

            <Card title="Meta" className="md:col-span-2">
                <Row label="ID" value={<code className="rounded bg-white/5 px-2 py-1 text-xs">{item.id}</code>} />
                <Row label="Created" value={item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"} />
                <Row label="Updated" value={item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"} />
            </Card>
        </div>
    )
}
