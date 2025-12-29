// app/program/tools/page.js
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

const CURRENCY_META = {
    GBP: { symbol: "£", label: "GBP" },
    USD: { symbol: "$", label: "USD" },
    EUR: { symbol: "€", label: "EUR" },
    CAD: { symbol: "$", label: "CAD" },
    AUD: { symbol: "$", label: "AUD" },
    JPY: { symbol: "¥", label: "JPY" },
}

const safeStr = (x) => String(x ?? "").trim()
const safeInt = (x, d = 0) => {
    const n = Number(x)
    if (!Number.isFinite(n)) return d
    return Math.trunc(n)
}
const clampInt = (x, d = 0) => Math.max(0, safeInt(x, d))

const parseMoneyToPence = (v) => {
    const s = safeStr(v)
    if (!s) return 0
    const norm = s.replace(/,/g, "").replace(/[^\d.-]/g, "")
    const n = Number(norm)
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100)
}
const penceToMoney = (p) => {
    const n = Number(p)
    if (!Number.isFinite(n)) return "0.00"
    return (n / 100).toFixed(2)
}
const fmt = (currency, minorUnits) => {
    const c = CURRENCY_META[(currency || "GBP").toUpperCase()] || CURRENCY_META.GBP
    const n = Number.isFinite(minorUnits) ? minorUnits : 0
    const sign = n < 0 ? "-" : ""
    return `${sign}${c.symbol}${(Math.abs(n) / 100).toFixed(2)}`
}

const pad2 = (n) => String(n).padStart(2, "0")

const toISODateOnly = (v) => {
    if (!v) return ""
    const d = v instanceof Date ? v : new Date(v)
    if (Number.isNaN(d.getTime())) return ""
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Notes wrapper
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
const normaliseMeta = (meta) => {
    const m = meta && typeof meta === "object" ? meta : {}
    const currency = safeStr(m.currency || "GBP").toUpperCase()
    const status = safeStr(m.status || "UNLISTED").toUpperCase()
    const purchaseTotalPence = Number(m.purchaseTotalPence) || 0
    const category = safeStr(m.category || "")
    const condition = safeStr(m.condition || "")
    const listings = Array.isArray(m.listings)
        ? m.listings
            .map((x) => ({
                platform: safeStr(x?.platform || "OTHER").toUpperCase(),
                url: safeStr(x?.url) || "",
                pricePence: x?.pricePence == null ? null : Number(x.pricePence),
            }))
            .filter((x) => x.url || Number.isFinite(x.pricePence))
        : []
    return { currency, status, purchaseTotalPence, category, condition, listings }
}

// ---------- CSV parsing ----------
function parseCSV(text) {
    const s = String(text ?? "")
    if (!s.trim()) return { headers: [], rows: [] }

    const rows = []
    let row = []
    let cell = ""
    let inQuotes = false

    for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        const next = s[i + 1]

        if (inQuotes) {
            if (ch === `"` && next === `"`) {
                cell += `"`
                i++
            } else if (ch === `"`) {
                inQuotes = false
            } else {
                cell += ch
            }
            continue
        }

        if (ch === `"`) {
            inQuotes = true
            continue
        }

        if (ch === ",") {
            row.push(cell)
            cell = ""
            continue
        }

        if (ch === "\n") {
            row.push(cell)
            cell = ""
            row = row.map((x) => (typeof x === "string" ? x.replace(/\r$/, "") : x))
            rows.push(row)
            row = []
            continue
        }

        cell += ch
    }

    row.push(cell)
    row = row.map((x) => (typeof x === "string" ? x.replace(/\r$/, "") : x))
    if (row.some((x) => String(x ?? "").trim().length > 0)) rows.push(row)

    if (rows.length === 0) return { headers: [], rows: [] }

    const headers = rows[0].map((h) => safeStr(h))
    const data = rows.slice(1)
    return { headers, rows: data }
}

function normaliseHeader(h) {
    return safeStr(h)
        .toLowerCase()
        .replace(/[\s_-]+/g, "")
        .replace(/[^\w]/g, "")
}

const AUTOFIELDS = {
    name: ["name", "title", "item", "product", "description", "listingtitle"],
    sku: ["sku", "code", "productcode", "sellersku", "itemnumber", "ref", "reference"],
    quantity: ["qty", "quantity", "stock", "units", "count", "available", "onhand", "onhandqty"],
    category: ["category", "cat", "type", "department", "group", "collection"],
    condition: ["condition", "cond", "state", "quality"],
    status: ["status", "listingstatus", "state", "listing_state"],
    purchaseTotal: ["purchase", "buy", "cost", "buyprice", "purchaseprice", "purchasecost", "paid", "costprice"],
    listedPrice: ["price", "listingprice", "saleprice", "listprice", "ask", "asking"],
    platform: ["platform", "marketplace", "site", "channel"],
    url: ["url", "link", "listingurl", "itemurl", "listing_link"],
    notes: ["notes", "note", "comment", "comments", "memo", "details"],
}

function bestHeaderMatch(headers, candidates) {
    const normed = headers.map((h) => ({ raw: h, n: normaliseHeader(h) }))
    const candNorm = (candidates || []).map((c) => normaliseHeader(c))

    for (const c of candNorm) {
        const hit = normed.find((x) => x.n === c)
        if (hit) return hit.raw
    }
    for (const c of candNorm) {
        const hit = normed.find((x) => x.n.includes(c) || c.includes(x.n))
        if (hit) return hit.raw
    }
    return ""
}

function autoMap(headers) {
    const h = Array.isArray(headers) ? headers : []
    const mapping = {
        name: bestHeaderMatch(h, AUTOFIELDS.name),
        sku: bestHeaderMatch(h, AUTOFIELDS.sku),
        quantity: bestHeaderMatch(h, AUTOFIELDS.quantity),
        category: bestHeaderMatch(h, AUTOFIELDS.category),
        condition: bestHeaderMatch(h, AUTOFIELDS.condition),
        status: bestHeaderMatch(h, AUTOFIELDS.status),
        purchaseTotal: bestHeaderMatch(h, AUTOFIELDS.purchaseTotal),
        listedPrice: bestHeaderMatch(h, AUTOFIELDS.listedPrice),
        platform: bestHeaderMatch(h, AUTOFIELDS.platform),
        url: bestHeaderMatch(h, AUTOFIELDS.url),
        notes: bestHeaderMatch(h, AUTOFIELDS.notes),
    }
    if (!mapping.name) mapping.name = h[0] || ""
    return mapping
}

function pick(rowObj, headerKey) {
    if (!headerKey) return ""
    return rowObj[headerKey]
}
function normaliseStatus(s) {
    const v = safeStr(s).toUpperCase()
    if (!v) return "UNLISTED"
    if (["LISTED", "ACTIVE", "LIVE"].includes(v)) return "LISTED"
    if (["SOLD", "DONE", "COMPLETED"].includes(v)) return "SOLD"
    if (["UNLISTED", "DRAFT", "INVENTORY"].includes(v)) return "UNLISTED"
    return v
}

// ---------- UI ----------
function Modal({ title, onClose, children, footer, maxWidth = "max-w-3xl" }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
            <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
            <div
                className={[
                    "relative w-full rounded-3xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur",
                    maxWidth,
                ].join(" ")}
            >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{title}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/80 hover:bg-white/10"
                    >
                        Close
                    </button>
                </div>

                <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>

                {footer ? <div className="border-t border-white/10 p-4">{footer}</div> : null}
            </div>
        </div>
    )
}
function Toast({ toast }) {
    if (!toast?.type) return null
    const tone =
        toast.type === "ok"
            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
            : "border-red-400/20 bg-red-500/10 text-red-100"
    return (
        <div className="fixed bottom-4 right-4 z-[60] max-w-[90vw]">
            <div className={["rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur", tone].join(" ")}>
                {toast.msg}
            </div>
        </div>
    )
}
function ToolCard({ title, sub, icon, tone, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "group w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition",
                "hover:bg-white/10 hover:border-white/15 focus:outline-none focus:ring-2 focus:ring-white/20",
            ].join(" ")}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <div className={["grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br", tone].join(" ")}>
                            <span className="text-xl">{icon}</span>
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-white">{title}</div>
                            <div className="mt-1 text-sm text-zinc-300">{sub}</div>
                        </div>
                    </div>
                </div>
                <div className="mt-1 shrink-0 text-sm font-semibold text-white/60 transition group-hover:text-white">
                    Open →
                </div>
            </div>
        </button>
    )
}
function Select({ label, value, onChange, children }) {
    return (
        <label className="block">
            <div className="mb-2 text-xs font-semibold text-zinc-300">{label}</div>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
            >
                {children}
            </select>
        </label>
    )
}
function Divider() {
    return <div className="my-4 h-px bg-white/10" />
}
function InfoBox({ title, children, tone = "bg-white/5" }) {
    return (
        <div className={["rounded-2xl border border-white/10 p-4 text-sm text-zinc-300", tone].join(" ")}>
            <div className="text-sm font-semibold text-white">{title}</div>
            <div className="mt-2 space-y-2">{children}</div>
        </div>
    )
}

// ---------- API helpers ----------
async function apiDeleteItem(id) {
    const try1 = await fetch(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
    if (try1 && try1.ok) return true

    const try2 = await fetch(`/api/items?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
    if (try2 && try2.ok) return true

    const try3 = await fetch(`/api/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    }).catch(() => null)
    if (try3 && try3.ok) return true

    const errText = (try3 && (await try3.text().catch(() => ""))) || ""
    throw new Error(errText || "Delete failed (API not implemented)")
}

async function apiUpdateItem(id, patch) {
    const try1 = await fetch(`/api/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    }).catch(() => null)
    if (try1 && try1.ok) return await try1.json().catch(() => ({}))

    const try2 = await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    }).catch(() => null)
    if (try2 && try2.ok) return await try2.json().catch(() => ({}))

    const try3 = await fetch(`/api/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
    }).catch(() => null)
    if (try3 && try3.ok) return await try3.json().catch(() => ({}))

    const errText = (try3 && (await try3.text().catch(() => ""))) || ""
    throw new Error(errText || "Update failed (API not implemented)")
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function ToolsPage() {
    const [toast, setToast] = useState({ type: "", msg: "" })
    const showToast = (type, msg) => {
        setToast({ type, msg })
        window.clearTimeout(showToast._t)
        showToast._t = window.setTimeout(() => setToast({ type: "", msg: "" }), 2200)
    }

    const [currencyView, setCurrencyView] = useState(() => {
        if (typeof window === "undefined") return "GBP"
        return localStorage.getItem("rt_currency_view") || "GBP"
    })
    useEffect(() => {
        if (typeof window !== "undefined") localStorage.setItem("rt_currency_view", currencyView)
    }, [currencyView])

    const [items, setItems] = useState([])
    const [sales, setSales] = useState([])
    const [loading, setLoading] = useState(true)

    const loadAll = async () => {
        setLoading(true)
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
            setItems([])
            setSales([])
            showToast("error", e?.message || "Failed to load data")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ---------- modals ----------
    const [importOpen, setImportOpen] = useState(false)
    const [exportOpen, setExportOpen] = useState(false)
    const [profitOpen, setProfitOpen] = useState(false)
    const [agedOpen, setAgedOpen] = useState(false)
    const [dupeOpen, setDupeOpen] = useState(false)
    const [taxOpen, setTaxOpen] = useState(false)
    const [oppOpen, setOppOpen] = useState(false)
    const [healthOpen, setHealthOpen] = useState(false)

    // ---------- EXPORT ----------
    const [exportMode, setExportMode] = useState("items") // items | sales | both
    const [exportFormat, setExportFormat] = useState("csv") // csv | json
    const [exportBusy, setExportBusy] = useState(false)
    const [exportCount, setExportCount] = useState(0)
    const [exportIncludeDates, setExportIncludeDates] = useState(false)

    const toCSV = (rows) => {
        const arr = Array.isArray(rows) ? rows : []
        if (arr.length === 0) return ""
        const cols = Object.keys(arr[0] || {})
        const esc = (v) => {
            const s = String(v ?? "")
            if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
            return s
        }
        const head = cols.join(",")
        const body = arr.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n")
        return `${head}\n${body}\n`
    }

    const downloadText = (filename, text) => {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }

    const stampNow = () => {
        const d = new Date()
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(
            d.getMinutes()
        )}-${pad2(d.getSeconds())}`
    }

    const buildSafeExport = () => {
        const safeItems = (Array.isArray(items) ? items : []).map((it) => {
            const decoded = decodeNotes(it.notes)
            const meta = normaliseMeta(decoded.meta)
            const firstListing = meta.listings?.[0] || null

            const base = {
                title: it.name ?? "",
                sku: it.sku ?? "",
                category: meta.category || "",
                condition: meta.condition || "",
                status: meta.status || (it.status ? String(it.status).toUpperCase() : "UNLISTED"),
                quantity: clampInt(it.quantity, 0),
                currency: currencyView,
                purchaseTotal: penceToMoney(
                    Number(meta.purchaseTotalPence || it.costPence || it.purchaseSubtotalPence || 0) || 0
                ),
                listedPrice: firstListing?.pricePence != null ? penceToMoney(Number(firstListing.pricePence) || 0) : "",
                platform: firstListing?.platform || "",
                url: firstListing?.url || "",
                notes: decoded.notes || safeStr(it.notes) || "",
            }

            if (!exportIncludeDates) return base

            const createdDate = toISODateOnly(it.createdAt)
            const updatedDate = toISODateOnly(it.updatedAt)

            return { ...base, createdDate: createdDate || "", updatedDate: updatedDate || "" }
        })

        const safeSales = (Array.isArray(sales) ? sales : []).map((s) => {
            const base = {
                itemName: s.itemName ?? s.item?.name ?? "",
                sku: s.sku ?? s.itemSku ?? "",
                platform: String(s.platform ?? "").toUpperCase(),
                quantitySold: clampInt(s.quantitySold, 0),
                currency: currencyView,
                salePricePerUnit: penceToMoney(Number(s.salePricePerUnitPence || 0)),
                fees: penceToMoney(Number(s.feesPence || 0)),
                net: penceToMoney(Number(s.netPence || 0)),
                costTotal: penceToMoney(Number(s.costTotalPence || 0)),
                notes: safeStr(s.notes) || "",
            }

            if (!exportIncludeDates) return base

            const soldDate = toISODateOnly(s.soldAt)
            return { ...base, soldDate: soldDate || "" }
        })

        return { safeItems, safeSales }
    }

    const doExport = async () => {
        if (exportBusy) return
        setExportBusy(true)
        try {
            const { safeItems, safeSales } = buildSafeExport()
            const stamp = stampNow()
            const n = exportCount + 1
            setExportCount(n)

            if (exportFormat === "json") {
                const payload =
                    exportMode === "items"
                        ? { items: safeItems }
                        : exportMode === "sales"
                            ? { sales: safeSales }
                            : { items: safeItems, sales: safeSales }

                downloadText(`reselltracker-export-${exportMode}-${stamp}-#${n}.json`, JSON.stringify(payload, null, 2))
            } else {
                if (exportMode === "items") {
                    downloadText(`reselltracker-items-${stamp}-#${n}.csv`, toCSV(safeItems))
                } else if (exportMode === "sales") {
                    downloadText(`reselltracker-sales-${stamp}-#${n}.csv`, toCSV(safeSales))
                } else {
                    const combined = []
                    for (const r of safeItems) combined.push({ recordType: "ITEM", ...r })
                    for (const r of safeSales) combined.push({ recordType: "SALE", ...r })
                    downloadText(`reselltracker-export-both-${stamp}-#${n}.csv`, toCSV(combined))
                }
            }

            await sleep(50)
            showToast("ok", "Export created")
        } catch (e) {
            showToast("error", e?.message || "Export failed")
        } finally {
            setExportBusy(false)
        }
    }

    // ---------- IMPORT (single definitions ONLY) ----------
    const fileRef = useRef(null)
    const [importBusy, setImportBusy] = useState(false)
    const [csvText, setCsvText] = useState("")
    const parsed = useMemo(() => parseCSV(csvText), [csvText])
    const mapping = useMemo(() => autoMap(parsed.headers), [parsed.headers])

    const [importMode, setImportMode] = useState("auto") // auto | strict
    const [importDryRun, setImportDryRun] = useState(true)

    const resetImport = () => {
        setCsvText("")
        setImportBusy(false)
        setImportDryRun(true)
        setImportMode("auto")
        if (fileRef.current) fileRef.current.value = ""
    }

    const readFile = async (file) => {
        const t = await file.text()
        setCsvText(t)
    }

    const postItem = async (payload) => {
        const res = await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || `Create item failed (${res.status})`)
        return data
    }

    const buildPayloadFromRowObj = (obj) => {
        const title = safeStr(pick(obj, mapping.name))
        const sku = safeStr(pick(obj, mapping.sku)) || null

        const quantityRaw = pick(obj, mapping.quantity)
        const quantity = quantityRaw === "" || quantityRaw == null ? 1 : Math.max(1, clampInt(quantityRaw, 1))

        const category = safeStr(pick(obj, mapping.category)) || null
        const condition = safeStr(pick(obj, mapping.condition)) || null
        const status = normaliseStatus(pick(obj, mapping.status))

        const purchaseTotalRaw = pick(obj, mapping.purchaseTotal)
        const listedPriceRaw = pick(obj, mapping.listedPrice)

        const purchaseTotalPence = purchaseTotalRaw ? parseMoneyToPence(purchaseTotalRaw) : 0
        const listedPricePence = listedPriceRaw ? parseMoneyToPence(listedPriceRaw) : 0

        const platform = safeStr(pick(obj, mapping.platform)) || "OTHER"
        const url = safeStr(pick(obj, mapping.url)) || ""
        const notesPlain = safeStr(pick(obj, mapping.notes)) || ""

        const isListed = status === "LISTED"
        const listings = isListed
            ? [
                {
                    platform: platform.toUpperCase(),
                    url,
                    pricePence: listedPricePence > 0 ? listedPricePence : null,
                },
            ].filter((x) => safeStr(x.url) || Number.isFinite(x.pricePence))
            : []

        const meta = {
            currency: currencyView,
            status: status || "UNLISTED",
            category,
            condition,
            purchaseTotalPence,
            listings,
        }

        return {
            name: title,
            sku,
            quantity,
            costPence: purchaseTotalPence,
            notes: encodeNotes(notesPlain, meta),
        }
    }

    const importStats = useMemo(() => {
        const headers = parsed.headers
        const rows = parsed.rows
        if (!headers.length || !rows.length) {
            return { total: 0, canImport: 0, willSkip: 0, missingName: 0, detected: mapping }
        }

        let missingName = 0
        let willSkip = 0
        let canImport = 0

        for (const r of rows) {
            const obj = {}
            for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i]

            const title = safeStr(pick(obj, mapping.name))
            const qtyRaw = pick(obj, mapping.quantity)
            const purchaseRaw = pick(obj, mapping.purchaseTotal)

            if (!title) {
                missingName++
                willSkip++
                continue
            }

            if (importMode === "strict") {
                const strictQty = qtyRaw != null && safeStr(qtyRaw) !== "" && clampInt(qtyRaw, 0) > 0
                const strictPurchase = purchaseRaw != null && safeStr(purchaseRaw) !== "" && parseMoneyToPence(purchaseRaw) >= 0
                if (!strictQty || !strictPurchase) {
                    willSkip++
                    continue
                }
            }

            canImport++
        }

        return { total: rows.length, canImport, willSkip, missingName, detected: mapping }
    }, [parsed.headers, parsed.rows, mapping, importMode])

    const previewRows = useMemo(() => {
        const headers = parsed.headers
        const rows = parsed.rows
        if (!headers.length || !rows.length) return []
        return rows.slice(0, 8).map((r, idx) => {
            const obj = {}
            for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i]
            const title = safeStr(pick(obj, mapping.name))
            const quantityRaw = pick(obj, mapping.quantity)
            const quantity = quantityRaw === "" || quantityRaw == null ? 1 : Math.max(1, clampInt(quantityRaw, 1))
            const purchaseTotalRaw = pick(obj, mapping.purchaseTotal)
            const purchasePence = purchaseTotalRaw ? parseMoneyToPence(purchaseTotalRaw) : 0
            return {
                _k: `${idx}`,
                title,
                quantity,
                purchasePence,
                sku: safeStr(pick(obj, mapping.sku)) || "",
                status: normaliseStatus(pick(obj, mapping.status)),
            }
        })
    }, [parsed.headers, parsed.rows, mapping])

    const doImport = async () => {
        const headers = parsed.headers
        const rows = parsed.rows
        if (!headers.length || !rows.length) return showToast("error", "CSV has no rows")

        setImportBusy(true)
        try {
            let ok = 0
            let skipped = 0

            for (const r of rows) {
                const obj = {}
                for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i]

                const title = safeStr(pick(obj, mapping.name))
                if (!title) {
                    skipped++
                    continue
                }

                if (importMode === "strict") {
                    const qtyRaw = pick(obj, mapping.quantity)
                    const purchaseRaw = pick(obj, mapping.purchaseTotal)
                    const strictQty = qtyRaw != null && safeStr(qtyRaw) !== "" && clampInt(qtyRaw, 0) > 0
                    const strictPurchase = purchaseRaw != null && safeStr(purchaseRaw) !== "" && parseMoneyToPence(purchaseRaw) >= 0
                    if (!strictQty || !strictPurchase) {
                        skipped++
                        continue
                    }
                }

                if (importDryRun) {
                    ok++
                    continue
                }

                const payload = buildPayloadFromRowObj(obj)
                await postItem(payload)
                ok++
            }

            if (importDryRun) {
                showToast("ok", `Ready: ${ok} row(s) • skipped ${skipped}`)
            } else {
                await loadAll()
                showToast("ok", `Imported ${ok} item(s)${skipped ? ` • skipped ${skipped}` : ""}`)
                setImportOpen(false)
                resetImport()
            }
        } catch (e) {
            showToast("error", e?.message || "Import failed")
        } finally {
            setImportBusy(false)
        }
    }

    // ---------- AGED STOCK ----------
    const [agedDays, setAgedDays] = useState("30")
    const agedCutoffDays = Math.max(0, clampInt(agedDays, 30))
    const agedResults = useMemo(() => {
        const now = Date.now()
        const its = Array.isArray(items) ? items : []
        return its
            .map((it) => {
                const updated = it.updatedAt ? new Date(it.updatedAt).getTime() : null
                const created = it.createdAt ? new Date(it.createdAt).getTime() : null
                const t = updated ?? created ?? null
                const ageDays = t ? Math.floor((now - t) / 86400000) : null
                return { it, ageDays }
            })
            .filter((x) => x.ageDays != null && x.ageDays >= agedCutoffDays)
            .sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0))
            .slice(0, 30)
    }, [items, agedCutoffDays])

    // ---------- DUPLICATES ----------
    const [dupeBusyKey, setDupeBusyKey] = useState("")
    const [dupeActionBusy, setDupeActionBusy] = useState(false)

    const duplicates = useMemo(() => {
        const its = Array.isArray(items) ? items : []
        const mapSku = new Map()
        const mapName = new Map()

        for (const it of its) {
            const sku = safeStr(it.sku).toLowerCase()
            const name = safeStr(it.name).toLowerCase()
            if (sku) mapSku.set(sku, [...(mapSku.get(sku) || []), it])
            if (name) mapName.set(name, [...(mapName.get(name) || []), it])
        }

        const skuDupes = Array.from(mapSku.entries())
            .filter(([, arr]) => arr.length > 1)
            .map(([k, arr]) => ({
                k,
                type: "SKU",
                arr: [...arr].sort((a, b) => clampInt(b.quantity, 0) - clampInt(a.quantity, 0)),
            }))
            .slice(0, 20)

        const nameDupes = Array.from(mapName.entries())
            .filter(([, arr]) => arr.length > 1)
            .map(([k, arr]) => ({
                k,
                type: "Title",
                arr: [...arr].sort((a, b) => clampInt(b.quantity, 0) - clampInt(a.quantity, 0)),
            }))
            .slice(0, 20)

        return [...skuDupes, ...nameDupes].slice(0, 20)
    }, [items])

    const canMutateItems = useMemo(() => (Array.isArray(items) ? items : []).some((it) => it?.id != null), [items])

    const removeDuplicates = async (group) => {
        if (!group?.arr?.length) return
        const keep = group.arr[0]
        const toDelete = group.arr.slice(1).filter((x) => x?.id != null)
        if (!keep?.id) return showToast("error", "Cannot remove: item IDs not available")

        setDupeActionBusy(true)
        setDupeBusyKey(`${group.type}:${group.k}:remove`)
        try {
            for (const it of toDelete) await apiDeleteItem(it.id)
            await loadAll()
            showToast("ok", `Removed ${toDelete.length} duplicate(s)`)
        } catch (e) {
            showToast("error", e?.message || "Remove duplicates failed")
        } finally {
            setDupeActionBusy(false)
            setDupeBusyKey("")
        }
    }

    const mergeDuplicates = async (group) => {
        if (!group?.arr?.length) return
        const keep = group.arr[0]
        const others = group.arr.slice(1)
        if (!keep?.id) return showToast("error", "Cannot merge: item IDs not available")

        setDupeActionBusy(true)
        setDupeBusyKey(`${group.type}:${group.k}:merge`)
        try {
            const totalQty = group.arr.reduce((sum, it) => sum + clampInt(it.quantity, 0), 0)

            const mergedFrom = others
                .map((x) => `${safeStr(x.name || "item")} (id:${x.id}, qty:${clampInt(x.quantity, 0)})`)
                .filter(Boolean)
                .join("; ")

            const patch = { quantity: totalQty }
            if (typeof keep.notes === "string") {
                const extra = mergedFrom ? `\n\nMerged duplicates: ${mergedFrom}` : ""
                patch.notes = `${keep.notes || ""}${extra}`.trim()
            }

            await apiUpdateItem(keep.id, patch)
            for (const it of others) {
                if (it?.id == null) continue
                await apiDeleteItem(it.id)
            }

            await loadAll()
            showToast("ok", `Merged into 1 item • qty now ${totalQty}`)
        } catch (e) {
            showToast("error", e?.message || "Merge failed")
        } finally {
            setDupeActionBusy(false)
            setDupeBusyKey("")
        }
    }

    // ---------- TAX (ACCOUNTING-STYLE EXPORT) ----------
    const [taxRange, setTaxRange] = useState("year") // month | year | all
    const [taxExportShape, setTaxExportShape] = useState("detail") // detail | summary | combined
    const [taxDateFormat, setTaxDateFormat] = useState("iso") // iso | uk

    const formatDateForExport = (iso) => {
        if (!iso) return ""
        if (taxDateFormat === "iso") return iso
        const [y, m, d] = String(iso).split("-")
        if (!y || !m || !d) return iso
        return `${d}/${m}/${y}`
    }

    const salesForTax = useMemo(() => {
        const all = Array.isArray(sales) ? sales : []
        if (taxRange === "all") return all
        const now = new Date()
        const start =
            taxRange === "month"
                ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
                : new Date(now.getFullYear(), 0, 1).getTime()
        const end = now.getTime()
        return all.filter((s) => {
            const dt = s.soldAt ? new Date(s.soldAt).getTime() : null
            if (dt == null || Number.isNaN(dt)) return false
            return dt >= start && dt <= end
        })
    }, [sales, taxRange])

    const itemMetaById = useMemo(() => {
        const map = new Map()
        for (const it of Array.isArray(items) ? items : []) {
            const id = it?.id
            if (id == null) continue
            const decoded = decodeNotes(it.notes)
            const meta = normaliseMeta(decoded.meta)
            map.set(String(id), { meta, name: safeStr(it.name), sku: safeStr(it.sku) })
        }
        return map
    }, [items])

    const taxSummary = useMemo(() => {
        let rows = 0
        let gross = 0
        let fees = 0
        let net = 0
        let cost = 0
        let profit = 0

        for (const s of salesForTax) {
            const qty = clampInt(s.quantitySold, 0)
            const ppu = Number(s.salePricePerUnitPence || 0) || 0
            const g = qty * ppu
            const f = Number(s.feesPence || 0) || 0
            const n = s.netPence != null ? Number(s.netPence || 0) : Math.max(0, g - f)
            const c =
                s.costTotalPence != null
                    ? Number(s.costTotalPence || 0)
                    : s.costPerUnitPence != null
                        ? Number(s.costPerUnitPence || 0) * qty
                        : 0

            rows += 1
            gross += g
            fees += f
            net += n
            cost += c
            profit += n - c
        }

        const margin = net > 0 ? (profit / net) * 100 : 0
        return {
            period: taxRange,
            rows,
            gross,
            fees,
            net,
            cost,
            profit,
            margin: Number.isFinite(margin) ? Math.round(margin * 10) / 10 : 0,
        }
    }, [salesForTax, taxRange])

    const taxDetailRows = useMemo(() => {
        const arr = []
        for (const s of salesForTax) {
            const soldISO = toISODateOnly(s.soldAt)
            const soldDate = formatDateForExport(soldISO)

            const qty = clampInt(s.quantitySold, 0)
            const ppu = Number(s.salePricePerUnitPence || 0) || 0
            const gross = qty * ppu

            const fees = Number(s.feesPence || 0) || 0
            const net = s.netPence != null ? Number(s.netPence || 0) : Math.max(0, gross - fees)

            const cost =
                s.costTotalPence != null
                    ? Number(s.costTotalPence || 0)
                    : s.costPerUnitPence != null
                        ? Number(s.costPerUnitPence || 0) * qty
                        : 0

            const profit = net - cost

            const itemId = s.itemId != null ? String(s.itemId) : ""
            const lookup = itemId ? itemMetaById.get(itemId) : null
            const category = lookup?.meta?.category || ""
            const condition = lookup?.meta?.condition || ""

            const itemName = safeStr(s.itemName || s.item?.name || lookup?.name || "")
            const sku = safeStr(s.sku || s.itemSku || lookup?.sku || "")
            const platform = safeStr(s.platform || "OTHER").toUpperCase()

            // Accounting-friendly columns (import/mapping-friendly)
            arr.push({
                Date: soldDate || "",
                Description: itemName || "Sale",
                Reference: sku || "",
                Platform: platform,
                Category: category,
                Condition: condition,
                Quantity: qty,
                Gross: penceToMoney(gross),
                Fees: penceToMoney(fees),
                Net: penceToMoney(net),
                CostOfGoods: penceToMoney(cost),
                Profit: penceToMoney(profit),
                Currency: currencyView,
            })
        }
        return arr
    }, [salesForTax, itemMetaById, currencyView, taxDateFormat])

    const buildTaxExportRows = () => {
        const stamp = stampNow()

        if (taxExportShape === "detail") {
            return {
                filename: `tax-export-detail-${taxRange}-${stamp}.csv`,
                rows: taxDetailRows,
            }
        }

        if (taxExportShape === "summary") {
            const rows = [
                {
                    Period: taxSummary.period,
                    SalesRows: taxSummary.rows,
                    GrossRevenue: penceToMoney(taxSummary.gross),
                    FeesPaid: penceToMoney(taxSummary.fees),
                    NetRevenue: penceToMoney(taxSummary.net),
                    CostOfGoodsSold: penceToMoney(taxSummary.cost),
                    Profit: penceToMoney(taxSummary.profit),
                    ProfitMarginPct: taxSummary.margin,
                    Currency: currencyView,
                },
            ]
            return {
                filename: `tax-export-summary-${taxRange}-${stamp}.csv`,
                rows,
            }
        }

        // combined (single CSV): recordType column keeps it spreadsheet-friendly and filterable
        const summaryRow = {
            RecordType: "SUMMARY",
            Period: taxSummary.period,
            SalesRows: taxSummary.rows,
            GrossRevenue: penceToMoney(taxSummary.gross),
            FeesPaid: penceToMoney(taxSummary.fees),
            NetRevenue: penceToMoney(taxSummary.net),
            CostOfGoodsSold: penceToMoney(taxSummary.cost),
            Profit: penceToMoney(taxSummary.profit),
            ProfitMarginPct: taxSummary.margin,
            Currency: currencyView,
        }

        const detail = taxDetailRows.map((r) => ({
            RecordType: "TRANSACTION",
            Date: r.Date,
            Description: r.Description,
            Reference: r.Reference,
            Platform: r.Platform,
            Category: r.Category,
            Condition: r.Condition,
            Quantity: r.Quantity,
            Gross: r.Gross,
            Fees: r.Fees,
            Net: r.Net,
            CostOfGoods: r.CostOfGoods,
            Profit: r.Profit,
            Currency: r.Currency,
        }))

        return {
            filename: `tax-export-combined-${taxRange}-${stamp}.csv`,
            rows: [summaryRow, ...detail],
        }
    }

    // ---------- OPPORTUNITY ----------
    const opportunity = useMemo(() => {
        const map = new Map()
        for (const s of Array.isArray(sales) ? sales : []) {
            const name = String(s.itemName || s.item?.name || "—")
            const qty = clampInt(s.quantitySold, 0)
            const net = Number(s.netPence || 0) || 0
            const cost = Number(s.costTotalPence || 0) || 0
            const profit = net - cost
            if (!map.has(name)) map.set(name, { name, rows: 0, units: 0, profit: 0, revenue: 0 })
            const a = map.get(name)
            a.rows += 1
            a.units += qty
            a.profit += profit
            a.revenue += net
        }
        return Array.from(map.values())
            .filter((x) => x.rows >= 2 && x.units >= 2)
            .map((x) => ({
                ...x,
                profitPerUnit: x.units > 0 ? x.profit / x.units : 0,
                margin: x.revenue > 0 ? (x.profit / x.revenue) * 100 : 0,
            }))
            .sort((a, b) => b.profitPerUnit - a.profitPerUnit)
            .slice(0, 12)
    }, [sales])

    // ---------- DATA HEALTH ----------
    const dataHealth = useMemo(() => {
        const its = Array.isArray(items) ? items : []
        const sals = Array.isArray(sales) ? sales : []
        let missingSku = 0
        let missingNotes = 0
        for (const it of its) {
            if (!safeStr(it.sku)) missingSku += 1
            if (!safeStr(it.notes)) missingNotes += 1
        }
        let salesMissingCost = 0
        let salesMissingNet = 0
        for (const s of sals) {
            if (s.costTotalPence == null && s.costPerUnitPence == null) salesMissingCost += 1
            if (s.netPence == null) salesMissingNet += 1
        }
        return { items: its.length, sales: sals.length, missingSku, missingNotes, salesMissingCost, salesMissingNet }
    }, [items, sales])

    // ---------- PROFIT CALC ----------
    const [pc, setPc] = useState(() => ({
        buyPrice: "0.00",
        sellPrice: "0.00",
        sellerFees: "0.00",
        postageCost: "0.00",
        buyerPaysPostage: false,
        noSellerFees: false,
    }))
    const pcBuy = parseMoneyToPence(pc.buyPrice)
    const pcSell = parseMoneyToPence(pc.sellPrice)
    const pcFees = pc.noSellerFees ? 0 : parseMoneyToPence(pc.sellerFees)
    const pcPostage = pc.buyerPaysPostage ? 0 : parseMoneyToPence(pc.postageCost)
    const pcProfit = pcSell - pcBuy - pcFees - pcPostage
    const pcMargin = pcSell > 0 ? (pcProfit / pcSell) * 100 : 0

    // ---------- layout ----------
    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-50">
            <Toast toast={toast} />

            <div className="mx-auto w-full max-w-[1200px] px-4 py-8">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Tools</h1>
                        <p className="mt-1 text-sm text-zinc-300">Utilities that save time and improve profitability.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-300">Display currency</div>
                            <select
                                value={currencyView}
                                onChange={(e) => setCurrencyView(e.target.value)}
                                className="h-10 w-[160px] rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                            >
                                {Object.keys(CURRENCY_META).map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={loadAll}
                            className="h-11 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="mb-6 grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="text-xs font-semibold text-zinc-300">
                        Live data:{" "}
                        <span className="text-white">
                            {loading ? "Loading…" : `${items.length} item(s) and ${sales.length} sale(s)`}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                        <Link
                            href="/program/inventory"
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
                        >
                            Inventory →
                        </Link>
                        <Link
                            href="/program/sales"
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
                        >
                            Sales →
                        </Link>
                        <Link
                            href="/program/analytics"
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
                        >
                            Analytics →
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <ToolCard
                        title="Bulk import"
                        sub="Upload a CSV and import automatically."
                        icon="⬆️"
                        tone="from-sky-500/30 to-cyan-500/20"
                        onClick={() => setImportOpen(true)}
                    />
                    <ToolCard
                        title="Export"
                        sub="Download clean data files (plain notes, optional dates)."
                        icon="⬇️"
                        tone="from-indigo-500/30 to-purple-500/20"
                        onClick={() => setExportOpen(true)}
                    />
                    <ToolCard
                        title="Profit calculator"
                        sub="Work out profit and margin with fee and postage toggles."
                        icon="🧮"
                        tone="from-emerald-500/30 to-green-500/20"
                        onClick={() => setProfitOpen(true)}
                    />
                    <ToolCard
                        title="Aged stock scanner"
                        sub="Find items that have not been updated for X days."
                        icon="⏳"
                        tone="from-amber-500/30 to-orange-500/20"
                        onClick={() => setAgedOpen(true)}
                    />
                    <ToolCard
                        title="Duplicate finder"
                        sub="Spot duplicates and optionally merge or remove them."
                        icon="🧩"
                        tone="from-pink-500/30 to-rose-500/20"
                        onClick={() => setDupeOpen(true)}
                    />
                    <ToolCard
                        title="Tax and accounting export"
                        sub="Accounting-style export (selected period) with optional summary + detail."
                        icon="🧾"
                        tone="from-teal-500/30 to-emerald-500/20"
                        onClick={() => setTaxOpen(true)}
                    />
                    <ToolCard
                        title="Opportunity finder"
                        sub="Highlights repeat sellers with strong profit per unit."
                        icon="🎯"
                        tone="from-violet-500/30 to-fuchsia-500/20"
                        onClick={() => setOppOpen(true)}
                    />
                    <ToolCard
                        title="Data health"
                        sub="Find missing fields that make analytics inaccurate."
                        icon="🩺"
                        tone="from-red-500/25 to-amber-500/15"
                        onClick={() => setHealthOpen(true)}
                    />
                </div>
            </div>

            {/* IMPORT */}
            {importOpen ? (
                <Modal
                    title="Bulk import"
                    onClose={() => {
                        setImportOpen(false)
                        resetImport()
                    }}
                    footer={
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-zinc-300">Only the title/name is required. Missing columns are ignored.</div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImportDryRun(true)
                                        doImport()
                                    }}
                                    disabled={importBusy || importStats.total === 0}
                                    className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-60"
                                >
                                    {importBusy && importDryRun ? "Checking…" : "Dry run"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImportDryRun(false)
                                        doImport()
                                    }}
                                    disabled={importBusy || importStats.total === 0}
                                    className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                                >
                                    {importBusy && !importDryRun ? "Importing…" : "Import"}
                                </button>
                            </div>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm font-semibold text-white">Upload a CSV</div>
                            <div className="mt-2 text-sm text-zinc-300">The program will detect columns automatically.</div>

                            <div className="mt-4">
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) readFile(f).catch(() => showToast("error", "Could not read file"))
                                    }}
                                    className="w-full rounded-2xl border border-white/10 bg-zinc-950/60 p-3 text-sm text-white file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                <div className="text-xs font-semibold text-zinc-300">Rows detected</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{importStats.total}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                <div className="text-xs font-semibold text-zinc-300">Ready to import</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{importStats.canImport}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                <div className="text-xs font-semibold text-zinc-300">Will skip</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{importStats.willSkip}</div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                                <Select label="Mode" value={importMode} onChange={setImportMode}>
                                    <option value="auto">Auto (recommended)</option>
                                    <option value="strict">Strict</option>
                                </Select>

                                <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                    <div className="text-xs font-semibold text-zinc-300">Detected columns</div>
                                    <div className="mt-2 text-sm text-white/90">
                                        name: <span className="text-white">{mapping.name || "—"}</span>
                                        <br />
                                        qty: <span className="text-white">{mapping.quantity || "—"}</span>
                                        <br />
                                        purchase: <span className="text-white">{mapping.purchaseTotal || "—"}</span>
                                        <br />
                                        price: <span className="text-white">{mapping.listedPrice || "—"}</span>
                                        <br />
                                        sku: <span className="text-white">{mapping.sku || "—"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm font-semibold text-white">Preview (first 8)</div>
                            <div className="mt-3 space-y-2">
                                {previewRows.length === 0 ? (
                                    <div className="text-sm text-zinc-300">Upload a CSV to see preview.</div>
                                ) : (
                                    previewRows.map((r) => (
                                        <div
                                            key={r._k}
                                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/30 px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold text-white">{r.title || "— Missing title —"}</div>
                                                <div className="mt-1 text-xs text-zinc-400">
                                                    SKU: {r.sku || "—"} • Qty {r.quantity} • {r.status}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-sm text-white">{fmt(currencyView, r.purchasePence)}</div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <Divider />

                            <div className="text-xs text-zinc-300">
                                After importing:{" "}
                                <Link href="/program/inventory" className="text-white underline underline-offset-2">
                                    open Inventory
                                </Link>
                            </div>
                        </div>
                    </div>
                </Modal>
            ) : null}

            {/* EXPORT */}
            {exportOpen ? (
                <Modal
                    title="Export"
                    onClose={() => setExportOpen(false)}
                    footer={
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-zinc-300">You can create exports as many times as you want.</div>
                            <button
                                type="button"
                                onClick={doExport}
                                disabled={exportBusy}
                                className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                            >
                                {exportBusy ? "Creating…" : "Create export"}
                            </button>
                        </div>
                    }
                >
                    <div className="grid gap-3 md:grid-cols-2">
                        <Select label="Data" value={exportMode} onChange={setExportMode}>
                            <option value="items">Inventory items</option>
                            <option value="sales">Sales</option>
                            <option value="both">Both (single file)</option>
                        </Select>
                        <Select label="File type" value={exportFormat} onChange={setExportFormat}>
                            <option value="csv">CSV</option>
                            <option value="json">JSON</option>
                        </Select>
                    </div>

                    <Divider />

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
                        <input
                            type="checkbox"
                            checked={!!exportIncludeDates}
                            onChange={(e) => setExportIncludeDates(e.target.checked)}
                            className="mt-1 h-4 w-4 accent-white"
                        />
                        <div>
                            <div className="text-sm font-semibold text-white">Include dates</div>
                            <div className="mt-1 text-xs text-zinc-300">
                                Only exports valid dates as <span className="text-white">YYYY-MM-DD</span>. Invalid values export blank.
                            </div>
                        </div>
                    </label>

                    <Divider />

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                        Notes are exported as plain text only.
                    </div>
                </Modal>
            ) : null}

            {/* PROFIT */}
            {profitOpen ? (
                <Modal title="Profit calculator" onClose={() => setProfitOpen(false)}>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="block">
                            <div className="mb-2 text-xs font-semibold text-zinc-300">{`Buy price (${currencyView})`}</div>
                            <input
                                value={pc.buyPrice}
                                onChange={(e) => setPc((p) => ({ ...p, buyPrice: e.target.value }))}
                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none"
                            />
                        </label>
                        <label className="block">
                            <div className="mb-2 text-xs font-semibold text-zinc-300">{`Sell price (${currencyView})`}</div>
                            <input
                                value={pc.sellPrice}
                                onChange={(e) => setPc((p) => ({ ...p, sellPrice: e.target.value }))}
                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none"
                            />
                        </label>

                        {!pc.noSellerFees ? (
                            <label className="block">
                                <div className="mb-2 text-xs font-semibold text-zinc-300">{`Seller fees (${currencyView})`}</div>
                                <input
                                    value={pc.sellerFees}
                                    onChange={(e) => setPc((p) => ({ ...p, sellerFees: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none"
                                />
                            </label>
                        ) : (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                                Seller fees disabled
                            </div>
                        )}

                        {!pc.buyerPaysPostage ? (
                            <label className="block">
                                <div className="mb-2 text-xs font-semibold text-zinc-300">{`Postage cost (${currencyView})`}</div>
                                <input
                                    value={pc.postageCost}
                                    onChange={(e) => setPc((p) => ({ ...p, postageCost: e.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none"
                                />
                            </label>
                        ) : (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                                Postage disabled
                            </div>
                        )}
                    </div>

                    <Divider />

                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
                            <input
                                type="checkbox"
                                checked={!!pc.noSellerFees}
                                onChange={(e) => setPc((p) => ({ ...p, noSellerFees: e.target.checked }))}
                                className="mt-1 h-4 w-4 accent-white"
                            />
                            <div>
                                <div className="text-sm font-semibold text-white">No seller fees</div>
                                <div className="mt-1 text-xs text-zinc-300">Treat fees as 0.</div>
                            </div>
                        </label>

                        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
                            <input
                                type="checkbox"
                                checked={!!pc.buyerPaysPostage}
                                onChange={(e) => setPc((p) => ({ ...p, buyerPaysPostage: e.target.checked }))}
                                className="mt-1 h-4 w-4 accent-white"
                            />
                            <div>
                                <div className="text-sm font-semibold text-white">Buyer pays postage</div>
                                <div className="mt-1 text-xs text-zinc-300">Treat postage as 0.</div>
                            </div>
                        </label>
                    </div>

                    <Divider />

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Profit</div>
                            <div
                                className={[
                                    "mt-2 text-2xl font-semibold",
                                    pcProfit >= 0 ? "text-emerald-200" : "text-red-200",
                                ].join(" ")}
                            >
                                {fmt(currencyView, pcProfit)}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Margin</div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                                {Number.isFinite(pcMargin) ? `${Math.round(pcMargin * 10) / 10}%` : "0%"}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Net after costs</div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                                {fmt(currencyView, pcSell - pcFees - pcPostage)}
                            </div>
                        </div>
                    </div>
                </Modal>
            ) : null}

            {/* AGED */}
            {agedOpen ? (
                <Modal title="Aged stock scanner" onClose={() => setAgedOpen(false)}>
                    <div className="grid gap-3 md:grid-cols-3">
                        <label className="block">
                            <div className="mb-2 text-xs font-semibold text-zinc-300">Days (&gt;=)</div>
                            <input
                                type="number"
                                value={agedDays}
                                onChange={(e) => setAgedDays(e.target.value)}
                                className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none"
                            />
                        </label>
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4 md:col-span-2">
                            <div className="text-xs font-semibold text-zinc-300">Matches</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{agedResults.length}</div>
                        </div>
                    </div>

                    <Divider />

                    {agedResults.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                            No items older than {agedCutoffDays} day(s).
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {agedResults.map(({ it, ageDays }) => (
                                <div key={String(it.id || it.name)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-white">{it.name || "—"}</div>
                                            <div className="mt-1 text-xs text-zinc-400">
                                                SKU: {it.sku || "—"} • Qty: {clampInt(it.quantity, 0)}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right text-sm text-white">{ageDays} day(s)</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Modal>
            ) : null}

            {/* DUPES */}
            {dupeOpen ? (
                <Modal
                    title="Duplicate finder"
                    onClose={() => setDupeOpen(false)}
                    footer={
                        <div className="text-xs text-zinc-300">
                            {canMutateItems
                                ? "Merge increases quantity on the kept item. Remove deletes the extra rows."
                                : "Merge/remove needs item IDs from the API response."}
                        </div>
                    }
                >
                    <InfoBox title="What does merge and remove do?" tone="bg-white/5">
                        <div>
                            • <span className="text-white">Merge</span>: keeps one item, adds all duplicate quantities into it, then
                            deletes the extra duplicate rows.
                        </div>
                        <div>
                            • <span className="text-white">Remove</span>: keeps one item and deletes the extra duplicate rows
                            (quantity does not increase).
                        </div>
                        <div className="text-amber-200">Warning: merge will increase the kept item’s quantity.</div>
                    </InfoBox>

                    <Divider />

                    {duplicates.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                            No duplicates found.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {duplicates.map((d) => {
                                const groupKey = `${d.type}:${d.k}`
                                const busyMerge = dupeBusyKey === `${groupKey}:merge`
                                const busyRemove = dupeBusyKey === `${groupKey}:remove`
                                const keep = d.arr[0]
                                const totalQty = d.arr.reduce((sum, it) => sum + clampInt(it.quantity, 0), 0)

                                return (
                                    <div key={groupKey} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-white">
                                                    {d.type}: <span className="text-white/80">{d.k}</span>
                                                </div>
                                                <div className="mt-1 text-xs text-zinc-400">
                                                    {d.arr.length} item(s) • combined qty {totalQty} • keep:{" "}
                                                    <span className="text-zinc-200">{safeStr(keep?.name) || "—"}</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={!canMutateItems || dupeActionBusy}
                                                    onClick={() => mergeDuplicates(d)}
                                                    className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                                                    title="Merge: keep one item, add quantities together, remove the rest"
                                                >
                                                    {busyMerge ? "Merging…" : "Merge"}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!canMutateItems || dupeActionBusy}
                                                    onClick={() => removeDuplicates(d)}
                                                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-60"
                                                    title="Remove: delete extra duplicates, keep quantity as-is"
                                                >
                                                    {busyRemove ? "Removing…" : "Remove"}
                                                </button>
                                            </div>
                                        </div>

                                        <Divider />

                                        <div className="space-y-2">
                                            {d.arr.slice(0, 8).map((it) => (
                                                <div
                                                    key={String(it.id || it.name)}
                                                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/30 px-3 py-2"
                                                >
                                                    <div className="min-w-0 truncate text-sm text-white">{it.name || "—"}</div>
                                                    <div className="shrink-0 text-xs text-zinc-300">
                                                        Qty {clampInt(it.quantity, 0)}
                                                        {it.id != null ? ` • id ${it.id}` : ""}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Modal>
            ) : null}

            {/* TAX */}
            {taxOpen ? (
                <Modal
                    title="Tax and accounting export"
                    onClose={() => setTaxOpen(false)}
                    footer={
                        <button
                            type="button"
                            onClick={() => {
                                const out = buildTaxExportRows()
                                downloadText(out.filename, toCSV(out.rows))
                                showToast("ok", "Tax export created")
                            }}
                            className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15"
                        >
                            Create export
                        </button>
                    }
                >
                    <InfoBox title="Accounting export format" tone="bg-white/5">
                        <div>Best practice is a selected reporting period and consistent columns for import/mapping.</div>
                        <div className="text-zinc-200">
                            Use <span className="text-white">Detail</span> when importing into accounting software; use{" "}
                            <span className="text-white">Summary</span> for accountant review; use{" "}
                            <span className="text-white">Combined</span> if you want everything in one CSV.
                        </div>
                    </InfoBox>

                    <Divider />

                    <div className="grid gap-3 md:grid-cols-3">
                        <Select label="Period" value={taxRange} onChange={setTaxRange}>
                            <option value="month">This month</option>
                            <option value="year">This year</option>
                            <option value="all">All time</option>
                        </Select>

                        <Select label="Export" value={taxExportShape} onChange={setTaxExportShape}>
                            <option value="detail">Detail (transactions)</option>
                            <option value="summary">Summary (totals)</option>
                            <option value="combined">Combined (1 CSV)</option>
                        </Select>

                        <Select label="Date format" value={taxDateFormat} onChange={setTaxDateFormat}>
                            <option value="iso">YYYY-MM-DD</option>
                            <option value="uk">DD/MM/YYYY</option>
                        </Select>
                    </div>

                    <Divider />

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Sales rows in period</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{taxSummary.rows}</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Profit margin</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{taxSummary.margin}%</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Net revenue</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{fmt(currencyView, taxSummary.net)}</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Profit</div>
                            <div
                                className={[
                                    "mt-2 text-2xl font-semibold",
                                    taxSummary.profit >= 0 ? "text-emerald-200" : "text-red-200",
                                ].join(" ")}
                            >
                                {fmt(currencyView, taxSummary.profit)}
                            </div>
                        </div>
                    </div>

                    <Divider />

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                        Export currency is <span className="text-white">{currencyView}</span> and amounts are exported as money
                        values (not pence).
                    </div>
                </Modal>
            ) : null}

            {/* OPPORTUNITY */}
            {oppOpen ? (
                <Modal title="Opportunity finder" onClose={() => setOppOpen(false)}>
                    <InfoBox title="What is Opportunity finder?" tone="bg-white/5">
                        <div>
                            Looks for items that have sold multiple times and ranks them by{" "}
                            <span className="text-white">profit per unit</span>.
                        </div>
                        <div>This helps spot what to source more of (repeat demand + strong margins).</div>
                        <div className="text-zinc-200">Tip: if costs are missing on sales rows, profit can be inaccurate.</div>
                    </InfoBox>

                    <Divider />

                    {opportunity.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                            Not enough repeat sales data yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {opportunity.map((x) => (
                                <div key={x.name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-white">{x.name}</div>
                                            <div className="mt-1 text-xs text-zinc-400">
                                                {x.rows} sale(s) • {x.units} unit(s) • margin {Math.round(x.margin * 10) / 10}%
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="text-xs font-semibold text-zinc-300">Profit / unit</div>
                                            <div className="mt-1 text-sm font-semibold text-emerald-200">
                                                {fmt(currencyView, Math.round(x.profitPerUnit))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Modal>
            ) : null}

            {/* DATA HEALTH */}
            {healthOpen ? (
                <Modal title="Data health" onClose={() => setHealthOpen(false)}>
                    <InfoBox title="What is Data health?" tone="bg-white/5">
                        <div>Checks for missing fields that make your dashboard and analytics wrong or incomplete.</div>
                        <div className="text-zinc-200">
                            Example: missing cost on sales rows → profit looks higher/lower than reality.
                        </div>
                    </InfoBox>

                    <Divider />

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Inventory items</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{dataHealth.items}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="text-xs font-semibold text-zinc-300">Sales</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{dataHealth.sales}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm font-semibold text-white">Inventory issues</div>
                            <div className="mt-2 text-sm text-zinc-300">
                                Missing SKU: <span className="text-white">{dataHealth.missingSku}</span>
                                <br />
                                Missing notes/meta: <span className="text-white">{dataHealth.missingNotes}</span>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm font-semibold text-white">Sales issues</div>
                            <div className="mt-2 text-sm text-zinc-300">
                                Missing cost fields: <span className="text-white">{dataHealth.salesMissingCost}</span>
                                <br />
                                Missing net fields: <span className="text-white">{dataHealth.salesMissingNet}</span>
                            </div>
                        </div>
                    </div>
                </Modal>
            ) : null}
        </div>
    )
}
