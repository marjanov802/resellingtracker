// app/program/inventory/page.js
"use client"

import { useEffect, useMemo, useState } from "react"

// ===================== Image Upload Helpers =====================
const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
        if (!file) return resolve("");
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

const isImageFile = (file) => {
    if (!file) return false;
    return typeof file.type === "string" && file.type.startsWith("image/");
};

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB limit
// ================================================================

const MAX_VISIBLE_COLUMNS = 6

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

const CATEGORIES = ["Clothes", "Shoes", "Tech", "Collectables", "Cards", "Watches", "Bags", "Jewellery", "Home", "Other"]

const CONDITIONS = ["New", "New (with tags)", "Like new", "Good", "Fair", "Poor"]
const CLOTHING_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]
const SHOE_SIZES = ["3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "14", "15"]
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
 * Notes payload (v4)
 * - purchaseTotalPence: total all-in purchase cost PER UNIT
 * - estimatedSalePence: estimated sale PER UNIT (used for UNLISTED)
 * - listings: array of { platform, url, pricePence } (price is per unit)
 */
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

// Sale notes encoding (stores imageUrl so it persists with the sale record)
const encodeSaleNotes = (plainNotes, meta) => {
    const payload = {
        _saleV: 1,
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
    const imageUrl = m.imageUrl || null
    const size = m.size || null

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
        imageUrl,
        size,
        purchaseTotalPence,
        estimatedSalePence: estimatedFromLegacy,
        listings,
    }
}

/**
 * ADDITION:
 * When status is LISTED/SOLD, use the first listing that actually has a price (if any),
 * instead of always using meta.listings[0] which might be a URL-only extra link.
 */
function pickListingForPrice(listings) {
    const arr = Array.isArray(listings) ? listings : []
    const firstWithPrice =
        arr.find((l) => l?.pricePence != null && Number.isFinite(Number(l.pricePence)) && Number(l.pricePence) > 0) || null
    return firstWithPrice || arr[0] || null
}

function compute(it) {
    const decoded = decodeNotes(it.notes)
    const meta = normaliseMeta(decoded.meta)

    const itemCur = meta.currency
    const q = Number(it.quantity) || 0
    const status = meta.status

    const purchaseTotalPerUnit = meta.purchaseTotalPence > 0 ? meta.purchaseTotalPence : Number(it.costPence) || 0
    const purchaseTotal = purchaseTotalPerUnit * q

    const chosen = pickListingForPrice(meta.listings)
    const listingPricePerUnit = chosen?.pricePence ?? null

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

function Pill({ text }) {
    const t = String(text || "").toUpperCase()
    const cls =
        t === "LISTED"
            ? "border-blue-400/20 bg-blue-500/10 text-blue-100"
            : "border-white/10 bg-white/5 text-zinc-200"

    return <span className={["inline-flex items-center rounded-2xl border px-2.5 py-1 text-[11px] font-semibold", cls].join(" ")}>{t}</span>
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

function Snapshot({ label, value, good = false }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] font-semibold text-zinc-300">{label}</div>
            <div className={["mt-1 text-sm font-semibold", good ? "text-emerald-200" : "text-white"].join(" ")}>{value}</div>
        </div>
    )
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

function PencilIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
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

function DollarIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    )
}

function UploadIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    )
}

function DownloadIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    )
}

function FileIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    )
}

function ClipboardIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={["h-4 w-4", className].join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
    )
}

function TickButton({ checked, onToggle, title, disabled = false, className = "" }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            disabled={disabled}
            onClick={(e) => {
                e?.preventDefault?.()
                e?.stopPropagation?.()
                if (disabled) return
                onToggle?.()
            }}
            className={[
                "inline-flex h-7 w-7 items-center justify-center rounded-xl border transition",
                checked ? "border-white/10 bg-white text-zinc-950" : "border-white/10 bg-white/10 text-white/90 hover:bg-white/15",
                disabled ? "opacity-50 cursor-not-allowed hover:bg-white/10" : "",
                className,
            ].join(" ")}
        >
            {checked ? <CheckIcon /> : null}
        </button>
    )
}

// Max 6 visible columns by default (no horizontal scroll)
const DEFAULT_COLUMNS = {
    status: true,

    sku: true,
    quantity: true,
    purchase: true,
    salePrice: true,
    profit: true,

    category: false,
    condition: false,
    listings: false,
    purchasePerUnit: false,
    salePricePerUnit: false,
    profitPerUnit: false,
    roi: false,
    ageDays: false,
    updated: false,
}

const COLUMN_DEFS = [
    { key: "status", label: "Status", width: "120px" },

    { key: "sku", label: "SKU", width: "130px" },
    { key: "category", label: "Category", width: "150px" },
    { key: "condition", label: "Condition", width: "150px" },
    { key: "quantity", label: "Qty", width: "70px" },
    { key: "purchase", label: "Purchase total", width: "170px" },
    { key: "salePrice", label: "Sale price", width: "170px" },
    { key: "profit", label: "Profit", width: "170px" },
    { key: "purchasePerUnit", label: "Purchase / unit", width: "150px" },
    { key: "salePricePerUnit", label: "Sale / unit", width: "140px" },
    { key: "profitPerUnit", label: "Profit / unit", width: "150px" },
    { key: "roi", label: "ROI", width: "110px" },
    { key: "listings", label: "Listings", width: "420px" },
    { key: "ageDays", label: "Age (days)", width: "110px" },
    { key: "updated", label: "Updated", width: "180px" },
]

const clampColumnsToMax = (cols, max = MAX_VISIBLE_COLUMNS) => {
    const next = { ...cols }
    let n = 0
    for (const def of COLUMN_DEFS) {
        if (next[def.key]) {
            n += 1
            if (n > max) next[def.key] = false
        }
    }
    return next
}

function buildListingsFromForm({ status, listingPlatform, listingUrl, listingPrice, listings }) {
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

/**
 * ADDITION:
 * Lightweight platform guesser (used by URL import UI).
 */
function guessPlatformFromUrl(url) {
    const u = String(url || "").toLowerCase()
    if (!u) return "OTHER"
    if (u.includes("ebay.")) return "EBAY"
    if (u.includes("vinted.")) return "VINTED"
    if (u.includes("depop.")) return "DEPOP"
    if (u.includes("stockx.")) return "STOCKX"
    if (u.includes("goat.")) return "GOAT"
    if (u.includes("grailed.")) return "GRAILED"
    if (u.includes("facebook.com/marketplace") || u.includes("fb.com/marketplace")) return "FACEBOOK"
    if (u.includes("etsy.")) return "ETSY"
    return "OTHER"
}

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
            const raw = localStorage.getItem("rt_inventory_columns_v2")
            if (!raw) return DEFAULT_COLUMNS
            const parsed = JSON.parse(raw)
            const merged = { ...DEFAULT_COLUMNS, ...(parsed && typeof parsed === "object" ? parsed : {}) }
            return clampColumnsToMax(merged, MAX_VISIBLE_COLUMNS)
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

    const [search, setSearch] = useState("")

    const [filtersOpen, setFiltersOpen] = useState(false)
    const [filters, setFilters] = useState(() => ({
        status: "ALL",
        category: "ALL",
        condition: "ALL",
        platform: "ALL",
        onlyWithLinks: false,
    }))

    const [addOpen, setAddOpen] = useState(false)
    const [addSaving, setAddSaving] = useState(false)
    const [addForm, setAddForm] = useState(() => ({
        title: "",
        sku: "",
        quantity: 1,

        category: "Clothes",
        condition: "Good",
        status: "UNLISTED",
        size: "",

        purchaseTotal: "0.00",
        estimatedSale: "0.00",

        listingPlatform: "EBAY",
        listingUrl: "",
        listingPrice: "0.00",
        listings: [],

        notes: "",
        imageUrl: "",
    }))

    // ===================== Add Form Image State =====================
    const [addImageFile, setAddImageFile] = useState(null);
    const [addImageError, setAddImageError] = useState("");

    const handleAddImageChange = async (e) => {
        const file = e?.target?.files?.[0] || null;
        setAddImageError("");
        setAddImageFile(null);

        if (!file) {
            setAddForm((prev) => ({ ...prev, imageUrl: "" }));
            return;
        }
        if (!isImageFile(file)) {
            setAddImageError("Please select an image file.");
            e.target.value = "";
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setAddImageError("Image is too large (max 3MB).");
            e.target.value = "";
            return;
        }
        const dataUrl = await fileToDataUrl(file);
        setAddImageFile(file);
        setAddForm((prev) => ({ ...prev, imageUrl: dataUrl }));
    };
    // ================================================================

    /**
     * ADDITION: URL import state (Add modal only)
     */
    const [importUrl, setImportUrl] = useState("")
    const [importing, setImporting] = useState(false)

    const [editOpen, setEditOpen] = useState(false)
    const [editSaving, setEditSaving] = useState(false)
    const [editItem, setEditItem] = useState(null)
    const [editForm, setEditForm] = useState(() => ({
        title: "",
        sku: "",
        quantity: 1,

        category: "Clothes",
        condition: "Good",
        status: "UNLISTED",
        category: "Clothes",
        condition: "Good",
        status: "UNLISTED",
        size: "",

        purchaseTotal: "0.00",
        estimatedSale: "0.00",

        listingPlatform: "EBAY",
        listingUrl: "",
        listingPrice: "0.00",
        listings: [],

        notes: "",
        imageUrl: "",
    }))

    // ===================== Edit Form Image State =====================
    const [editImageFile, setEditImageFile] = useState(null);
    const [editImageError, setEditImageError] = useState("");

    const handleEditImageChange = async (e) => {
        const file = e?.target?.files?.[0] || null;
        setEditImageError("");
        setEditImageFile(null);

        if (!file) {
            setEditForm((prev) => ({ ...prev, imageUrl: "" }));
            return;
        }
        if (!isImageFile(file)) {
            setEditImageError("Please select an image file.");
            e.target.value = "";
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setEditImageError("Image is too large (max 3MB).");
            e.target.value = "";
            return;
        }
        const dataUrl = await fileToDataUrl(file);
        setEditImageFile(file);
        setEditForm((prev) => ({ ...prev, imageUrl: dataUrl }));
    };
    // =================================================================

    // ============================================
    // BULK MARK AS SOLD STATE
    // ============================================
    const [bulkSellOpen, setBulkSellOpen] = useState(false)
    const [bulkSellSaving, setBulkSellSaving] = useState(false)
    const [bulkSellItems, setBulkSellItems] = useState([])
    // Each item in bulkSellItems: { item, quantitySold, salePricePerUnit, platform, notes }

    // ============================================
    // BULK IMPORT STATE
    // ============================================
    const [bulkImportOpen, setBulkImportOpen] = useState(false)
    const [bulkImportSaving, setBulkImportSaving] = useState(false)
    const [bulkImportTab, setBulkImportTab] = useState("file") // "file" | "paste"
    const [bulkImportItems, setBulkImportItems] = useState([])
    const [bulkImportPasteText, setBulkImportPasteText] = useState("")
    // Each item: { id (temp), title, sku, quantity, category, condition, status, purchaseTotal, estimatedSale, notes, valid }

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
            const arr = Array.isArray(data) ? data : []
            setItems(arr)
            setSelected((prev) => {
                const allowed = new Set(arr.map((x) => x.id))
                const next = new Set()
                for (const id of prev) if (allowed.has(id)) next.add(id)
                return next
            })
        } catch (e) {
            showToast("error", e?.message || "Failed to load items")
            setItems([])
            setSelected(new Set())
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
        if (typeof window !== "undefined") localStorage.setItem("rt_inventory_columns_v2", JSON.stringify(columns))
    }, [columns])

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

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

    // ============================================
    // BULK MARK AS SOLD FUNCTIONS
    // ============================================
    const openBulkSell = () => {
        const ids = Array.from(selected)
        if (ids.length === 0) return showToast("error", "No items selected")

        // Filter to only items with quantity > 0
        const sellableItems = items.filter((it) => {
            if (!ids.includes(it.id)) return false
            const qty = Number(it.quantity) || 0
            return qty > 0
        })

        if (sellableItems.length === 0) {
            return showToast("error", "No sellable items selected (all have 0 quantity)")
        }

        // Initialize bulk sell items with defaults
        const initialItems = sellableItems.map((it) => {
            const c = compute(it)
            const availableQty = Number(it.quantity) || 0
            // Default sale price to listing price if available, otherwise estimated sale
            const defaultPrice = c.listingPricePerUnit ?? c.meta.estimatedSalePence ?? 0
            // Get platform from first listing if available
            const firstListing = c.meta.listings?.[0]
            const defaultPlatform = firstListing?.platform || "EBAY"

            return {
                item: it,
                computed: c,
                availableQty,
                quantitySold: availableQty, // Default to selling all
                salePricePerUnit: (defaultPrice / 100).toFixed(2),
                platform: defaultPlatform,
                notes: "",
            }
        })

        setBulkSellItems(initialItems)
        setBulkSellOpen(true)
    }

    const updateBulkSellItem = (index, patch) => {
        setBulkSellItems((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], ...patch }
            return next
        })
    }

    const removeBulkSellItem = (index) => {
        setBulkSellItems((prev) => prev.filter((_, i) => i !== index))
    }

    const submitBulkSell = async () => {
        // Validate all items
        for (let i = 0; i < bulkSellItems.length; i++) {
            const entry = bulkSellItems[i]
            const qty = safeInt(entry.quantitySold, 0)
            const price = parseMoneyToPence(entry.salePricePerUnit)

            if (qty <= 0) {
                return showToast("error", `${entry.item.name}: Quantity must be at least 1`)
            }
            if (qty > entry.availableQty) {
                return showToast("error", `${entry.item.name}: Quantity exceeds available (${entry.availableQty})`)
            }
            if (price <= 0) {
                return showToast("error", `${entry.item.name}: Sale price is required`)
            }
        }

        setBulkSellSaving(true)
        let successCount = 0
        let failCount = 0

        try {
            for (const entry of bulkSellItems) {
                const it = entry.item
                const c = entry.computed
                const sellQty = safeInt(entry.quantitySold, 0)
                const sellPricePerUnitPence = parseMoneyToPence(entry.salePricePerUnit)
                const platform = (entry.platform || "OTHER").toUpperCase()
                const saleCur = (c.itemCur || "GBP").toUpperCase()

                const purchasePerUnitPence = c.purchaseTotalPerUnit || 0
                const purchaseTotalForSoldUnitsPence = sellQty * purchasePerUnitPence
                const sellGrossPence = sellQty * sellPricePerUnitPence

                // 1. Create sale record
                // Encode imageUrl and status into the notes field so it persists with the sale
                const saleNotesEncoded = encodeSaleNotes(entry.notes, {
                    imageUrl: c?.meta?.imageUrl || null,
                    saleStatus: "PENDING", // New sales start as pending
                })

                const salePayload = {
                    itemId: String(it.id),
                    itemName: it.name || null,
                    sku: it.sku || null,
                    platform,
                    soldAt: new Date().toISOString(),
                    quantitySold: sellQty,
                    salePricePerUnitPence: sellPricePerUnitPence,
                    feesPence: 0,
                    netPence: sellGrossPence,
                    costTotalPence: purchaseTotalForSoldUnitsPence,
                    currency: saleCur,
                    notes: saleNotesEncoded,
                    // Also send as top-level field in case API supports it
                    imageUrl: c?.meta?.imageUrl || null,
                }

                try {
                    const resSale = await fetch("/api/sales", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(salePayload),
                    })
                    const saleData = await resSale.json().catch(() => null)
                    if (!resSale.ok) throw new Error(saleData?.error || `Create sale failed`)

                    // 2. Update inventory - delete if 0, otherwise decrement
                    const available = Number(it.quantity) || 0
                    const remaining = Math.max(0, available - sellQty)

                    if (remaining === 0) {
                        // Delete the item entirely from inventory
                        const resDel = await fetch(`/api/items/${it.id}`, { method: "DELETE" })
                        const delData = await resDel.json().catch(() => null)
                        if (!resDel.ok) throw new Error(delData?.error || `Inventory delete failed`)
                    } else {
                        // Decrement quantity, keep status as is
                        const decoded = decodeNotes(it.notes)
                        const meta = normaliseMeta(decoded.meta)

                        const patched = {
                            quantity: remaining,
                            notes: encodeNotes(decoded.notes, meta),
                        }

                        const resPatch = await fetch(`/api/items/${it.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(patched),
                        })
                        const patchData = await resPatch.json().catch(() => null)
                        if (!resPatch.ok) throw new Error(patchData?.error || `Inventory update failed`)
                    }

                    successCount++
                } catch (err) {
                    console.error(`Failed to process sale for ${it.name}:`, err)
                    failCount++
                }
            }

            if (failCount === 0) {
                showToast("ok", `${successCount} sale(s) recorded successfully`)
            } else {
                showToast("error", `${successCount} succeeded, ${failCount} failed`)
            }

            setBulkSellOpen(false)
            setBulkSellItems([])
            clearSelection()
            await loadItems()
        } catch (e) {
            showToast("error", e?.message || "Bulk sell failed")
        } finally {
            setBulkSellSaving(false)
        }
    }

    // Calculate totals for bulk sell modal
    const bulkSellTotals = useMemo(() => {
        let totalRevenue = 0
        let totalCost = 0
        let totalUnits = 0

        for (const entry of bulkSellItems) {
            const qty = safeInt(entry.quantitySold, 0)
            const price = parseMoneyToPence(entry.salePricePerUnit)
            const cost = (entry.computed?.purchaseTotalPerUnit || 0) * qty

            totalRevenue += qty * price
            totalCost += cost
            totalUnits += qty
        }

        return {
            revenue: totalRevenue,
            cost: totalCost,
            profit: totalRevenue - totalCost,
            units: totalUnits,
        }
    }, [bulkSellItems])

    // ============================================
    // BULK IMPORT FUNCTIONS
    // ============================================
    const openBulkImport = () => {
        setBulkImportItems([])
        setBulkImportPasteText("")
        setBulkImportTab("file")
        setBulkImportOpen(true)
    }

    const generateBulkImportTemplate = () => {
        const headers = ["Title*", "SKU", "Quantity", "Category", "Condition", "Status", "Purchase Price", "Estimated Sale", "Notes"]
        const exampleRow = ["Example Item", "SKU-001", "1", "Clothes", "Good", "UNLISTED", "10.00", "20.00", "Optional notes"]

        const csvContent = [
            headers.join(","),
            exampleRow.join(","),
        ].join("\n")

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = "inventory_import_template.csv"
        link.click()
        URL.revokeObjectURL(url)
        showToast("ok", "Template downloaded")
    }

    const parseCSVLine = (line) => {
        const result = []
        let current = ""
        let inQuotes = false

        for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"'
                    i++
                } else {
                    inQuotes = !inQuotes
                }
            } else if (char === "," && !inQuotes) {
                result.push(current.trim())
                current = ""
            } else {
                current += char
            }
        }
        result.push(current.trim())
        return result
    }

    const parseImportData = (text) => {
        const lines = text.split(/\r?\n/).filter((line) => line.trim())
        if (lines.length < 2) return []

        // Detect delimiter (comma or tab)
        const firstLine = lines[0]
        const delimiter = firstLine.includes("\t") ? "\t" : ","

        const parseLine = delimiter === "\t"
            ? (line) => line.split("\t").map((s) => s.trim())
            : parseCSVLine

        const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[*\s]/g, ""))

        // Map headers to our fields
        const headerMap = {
            title: ["title", "name", "itemname", "item"],
            sku: ["sku", "itemsku", "productsku", "code"],
            quantity: ["quantity", "qty", "amount", "count"],
            category: ["category", "cat", "type"],
            condition: ["condition", "cond", "state"],
            status: ["status", "liststatus"],
            purchaseTotal: ["purchaseprice", "purchase", "cost", "buyprice", "purchasetotal", "costprice"],
            estimatedSale: ["estimatedsale", "saleprice", "sellprice", "price", "expectedprice", "estimatedprice"],
            notes: ["notes", "note", "description", "desc", "comments"],
        }

        const colIndex = {}
        for (const [field, aliases] of Object.entries(headerMap)) {
            for (let i = 0; i < headers.length; i++) {
                if (aliases.includes(headers[i])) {
                    colIndex[field] = i
                    break
                }
            }
        }

        const items = []
        for (let i = 1; i < lines.length; i++) {
            const cols = parseLine(lines[i])
            if (cols.every((c) => !c)) continue

            const title = safeStr(cols[colIndex.title] || "")
            const sku = safeStr(cols[colIndex.sku] || "")
            const quantity = safeInt(cols[colIndex.quantity], 1)
            const category = safeStr(cols[colIndex.category] || "") || "Clothes"
            const condition = safeStr(cols[colIndex.condition] || "") || "Good"
            const status = (safeStr(cols[colIndex.status] || "") || "UNLISTED").toUpperCase()
            const purchaseTotal = safeStr(cols[colIndex.purchaseTotal] || "0")
            const estimatedSale = safeStr(cols[colIndex.estimatedSale] || "0")
            const notes = safeStr(cols[colIndex.notes] || "")

            // Validate category
            const validCategory = CATEGORIES.includes(category) ? category : "Other"
            // Validate condition
            const validCondition = CONDITIONS.includes(condition) ? condition : "Good"
            // Validate status
            const validStatus = ["UNLISTED", "LISTED"].includes(status) ? status : "UNLISTED"

            items.push({
                id: `import-${Date.now()}-${i}`,
                title,
                sku,
                quantity: Math.max(1, quantity),
                category: validCategory,
                condition: validCondition,
                status: validStatus,
                purchaseTotal: purchaseTotal.replace(/[^\d.]/g, "") || "0",
                estimatedSale: estimatedSale.replace(/[^\d.]/g, "") || "0",
                notes,
                valid: !!title,
            })
        }

        return items
    }

    const handleBulkImportFile = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        const ext = file.name.split(".").pop()?.toLowerCase()

        if (ext === "csv" || ext === "txt") {
            const text = await file.text()
            const items = parseImportData(text)
            if (items.length === 0) {
                showToast("error", "No valid rows found. Check your file format.")
            } else {
                setBulkImportItems(items)
                showToast("ok", `Parsed ${items.length} item(s)`)
            }
        } else if (ext === "xlsx" || ext === "xls") {
            showToast("error", "Excel files (.xlsx) are not directly supported. Please export as CSV first, or copy-paste from Excel.")
        } else {
            showToast("error", "Unsupported file type. Use CSV or TXT.")
        }

        e.target.value = ""
    }

    const handleBulkImportPaste = () => {
        const text = bulkImportPasteText.trim()
        if (!text) {
            showToast("error", "Paste your data first")
            return
        }

        const items = parseImportData(text)
        if (items.length === 0) {
            showToast("error", "No valid rows found. Make sure you include a header row.")
        } else {
            setBulkImportItems(items)
            showToast("ok", `Parsed ${items.length} item(s)`)
        }
    }

    const updateBulkImportItem = (id, patch) => {
        setBulkImportItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item
                const updated = { ...item, ...patch }
                updated.valid = !!safeStr(updated.title)
                return updated
            })
        )
    }

    const removeBulkImportItem = (id) => {
        setBulkImportItems((prev) => prev.filter((item) => item.id !== id))
    }

    const submitBulkImport = async () => {
        const validItems = bulkImportItems.filter((item) => item.valid)
        if (validItems.length === 0) {
            showToast("error", "No valid items to import. Each item needs a title.")
            return
        }

        setBulkImportSaving(true)
        let successCount = 0
        let failCount = 0

        try {
            for (const item of validItems) {
                const purchaseTotalPence = parseMoneyToPence(item.purchaseTotal)
                const estimatedSalePence = parseMoneyToPence(item.estimatedSale)

                const meta = {
                    currency: currencyView,
                    status: item.status,
                    category: item.category || null,
                    condition: item.condition || null,
                    purchaseTotalPence,
                    estimatedSalePence,
                    listings: [],
                }

                const payload = {
                    name: safeStr(item.title),
                    sku: safeStr(item.sku) || null,
                    quantity: safeInt(item.quantity, 1),
                    costPence: purchaseTotalPence,
                    notes: encodeNotes(item.notes, meta),
                }

                try {
                    const res = await fetch("/api/items", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    })
                    const data = await res.json().catch(() => null)
                    if (!res.ok) throw new Error(data?.error || "Create failed")
                    successCount++
                } catch (err) {
                    console.error(`Failed to create item "${item.title}":`, err)
                    failCount++
                }
            }

            if (failCount === 0) {
                showToast("ok", `${successCount} item(s) imported successfully`)
            } else {
                showToast("error", `${successCount} succeeded, ${failCount} failed`)
            }

            setBulkImportOpen(false)
            setBulkImportItems([])
            await loadItems()
        } catch (e) {
            showToast("error", e?.message || "Bulk import failed")
        } finally {
            setBulkImportSaving(false)
        }
    }

    const bulkImportValidCount = useMemo(() => {
        return bulkImportItems.filter((item) => item.valid).length
    }, [bulkImportItems])

    const openAdd = () => {
        setAddForm({
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
            imageUrl: "",
        })
        setAddImageFile(null)
        setAddImageError("")
        setImportUrl("")
        setImporting(false)
        setAddOpen(true)
    }

    const onAddChange = (patch) => setAddForm((p) => ({ ...p, ...patch }))

    const addStatus = String(addForm.status || "UNLISTED").toUpperCase()
    const addIsListed = addStatus === "LISTED" || addStatus === "SOLD"

    const addListingToForm = () => {
        const url = safeStr(addForm.listingUrl)
        const pricePence = parseMoneyToPence(addForm.listingPrice)
        if (!url && pricePence <= 0) return showToast("error", "Add a listing link or a listing price")
        const platform = (addForm.listingPlatform || "OTHER").toUpperCase()
        const listing = { platform, url, pricePence: pricePence > 0 ? pricePence : null }

        onAddChange({
            listingUrl: "",
            listingPrice: "0.00",
            listings: Array.isArray(addForm.listings) ? [...addForm.listings, listing] : [listing],
        })
    }

    const removeAddListingFromForm = (idx) => {
        const arr = Array.isArray(addForm.listings) ? [...addForm.listings] : []
        arr.splice(idx, 1)
        onAddChange({ listings: arr })
    }

    /**
     * ADDITION: URL Import handler
     */
    const importFromUrlIntoAdd = async () => {
        const raw = safeStr(importUrl)
        if (!raw) return showToast("error", "Paste a listing URL")
        const url = linkify(raw)
        if (!url) return showToast("error", "Invalid URL")

        const guessedPlatform = guessPlatformFromUrl(url)

        setImporting(true)
        try {
            const res = await fetch(`/api/listing-import?url=${encodeURIComponent(url)}`, { cache: "no-store" })
            const data = await res.json().catch(() => null)
            if (!res.ok || !data?.ok) throw new Error(data?.error || `Import failed (${res.status})`)

            const d = data?.data || {}

            const title = safeStr(d.title) || ""
            const platform = safeStr(d.platform).toUpperCase() || guessedPlatform
            const pricePence = Number(d.pricePence)
            const hasPrice = Number.isFinite(pricePence) && pricePence > 0

            setAddForm((p) => ({
                ...p,
                title: title || p.title,
                status: "LISTED",
                listingPlatform: PLATFORMS.some(([v]) => v === platform) ? platform : p.listingPlatform,
                listingUrl: url,
                listingPrice: hasPrice ? (pricePence / 100).toFixed(2) : p.listingPrice,
            }))

            showToast("ok", hasPrice ? "Imported listing (title + price)" : "Imported listing (title only)")
        } catch (e) {
            showToast("error", e?.message || "Import failed")
        } finally {
            setImporting(false)
        }
    }

    const submitAdd = async (e) => {
        e?.preventDefault?.()
        const name = String(addForm.title || "").trim()
        if (!name) return showToast("error", "Title is required")

        if ((addForm.category === "Clothes" || addForm.category === "Shoes") && !addForm.size) {
            return showToast("error", "Size is required for clothing and shoes")
        }
        const status = (addForm.status || "UNLISTED").toUpperCase()

        const purchaseTotalPence = parseMoneyToPence(addForm.purchaseTotal)
        const estimatedSalePence = parseMoneyToPence(addForm.estimatedSale)

        const listings = buildListingsFromForm({
            status,
            listingPlatform: addForm.listingPlatform,
            listingUrl: addForm.listingUrl,
            listingPrice: addForm.listingPrice,
            listings: addForm.listings,
        })

        const meta = {
            currency: currencyView,
            status,
            category: addForm.category || null,
            condition: addForm.condition || null,
            imageUrl: addForm.imageUrl || null,
            size: (addForm.category === "Clothes" || addForm.category === "Shoes") ? (addForm.size || null) : null,
            purchaseTotalPence,
            estimatedSalePence,

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

        const first = meta.listings?.[0] || null
        const firstPrice = first?.pricePence == null ? "0.00" : ((Number(first.pricePence) || 0) / 100).toFixed(2)
        const firstUrl = first?.url || ""
        const firstPlatform = (first?.platform || "EBAY").toUpperCase()
        const rest = (meta.listings || []).slice(1).map((l) => ({ ...l }))

        setEditItem(it)
        setEditForm({
            title: it.name || "",
            sku: it.sku || "",
            quantity: Number(it.quantity) || 0,

            category: meta.category || "Clothes",
            condition: meta.condition || "Good",
            status: (meta.status || "UNLISTED").toUpperCase(),
            size: meta.size || "",
            purchaseTotal: ((Number(meta.purchaseTotalPence || it.costPence || 0) || 0) / 100).toFixed(2),
            estimatedSale: meta.estimatedSalePence == null ? "0.00" : ((Number(meta.estimatedSalePence) || 0) / 100).toFixed(2),

            listingPlatform: firstPlatform,
            listingUrl: firstUrl,
            listingPrice: firstPrice,
            listings: rest,

            notes: decoded.notes || "",
            imageUrl: meta.imageUrl || "",
        })

        setEditImageFile(null)
        setEditImageError("")
        setEditOpen(true)
    }

    const onEditChange = (patch) => setEditForm((p) => ({ ...p, ...patch }))

    const editStatus = String(editForm.status || "UNLISTED").toUpperCase()
    const editIsListed = editStatus === "LISTED" || editStatus === "SOLD"

    const addListingToEditForm = () => {
        const url = safeStr(editForm.listingUrl)
        const pricePence = parseMoneyToPence(editForm.listingPrice)
        if (!url && pricePence <= 0) return showToast("error", "Add a listing link or a listing price")
        const platform = (editForm.listingPlatform || "OTHER").toUpperCase()
        const listing = { platform, url, pricePence: pricePence > 0 ? pricePence : null }

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
        if ((editForm.category === "Clothes" || editForm.category === "Shoes") && !editForm.size) {
            return showToast("error", "Size is required for clothing and shoes")
        }
        const status = (editForm.status || "UNLISTED").toUpperCase()

        const purchaseTotalPence = parseMoneyToPence(editForm.purchaseTotal)
        const estimatedSalePence = parseMoneyToPence(editForm.estimatedSale)

        const listings = buildListingsFromForm({
            status,
            listingPlatform: editForm.listingPlatform,
            listingUrl: editForm.listingUrl,
            listingPrice: editForm.listingPrice,
            listings: editForm.listings,
        })

        const meta = {
            currency: currencyView,
            status,
            category: editForm.category || null,
            condition: editForm.condition || null,
            imageUrl: editForm.imageUrl || null,
            size: (editForm.category === "Clothes" || editForm.category === "Shoes") ? (editForm.size || null) : null,
            purchaseTotalPence,
            estimatedSalePence,

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

    const enabledColumnsCount = useMemo(() => COLUMN_DEFS.reduce((a, d) => a + (columns[d.key] ? 1 : 0), 0), [columns])

    const columnKeys = useMemo(() => {
        const keys = []
        for (const def of COLUMN_DEFS) {
            if (columns[def.key]) keys.push(def.key)
            if (keys.length >= MAX_VISIBLE_COLUMNS) break
        }
        return keys
    }, [columns])

    const middleCols = useMemo(() => columnKeys.map((k) => COLUMN_DEFS.find((d) => d.key === k)).filter(Boolean), [columnKeys])

    // Fit-to-width grid (no horizontal scroll)
    const middleGridCols = useMemo(() => `repeat(${Math.max(1, middleCols.length)}, minmax(0, 1fr))`, [middleCols])

    const filteredItems = useMemo(() => {
        const q = String(search || "").trim().toLowerCase()

        const statusF = String(filters.status || "ALL").toUpperCase()
        const categoryF = String(filters.category || "ALL")
        const conditionF = String(filters.condition || "ALL")
        const platformF = String(filters.platform || "ALL").toUpperCase()
        const onlyLinks = !!filters.onlyWithLinks

        const statusLabelMap = Object.fromEntries(STATUSES.map(([value, label]) => [String(value).toUpperCase(), String(label)]))

        return items.filter((it) => {
            const c = compute(it)

            if (statusF !== "ALL" && c.status !== statusF) return false
            if (categoryF !== "ALL" && (c.meta.category || "—") !== categoryF) return false
            if (conditionF !== "ALL" && (c.meta.condition || "—") !== conditionF) return false

            if (platformF !== "ALL") {
                const hasPlatform = (c.meta.listings || []).some((l) => String(l.platform || "").toUpperCase() === platformF)
                if (!hasPlatform) return false
            }

            if (onlyLinks) {
                const hasAnyLinks = (c.meta.listings || []).some((l) => safeStr(l.url))
                if (!hasAnyLinks) return false
            }

            if (!q) return true

            const sku = String(it.sku ?? "").toLowerCase()
            const name = String(it.name ?? "").toLowerCase()
            const cat = String(c.meta.category ?? "").toLowerCase()
            const cond = String(c.meta.condition ?? "").toLowerCase()
            const notes = String(c.notesPlain ?? "").toLowerCase()

            const statusCode = String(c.status ?? "").toLowerCase()
            const statusLabel = String(statusLabelMap[String(c.status ?? "").toUpperCase()] || "").toLowerCase()

            const listingPlatforms = (c.meta.listings || []).map((l) => String(l.platform || "")).join(" ").toLowerCase()
            const listingUrls = (c.meta.listings || []).map((l) => String(l.url || "")).join(" ").toLowerCase()

            return (
                name.includes(q) ||
                sku.includes(q) ||
                cat.includes(q) ||
                cond.includes(q) ||
                notes.includes(q) ||
                statusCode.includes(q) ||
                statusLabel.includes(q) ||
                listingPlatforms.includes(q) ||
                listingUrls.includes(q)
            )
        })
    }, [items, search, filters])

    const visibleIds = useMemo(() => filteredItems.map((x) => x.id), [filteredItems])
    const allVisibleSelected = useMemo(() => visibleIds.length > 0 && visibleIds.every((id) => selected.has(id)), [visibleIds, selected])

    const toggleSelectAllVisible = () => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (allVisibleSelected) {
                for (const id of visibleIds) next.delete(id)
            } else {
                for (const id of visibleIds) next.add(id)
            }
            return next
        })
    }

    const totals = useMemo(() => {
        const rowCount = filteredItems.length
        const unitCount = filteredItems.reduce((a, it) => a + (Number(it.quantity) || 0), 0)

        let invested = 0
        let profit = 0
        let withProfitCount = 0

        for (const it of filteredItems) {
            const c = compute(it)
            const toView = (minor) => convertMinor(minor, c.itemCur, currencyView, fx.rates).value

            invested += toView(c.purchaseTotal)

            if (c.profitTotal != null) {
                profit += toView(c.profitTotal)
                withProfitCount += 1
            }
        }

        return { rowCount, unitCount, invested, profit, withProfitCount }
    }, [filteredItems, currencyView, fx.rates])

    const renderPurchaseTotal = (it) => {
        const c = compute(it)
        const perUnit = convertMinor(c.purchaseTotalPerUnit, c.itemCur, currencyView, fx.rates).value
        const total = convertMinor(c.purchaseTotal, c.itemCur, currencyView, fx.rates).value

        return (
            <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] text-white">{fmt(currencyView, total)}</span>
                <span className="truncate text-[11px] text-zinc-400">{fmt(currencyView, perUnit)} / unit</span>
            </div>
        )
    }

    const renderSalePrice = (it) => {
        const c = compute(it)
        if (c.salePriceTotal == null) return <span className="text-zinc-400">—</span>
        const v = convertMinor(c.salePriceTotal, c.itemCur, currencyView, fx.rates).value
        return <span className="truncate text-[13px] text-white">{fmt(currencyView, v)}</span>
    }

    const renderProfit = (it) => {
        const c = compute(it)
        if (c.profitTotal == null) return <span className="text-zinc-400">—</span>
        const v = convertMinor(c.profitTotal, c.itemCur, currencyView, fx.rates).value
        return <span className={v >= 0 ? "truncate text-emerald-200 font-semibold text-[13px]" : "truncate text-red-200 font-semibold text-[13px]"}>{fmt(currencyView, v)}</span>
    }

    const renderPurchasePerUnit = (it) => {
        const c = compute(it)
        const v = convertMinor(c.purchaseTotalPerUnit, c.itemCur, currencyView, fx.rates).value
        return <span className="truncate text-[13px] text-white">{fmt(currencyView, v)}</span>
    }

    const renderSalePerUnit = (it) => {
        const c = compute(it)
        if (c.salePricePerUnit == null) return <span className="text-zinc-400">—</span>
        const v = convertMinor(c.salePricePerUnit, c.itemCur, currencyView, fx.rates).value
        return <span className="truncate text-[13px] text-white">{fmt(currencyView, v)}</span>
    }

    const renderProfitPerUnit = (it) => {
        const c = compute(it)
        if (c.profitPerUnit == null) return <span className="text-zinc-400">—</span>
        const v = convertMinor(c.profitPerUnit, c.itemCur, currencyView, fx.rates).value
        return <span className={v >= 0 ? "truncate text-emerald-200 font-semibold text-[13px]" : "truncate text-red-200 font-semibold text-[13px]"}>{fmt(currencyView, v)}</span>
    }

    const renderROI = (it) => {
        const c = compute(it)
        const cost = c.purchaseTotalPerUnit || 0
        if (c.profitPerUnit == null || cost <= 0) return <span className="text-zinc-400">—</span>
        const roi = (c.profitPerUnit / cost) * 100
        if (!Number.isFinite(roi)) return <span className="text-zinc-400">—</span>
        return <span className={roi >= 0 ? "truncate text-emerald-200 font-semibold text-[13px]" : "truncate text-red-200 font-semibold text-[13px]"}>{roi.toFixed(1)}%</span>
    }

    const renderAgeDays = (it) => {
        const created = it.createdAt ? new Date(it.createdAt).getTime() : null
        if (!created || !Number.isFinite(created)) return <span className="text-zinc-400">—</span>
        const days = Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)))
        return <span className="truncate text-[13px] text-white">{days}</span>
    }

    const renderUpdated = (it) => {
        if (!it.updatedAt) return <span className="text-zinc-400">—</span>
        const d = new Date(it.updatedAt)
        if (Number.isNaN(d.getTime())) return <span className="text-zinc-400">—</span>
        return <span className="truncate text-[13px] text-white">{d.toLocaleString()}</span>
    }

    const renderListingsChips = (it) => {
        const c = compute(it)
        const ls = c.meta.listings || []
        if (!ls.length) return <span className="text-zinc-400">—</span>

        return (
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                {ls.slice(0, 3).map((l, idx) => {
                    const href = linkify(l.url)
                    const label = (l.platform || "LINK").toUpperCase()
                    return (
                        <a
                            key={`${label}-${idx}`}
                            href={href || "#"}
                            target="_blank"
                            rel="noreferrer"
                            title={href || "No URL"}
                            onClick={(e) => {
                                e.stopPropagation()
                                if (!href) e.preventDefault()
                            }}
                            className="inline-flex max-w-[140px] min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/90 hover:bg-white/10"
                        >
                            <span className="truncate">{label}</span>
                            <span className="shrink-0 text-white/50">↗</span>
                        </a>
                    )
                })}
                {ls.length > 3 ? <span className="shrink-0 text-[11px] font-semibold text-zinc-400">+{ls.length - 3}</span> : null}
            </div>
        )
    }

    const resetFilters = () => {
        setFilters({
            status: "ALL",
            category: "ALL",
            condition: "ALL",
            platform: "ALL",
            onlyWithLinks: false,
        })
    }

    const filtersCount = useMemo(() => {
        let n = 0
        if ((filters.status || "ALL") !== "ALL") n++
        if ((filters.category || "ALL") !== "ALL") n++
        if ((filters.condition || "ALL") !== "ALL") n++
        if ((filters.platform || "ALL") !== "ALL") n++
        if (!!filters.onlyWithLinks) n++
        return n
    }, [filters])

    const ROW_H = "h-[58px]"
    const HEAD_H = "h-[42px]"
    const CELL_PAD = "px-3"
    const CELL_Y = "py-2"
    const HEADER_BG = "bg-white/5"

    const renderMiddleCell = (it, key) => {
        if (key === "status") return <Pill text={compute(it).status} />
        if (key === "sku") return <span className="truncate text-[13px] text-zinc-200">{it.sku ?? "—"}</span>
        if (key === "category") return <span className="truncate text-[13px] text-zinc-200">{compute(it).meta.category ?? "—"}</span>
        if (key === "condition") return <span className="truncate text-[13px] text-zinc-200">{compute(it).meta.condition ?? "—"}</span>
        if (key === "quantity") return <span className="truncate text-[13px] text-zinc-200">{compute(it).q}</span>
        if (key === "purchase") return renderPurchaseTotal(it)
        if (key === "salePrice") return renderSalePrice(it)
        if (key === "profit") return renderProfit(it)
        if (key === "purchasePerUnit") return renderPurchasePerUnit(it)
        if (key === "salePricePerUnit") return renderSalePerUnit(it)
        if (key === "profitPerUnit") return renderProfitPerUnit(it)
        if (key === "roi") return renderROI(it)
        if (key === "listings") return renderListingsChips(it)
        if (key === "ageDays") return renderAgeDays(it)
        if (key === "updated") return renderUpdated(it)
        return <span className="text-zinc-400">—</span>
    }

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-50">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
                        <p className="mt-1 text-sm text-zinc-300">Estimated sale is used for Unlisted. Listing price is used for Listed. Items are removed from inventory when sold.</p>
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

                            <button type="button" onClick={loadFx} className="h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white/90 hover:bg-white/15" title="Refresh exchange rates">
                                {fx.loading ? "FX…" : "FX"}
                            </button>
                        </div>

                        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-9 w-[260px] rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                placeholder="Search title, SKU, category, condition, notes…"
                            />
                            {search ? (
                                <button type="button" onClick={() => setSearch("")} className="h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white/90 hover:bg-white/15">
                                    Clear
                                </button>
                            ) : null}
                        </div>

                        <button type="button" onClick={() => setFiltersOpen(true)} className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15">
                            Filters{filtersCount ? ` (${filtersCount})` : ""}
                        </button>

                        <button type="button" onClick={() => setColumnsOpen(true)} className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15">
                            Columns
                        </button>

                        <button type="button" onClick={loadItems} className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15">
                            Refresh
                        </button>

                        <button type="button" onClick={openBulkImport} className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 flex items-center gap-2">
                            <UploadIcon className="h-4 w-4" />
                            Bulk Import
                        </button>

                        <button type="button" onClick={openAdd} className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100">
                            Add item
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

                <div className="mb-6 grid gap-4 md:grid-cols-4">
                    <StatCard label="Items (rows)" value={totals.rowCount} sub="Visible records" />
                    <StatCard label="Quantity (units)" value={totals.unitCount} sub="Sum of visible quantities" />
                    <StatCard label={`Invested (${currencyView})`} value={fmt(currencyView, totals.invested)} sub="Visible purchase cost" />
                    <StatCard label={`Profit (${currencyView})`} value={fmt(currencyView, totals.profit)} sub={`${totals.withProfitCount} item(s) with sale price`} />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Your items</div>
                            <div className="text-xs text-zinc-300">{loading ? "Loading…" : `${filteredItems.length} row(s)`} • click a row for details</div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={toggleSelectAllVisible} className="h-10 rounded-2xl border border-white/10 bg-transparent px-4 text-sm font-semibold text-white/90 transition hover:bg-white/5">
                                {allVisibleSelected ? "Clear visible" : "Select visible"}
                            </button>

                            {/* MARK AS SOLD BUTTON */}
                            <button
                                type="button"
                                onClick={openBulkSell}
                                disabled={selected.size === 0}
                                className="h-10 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span className="flex items-center gap-2">
                                    <DollarIcon />
                                    Mark as sold ({selected.size})
                                </span>
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

                    <div className="rounded-2xl border border-white/10 overflow-hidden">
                        <div className="flex w-full">
                            {/* LEFT FIXED: checkbox + TITLE ONLY */}
                            <div className="shrink-0 border-r border-white/10" style={{ width: 380 }}>
                                <div className={["flex items-center gap-3 border-b border-white/10", HEAD_H, CELL_PAD, HEADER_BG].join(" ")}>
                                    <TickButton checked={allVisibleSelected} onToggle={toggleSelectAllVisible} title={allVisibleSelected ? "Clear visible" : "Select visible"} />
                                    <div className="text-xs font-semibold text-zinc-200">Title</div>
                                </div>

                                <div className="divide-y divide-white/10">
                                    {!loading && filteredItems.length === 0 ? <div className={["text-sm text-zinc-300", CELL_PAD, "py-6"].join(" ")}>No items match your filters / search.</div> : null}

                                    {filteredItems.map((it, idx) => {
                                        const rowBg = idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"
                                        const checked = selected.has(it.id)
                                        const itemMeta = compute(it).meta

                                        return (
                                            <div key={it.id} className={["flex items-center gap-3 cursor-pointer", ROW_H, CELL_PAD, CELL_Y, rowBg, "hover:bg-white/5"].join(" ")} onClick={() => openDetail(it)}>
                                                <TickButton checked={checked} onToggle={() => toggleSelect(it.id)} title={checked ? "Unselect" : "Select"} />

                                                <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-[13px] font-semibold text-white">{it.name}</div>
                                                        {it.sku ? <div className="truncate text-xs text-zinc-400">{it.sku}</div> : null}
                                                    </div>

                                                    <div className="shrink-0 border-l border-white/10 pl-3 flex items-center">
                                                        {itemMeta.imageUrl ? (
                                                            <img
                                                                src={itemMeta.imageUrl}
                                                                alt={it.name}
                                                                className="w-10 h-10 rounded-lg object-cover"
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg border border-white/10 flex items-center justify-center text-[10px] text-zinc-500 bg-zinc-900/50">
                                                                No img
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* MIDDLE: NO SCROLL, max 6 columns */}
                            <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="w-full">
                                    <div className={["grid border-b border-white/10", HEAD_H, HEADER_BG].join(" ")} style={{ gridTemplateColumns: middleGridCols }}>
                                        {middleCols.map((d) => (
                                            <div key={d.key} className={["flex min-w-0 items-center text-xs font-semibold text-zinc-200", CELL_PAD].join(" ")}>
                                                <span className="truncate">{d.label}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="divide-y divide-white/10">
                                        {filteredItems.map((it, idx) => {
                                            const rowBg = idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"
                                            return (
                                                <div key={it.id} className={["grid cursor-pointer", ROW_H /* keep */, rowBg, "hover:bg-white/5"].join(" ")} style={{ gridTemplateColumns: middleGridCols }} onClick={() => openDetail(it)}>
                                                    {middleCols.map((d) => (
                                                        <div key={d.key} className={["flex min-w-0 items-center overflow-hidden", CELL_PAD, CELL_Y].join(" ")}>
                                                            {renderMiddleCell(it, d.key)}
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT FIXED: actions */}
                            <div className="shrink-0 border-l border-white/10" style={{ width: 104 }}>
                                <div className={["flex items-center justify-end border-b border-white/10", HEAD_H, CELL_PAD, HEADER_BG].join(" ")}>
                                    <div className="text-xs font-semibold text-zinc-200">Actions</div>
                                </div>

                                <div className="divide-y divide-white/10">
                                    {filteredItems.map((it, idx) => {
                                        const rowBg = idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"
                                        return (
                                            <div key={it.id} className={["flex items-center justify-end gap-2", ROW_H, CELL_PAD, CELL_Y, rowBg].join(" ")} onClick={(e) => e.stopPropagation()}>
                                                <IconButton title="Edit" onClick={() => openEdit(it)}>
                                                    <PencilIcon />
                                                </IconButton>
                                                <IconButton title="Delete" onClick={() => singleDelete(it.id)} className="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15">
                                                    <TrashIcon />
                                                </IconButton>
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
                            <span className="text-zinc-300 underline underline-offset-2" dangerouslySetInnerHTML={{ __html: fx.attributionHtml || '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>' }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* FILTERS MODAL */}
            {filtersOpen ? (
                <Modal
                    title="Filters"
                    onClose={() => setFiltersOpen(false)}
                    maxWidth="max-w-2xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button type="button" onClick={resetFilters} className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10">
                                Reset
                            </button>
                            <button type="button" onClick={() => setFiltersOpen(false)} className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100">
                                Done
                            </button>
                        </div>
                    }
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Status">
                            <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                <option value="ALL">All</option>
                                {STATUSES.map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Category">
                            <select value={filters.category} onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                <option value="ALL">All</option>
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Condition">
                            <select value={filters.condition} onChange={(e) => setFilters((p) => ({ ...p, condition: e.target.value }))} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                <option value="ALL">All</option>
                                {CONDITIONS.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Has platform listing">
                            <select value={filters.platform} onChange={(e) => setFilters((p) => ({ ...p, platform: e.target.value }))} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                <option value="ALL">All</option>
                                {PLATFORMS.filter(([v]) => v !== "NONE").map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <div
                            role="button"
                            tabIndex={0}
                            className="sm:col-span-2 flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
                            onClick={() => setFilters((p) => ({ ...p, onlyWithLinks: !p.onlyWithLinks }))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") setFilters((p) => ({ ...p, onlyWithLinks: !p.onlyWithLinks }))
                            }}
                        >
                            <div className="text-sm font-semibold text-white">Only items with links</div>
                            <TickButton checked={!!filters.onlyWithLinks} onToggle={() => setFilters((p) => ({ ...p, onlyWithLinks: !p.onlyWithLinks }))} title={filters.onlyWithLinks ? "Disable" : "Enable"} />
                        </div>
                    </div>
                </Modal>
            ) : null}

            {/* COLUMNS MODAL */}
            {columnsOpen ? (
                <Modal
                    title="Columns"
                    onClose={() => setColumnsOpen(false)}
                    maxWidth="max-w-2xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button type="button" onClick={() => setColumns(clampColumnsToMax(DEFAULT_COLUMNS, MAX_VISIBLE_COLUMNS))} className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10">
                                Reset
                            </button>
                            <button type="button" onClick={() => setColumnsOpen(false)} className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100">
                                Done
                            </button>
                        </div>
                    }
                >
                    <div className="grid gap-3">
                        <div className="mb-2 text-xs text-zinc-300">
                            Toggle up to {MAX_VISIBLE_COLUMNS} columns. Currently showing <span className="font-semibold text-white">{enabledColumnsCount}</span> of {COLUMN_DEFS.length}.
                        </div>

                        {COLUMN_DEFS.map((def) => {
                            const active = !!columns[def.key]
                            const disabledBecauseFull = !active && enabledColumnsCount >= MAX_VISIBLE_COLUMNS

                            return (
                                <div
                                    key={def.key}
                                    role="button"
                                    tabIndex={disabledBecauseFull ? -1 : 0}
                                    className={["flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3", disabledBecauseFull ? "opacity-50 cursor-not-allowed bg-white/[0.02]" : "bg-white/5 hover:bg-white/10"].join(" ")}
                                    onClick={() => {
                                        if (disabledBecauseFull) return
                                        setColumns((prev) => clampColumnsToMax({ ...prev, [def.key]: !active }, MAX_VISIBLE_COLUMNS))
                                    }}
                                    onKeyDown={(e) => {
                                        if (disabledBecauseFull) return
                                        if (e.key === "Enter" || e.key === " ") {
                                            setColumns((prev) => clampColumnsToMax({ ...prev, [def.key]: !active }, MAX_VISIBLE_COLUMNS))
                                        }
                                    }}
                                >
                                    <div className="text-sm font-semibold text-white">{def.label}</div>
                                    <TickButton checked={active} onToggle={() => setColumns((prev) => clampColumnsToMax({ ...prev, [def.key]: !active }, MAX_VISIBLE_COLUMNS))} title={active ? "Hide" : "Show"} disabled={disabledBecauseFull} />
                                </div>
                            )
                        })}
                    </div>
                </Modal>
            ) : null}

            {/* ADD ITEM MODAL */}
            {addOpen ? (
                <Modal
                    title="Add item"
                    onClose={() => setAddOpen(false)}
                    maxWidth="max-w-4xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setAddOpen(false)} className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10">
                                Cancel
                            </button>
                            <button type="submit" form="rt-add-form" disabled={addSaving} className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60">
                                {addSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    }
                >
                    <form id="rt-add-form" onSubmit={submitAdd} className="space-y-4">
                        {/* Import URL section */}
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm font-semibold text-white">Import from listing URL (optional)</div>
                            <div className="mt-1 text-xs text-zinc-300">Paste an eBay, Vinted, etc. URL and click Import. Requires /api/listing-import endpoint.</div>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <input
                                    value={importUrl}
                                    onChange={(e) => setImportUrl(e.target.value)}
                                    className="h-11 flex-1 rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    placeholder="https://ebay.co.uk/itm/…"
                                />
                                <button type="button" onClick={importFromUrlIntoAdd} disabled={importing} className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60">
                                    {importing ? "Importing…" : "Import"}
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Title *" className="md:col-span-2">
                                <input value={addForm.title} onChange={(e) => onAddChange({ title: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="Item name…" />
                            </Field>

                            {/* ===================== Image Upload ===================== */}
                            <div className="md:col-span-2">
                                <div className="text-xs font-semibold text-zinc-300 mb-2">Image</div>
                                <div className="flex items-start gap-4">
                                    <div className="flex-1">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleAddImageChange}
                                            className="block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/15 border border-white/10 rounded-2xl p-2 bg-zinc-950/60"
                                        />
                                        {addImageError ? (
                                            <p className="mt-2 text-sm text-red-400">{addImageError}</p>
                                        ) : (
                                            <p className="mt-2 text-xs text-zinc-400">PNG/JPG recommended. Max 3MB.</p>
                                        )}
                                    </div>
                                    <div className="w-20 h-20 border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center bg-zinc-950/60 shrink-0">
                                        {addForm.imageUrl ? (
                                            <img
                                                src={addForm.imageUrl}
                                                alt="Item preview"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-xs text-zinc-500">No image</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* ======================================================= */}

                            <Field label="SKU">
                                <input value={addForm.sku} onChange={(e) => onAddChange({ sku: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="Optional…" />
                            </Field>

                            <Field label="Quantity">
                                <input type="number" min={0} value={addForm.quantity} onChange={(e) => onAddChange({ quantity: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" />
                            </Field>

                            <Field label="Category">
                                <select value={addForm.category} onChange={(e) => onAddChange({ category: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            {(addForm.category === "Clothes" || addForm.category === "Shoes") && (
                                <Field label="Size *">
                                    <select
                                        value={addForm.size}
                                        onChange={(e) => onAddChange({ size: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        <option value="">Select size</option>
                                        {(addForm.category === "Shoes" ? SHOE_SIZES : CLOTHING_SIZES).map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            {(addForm.category === "Clothes" || addForm.category === "Shoes") && (
                                <Field label="Size *">
                                    <select
                                        value={addForm.size}
                                        onChange={(e) => onAddChange({ size: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        <option value="">Select size</option>
                                        {(addForm.category === "Shoes" ? SHOE_SIZES : CLOTHING_SIZES).map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            <Field label="Condition">
                                <select value={addForm.condition} onChange={(e) => onAddChange({ condition: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                    {CONDITIONS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label={`Purchase total / unit (${currencyView})`}>
                                <input inputMode="decimal" value={addForm.purchaseTotal} onChange={(e) => onAddChange({ purchaseTotal: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="0.00" />
                            </Field>

                            <Field label="Status">
                                <select value={addForm.status} onChange={(e) => onAddChange({ status: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                    {STATUSES.map(([v, l]) => (
                                        <option key={v} value={v}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            {!addIsListed ? (
                                <Field label={`Estimated sale / unit (${currencyView})`}>
                                    <input inputMode="decimal" value={addForm.estimatedSale} onChange={(e) => onAddChange({ estimatedSale: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="0.00" />
                                </Field>
                            ) : (
                                <>
                                    <Field label={`Listing price / unit (${currencyView})`}>
                                        <input inputMode="decimal" value={addForm.listingPrice} onChange={(e) => onAddChange({ listingPrice: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="0.00" />
                                    </Field>

                                    <Field label="Platform">
                                        <select value={addForm.listingPlatform} onChange={(e) => onAddChange({ listingPlatform: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                            {PLATFORMS.filter(([v]) => v !== "NONE").map(([v, l]) => (
                                                <option key={v} value={v}>
                                                    {l}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label="Listing link (optional)" className="md:col-span-2">
                                        <input value={addForm.listingUrl} onChange={(e) => onAddChange({ listingUrl: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="https://…" />
                                    </Field>

                                    <div className="md:col-span-2 flex items-center justify-end">
                                        <button type="button" onClick={addListingToForm} className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15">
                                            Add extra link
                                        </button>
                                    </div>

                                    {(Array.isArray(addForm.listings) ? addForm.listings : []).length ? (
                                        <div className="md:col-span-2 space-y-2">
                                            {addForm.listings.map((l, idx) => (
                                                <div key={`${l.platform}-${idx}`} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-950/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-white">{String(l.platform || "OTHER").toUpperCase()}</div>
                                                        <div className="mt-1 text-xs text-zinc-400">
                                                            {l.url ? linkify(l.url) : "No URL"} • {l.pricePence == null ? "No price" : fmt(currencyView, Number(l.pricePence) || 0)}
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => removeAddListingFromForm(idx)} className="h-10 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/15">
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </>
                            )}

                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4 md:col-span-2">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <Snapshot label="Total cost" value={fmt(currencyView, parseMoneyToPence(addForm.purchaseTotal) * safeInt(addForm.quantity, 0))} />
                                    {!addIsListed ? (
                                        <>
                                            <Snapshot label="Estimated sale total" value={fmt(currencyView, parseMoneyToPence(addForm.estimatedSale) * safeInt(addForm.quantity, 0))} good />
                                            <Snapshot label="Estimated profit" value={fmt(currencyView, (parseMoneyToPence(addForm.estimatedSale) - parseMoneyToPence(addForm.purchaseTotal)) * safeInt(addForm.quantity, 0))} good />
                                        </>
                                    ) : (
                                        <>
                                            <Snapshot label="Listed sale total" value={fmt(currencyView, parseMoneyToPence(addForm.listingPrice) * safeInt(addForm.quantity, 0))} good />
                                            <Snapshot label="Listed profit" value={fmt(currencyView, (parseMoneyToPence(addForm.listingPrice) - parseMoneyToPence(addForm.purchaseTotal)) * safeInt(addForm.quantity, 0))} good />
                                        </>
                                    )}
                                </div>
                            </div>

                            <Field label="Notes" className="md:col-span-2">
                                <textarea value={addForm.notes} onChange={(e) => onAddChange({ notes: e.target.value })} className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20" placeholder="Anything useful…" />
                            </Field>
                        </div>
                    </form>
                </Modal>
            ) : null}

            {/* EDIT ITEM MODAL */}
            {editOpen && editItem ? (
                <Modal
                    title="Edit item"
                    onClose={() => {
                        setEditOpen(false)
                        setEditItem(null)
                    }}
                    maxWidth="max-w-4xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button type="button" onClick={() => singleDelete(editItem.id)} className="h-11 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/15">
                                Delete
                            </button>

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
                                <button type="submit" form="rt-edit-form" disabled={editSaving} className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60">
                                    {editSaving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </div>
                    }
                >
                    <form id="rt-edit-form" onSubmit={submitEdit} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Title *" className="md:col-span-2">
                                <input value={editForm.title} onChange={(e) => onEditChange({ title: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="Item name…" />
                            </Field>

                            {/* ===================== Image Upload ===================== */}
                            <div className="md:col-span-2">
                                <div className="text-xs font-semibold text-zinc-300 mb-2">Image</div>
                                <div className="flex items-start gap-4">
                                    <div className="flex-1">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleEditImageChange}
                                            className="block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/15 border border-white/10 rounded-2xl p-2 bg-zinc-950/60"
                                        />
                                        {editImageError ? (
                                            <p className="mt-2 text-sm text-red-400">{editImageError}</p>
                                        ) : (
                                            <p className="mt-2 text-xs text-zinc-400">PNG/JPG recommended. Max 3MB.</p>
                                        )}
                                    </div>
                                    <div className="w-20 h-20 border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center bg-zinc-950/60 shrink-0">
                                        {editForm.imageUrl ? (
                                            <img
                                                src={editForm.imageUrl}
                                                alt="Item preview"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-xs text-zinc-500">No image</span>
                                        )}
                                    </div>
                                </div>
                                {editForm.imageUrl && (
                                    <button
                                        type="button"
                                        onClick={() => onEditChange({ imageUrl: "" })}
                                        className="mt-2 text-xs text-red-400 hover:text-red-300"
                                    >
                                        Remove image
                                    </button>
                                )}
                            </div>
                            {/* ======================================================= */}

                            <Field label="SKU">
                                <input value={editForm.sku} onChange={(e) => onEditChange({ sku: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="Optional…" />
                            </Field>

                            <Field label="Quantity">
                                <input type="number" min={0} value={editForm.quantity} onChange={(e) => onEditChange({ quantity: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" />
                            </Field>

                            <Field label="Category">
                                <select value={editForm.category} onChange={(e) => onEditChange({ category: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            {(editForm.category === "Clothes" || editForm.category === "Shoes") && (
                                <Field label="Size *">
                                    <select
                                        value={editForm.size}
                                        onChange={(e) => onEditChange({ size: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        <option value="">Select size</option>
                                        {(editForm.category === "Shoes" ? SHOE_SIZES : CLOTHING_SIZES).map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            {(addForm.category === "Clothes" || addForm.category === "Shoes") && (
                                <Field label="Size *">
                                    <select
                                        value={addForm.size}
                                        onChange={(e) => onAddChange({ size: e.target.value })}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20"
                                    >
                                        <option value="">Select size</option>
                                        {(addForm.category === "Shoes" ? SHOE_SIZES : CLOTHING_SIZES).map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            <Field label="Condition">
                                <select value={addForm.condition} onChange={(e) => onAddChange({ condition: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                    {CONDITIONS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label={`Purchase total / unit (${currencyView})`}>
                                <input inputMode="decimal" value={editForm.purchaseTotal} onChange={(e) => onEditChange({ purchaseTotal: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="0.00" />
                            </Field>

                            <Field label="Status">
                                <select value={editForm.status} onChange={(e) => onEditChange({ status: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                    {STATUSES.map(([v, l]) => (
                                        <option key={v} value={v}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            {!editIsListed ? (
                                <Field label={`Estimated sale / unit (${currencyView})`}>
                                    <input inputMode="decimal" value={editForm.estimatedSale} onChange={(e) => onEditChange({ estimatedSale: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="0.00" />
                                </Field>
                            ) : (
                                <>
                                    <Field label={`Listing price / unit (${currencyView})`}>
                                        <input inputMode="decimal" value={editForm.listingPrice} onChange={(e) => onEditChange({ listingPrice: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="0.00" />
                                    </Field>

                                    <Field label="Platform">
                                        <select value={editForm.listingPlatform} onChange={(e) => onEditChange({ listingPlatform: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20">
                                            {PLATFORMS.filter(([v]) => v !== "NONE").map(([v, l]) => (
                                                <option key={v} value={v}>
                                                    {l}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label="Listing link (optional)" className="md:col-span-2">
                                        <input value={editForm.listingUrl} onChange={(e) => onEditChange({ listingUrl: e.target.value })} className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-sm text-white outline-none focus:border-white/20" placeholder="https://…" />
                                    </Field>

                                    <div className="md:col-span-2 flex items-center justify-end">
                                        <button type="button" onClick={addListingToEditForm} className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15">
                                            Add extra link
                                        </button>
                                    </div>

                                    {(Array.isArray(editForm.listings) ? editForm.listings : []).length ? (
                                        <div className="md:col-span-2 space-y-2">
                                            {editForm.listings.map((l, idx) => (
                                                <div key={`${l.platform}-${idx}`} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-950/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-white">{String(l.platform || "OTHER").toUpperCase()}</div>
                                                        <div className="mt-1 text-xs text-zinc-400">
                                                            {l.url ? linkify(l.url) : "No URL"} • {l.pricePence == null ? "No price" : fmt(currencyView, Number(l.pricePence) || 0)}
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => removeListingFromEditForm(idx)} className="h-10 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/15">
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </>
                            )}

                            <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4 md:col-span-2">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <Snapshot label="Total cost" value={fmt(currencyView, parseMoneyToPence(editForm.purchaseTotal) * safeInt(editForm.quantity, 0))} />
                                    {!editIsListed ? (
                                        <>
                                            <Snapshot label="Estimated sale total" value={fmt(currencyView, parseMoneyToPence(editForm.estimatedSale) * safeInt(editForm.quantity, 0))} good />
                                            <Snapshot label="Estimated profit" value={fmt(currencyView, (parseMoneyToPence(editForm.estimatedSale) - parseMoneyToPence(editForm.purchaseTotal)) * safeInt(editForm.quantity, 0))} good />
                                        </>
                                    ) : (
                                        <>
                                            <Snapshot label="Listed sale total" value={fmt(currencyView, parseMoneyToPence(editForm.listingPrice) * safeInt(editForm.quantity, 0))} good />
                                            <Snapshot label="Listed profit" value={fmt(currencyView, (parseMoneyToPence(editForm.listingPrice) - parseMoneyToPence(editForm.purchaseTotal)) * safeInt(editForm.quantity, 0))} good />
                                        </>
                                    )}
                                </div>
                            </div>

                            <Field label="Notes" className="md:col-span-2">
                                <textarea value={editForm.notes} onChange={(e) => onEditChange({ notes: e.target.value })} className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white outline-none focus:border-white/20" placeholder="Anything useful…" />
                            </Field>
                        </div>
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
                            <button type="button" onClick={() => singleDelete(detailItem.id)} className="h-11 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/15">
                                Delete
                            </button>

                            <button type="button" onClick={() => openEdit(detailItem)} className="h-11 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15">
                                Edit
                            </button>
                        </div>
                    }
                >
                    <DetailPanel item={detailItem} currencyView={currencyView} rates={fx.rates} />
                </Modal>
            ) : null}

            {/* BULK MARK AS SOLD MODAL */}
            {bulkSellOpen ? (
                <Modal
                    title="Mark items as sold"
                    onClose={() => {
                        setBulkSellOpen(false)
                        setBulkSellItems([])
                    }}
                    maxWidth="max-w-5xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <button
                                type="button"
                                onClick={() => {
                                    setBulkSellOpen(false)
                                    setBulkSellItems([])
                                }}
                                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={submitBulkSell}
                                disabled={bulkSellSaving || bulkSellItems.length === 0}
                                className="h-11 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                            >
                                {bulkSellSaving ? "Processing…" : `Record ${bulkSellItems.length} sale(s)`}
                            </button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                            <div className="grid gap-2 sm:grid-cols-4">
                                <Snapshot label="Items" value={bulkSellItems.length} />
                                <Snapshot label="Total units" value={bulkSellTotals.units} />
                                <Snapshot label={`Revenue (${currencyView})`} value={fmt(currencyView, bulkSellTotals.revenue)} good />
                                <Snapshot label={`Profit (${currencyView})`} value={fmt(currencyView, bulkSellTotals.profit)} good={bulkSellTotals.profit >= 0} />
                            </div>
                        </div>

                        <div className="text-xs text-zinc-300">
                            Enter sale details for each item. Quantity will be decremented from inventory, or the item will be removed entirely if quantity reaches 0.
                        </div>

                        {/* Items list */}
                        <div className="space-y-3">
                            {bulkSellItems.map((entry, index) => {
                                const qty = safeInt(entry.quantitySold, 0)
                                const price = parseMoneyToPence(entry.salePricePerUnit)
                                const cost = (entry.computed?.purchaseTotalPerUnit || 0) * qty
                                const revenue = qty * price
                                const profit = revenue - cost

                                return (
                                    <div key={entry.item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-white truncate">{entry.item.name}</div>
                                                <div className="text-xs text-zinc-400">
                                                    SKU: {entry.item.sku || "—"} • Available: {entry.availableQty} • Cost: {fmt(currencyView, entry.computed?.purchaseTotalPerUnit || 0)}/unit
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeBulkSellItem(index)}
                                                className="shrink-0 h-8 w-8 rounded-xl border border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15 flex items-center justify-center"
                                                title="Remove from list"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-4">
                                            <Field label="Quantity sold">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={entry.availableQty}
                                                    value={entry.quantitySold}
                                                    onChange={(e) => updateBulkSellItem(index, { quantitySold: e.target.value })}
                                                    className="h-10 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                                />
                                            </Field>

                                            <Field label={`Sale price / unit (${currencyView})`}>
                                                <input
                                                    inputMode="decimal"
                                                    value={entry.salePricePerUnit}
                                                    onChange={(e) => updateBulkSellItem(index, { salePricePerUnit: e.target.value })}
                                                    className="h-10 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                                    placeholder="0.00"
                                                />
                                            </Field>

                                            <Field label="Platform">
                                                <select
                                                    value={entry.platform}
                                                    onChange={(e) => updateBulkSellItem(index, { platform: e.target.value })}
                                                    className="h-10 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                                >
                                                    {PLATFORMS.filter(([v]) => v !== "NONE").map(([v, l]) => (
                                                        <option key={v} value={v}>
                                                            {l}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>

                                            <Field label="Notes (optional)">
                                                <input
                                                    value={entry.notes}
                                                    onChange={(e) => updateBulkSellItem(index, { notes: e.target.value })}
                                                    className="h-10 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/20"
                                                    placeholder="Optional…"
                                                />
                                            </Field>
                                        </div>

                                        <div className="mt-3 flex items-center gap-4 text-xs">
                                            <span className="text-zinc-400">Revenue: <span className="text-white font-semibold">{fmt(currencyView, revenue)}</span></span>
                                            <span className="text-zinc-400">Cost: <span className="text-white font-semibold">{fmt(currencyView, cost)}</span></span>
                                            <span className="text-zinc-400">Profit: <span className={profit >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>{fmt(currencyView, profit)}</span></span>
                                            <span className="text-zinc-400">Remaining: <span className={Math.max(0, entry.availableQty - qty) === 0 ? "text-red-200 font-semibold" : "text-white font-semibold"}>{Math.max(0, entry.availableQty - qty) === 0 ? "Removed" : Math.max(0, entry.availableQty - qty)}</span></span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {bulkSellItems.length === 0 ? (
                            <div className="text-center py-8 text-zinc-400">No sellable items selected.</div>
                        ) : null}
                    </div>
                </Modal>
            ) : null}

            {/* BULK IMPORT MODAL */}
            {bulkImportOpen ? (
                <Modal
                    title="Bulk Import Inventory"
                    onClose={() => setBulkImportOpen(false)}
                    maxWidth="max-w-5xl"
                    footer={
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:items-center">
                            <div className="text-sm text-zinc-400">
                                {bulkImportItems.length > 0 ? (
                                    <span>{bulkImportValidCount} of {bulkImportItems.length} item(s) valid</span>
                                ) : (
                                    <span>Upload a file or paste data to begin</span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBulkImportOpen(false)}
                                    className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 hover:bg-white/10"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={submitBulkImport}
                                    disabled={bulkImportSaving || bulkImportValidCount === 0}
                                    className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {bulkImportSaving ? "Importing…" : `Import ${bulkImportValidCount} Item(s)`}
                                </button>
                            </div>
                        </div>
                    }
                >
                    <div className="space-y-5">
                        {/* Format Guide */}
                        <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                            <div className="flex items-start gap-3">
                                <FileIcon className="h-5 w-5 text-blue-200 shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-sm font-semibold text-blue-100">File Format Guide</div>
                                    <div className="mt-1 text-xs text-blue-200/80">
                                        Your file should have a header row with these columns: <span className="font-semibold">Title</span> (required), SKU, Quantity, Category, Condition, Status, Purchase Price, Estimated Sale, Notes.
                                        Supported formats: CSV, TSV (tab-separated), or copy-paste from Excel/Google Sheets.
                                    </div>
                                    <button
                                        type="button"
                                        onClick={generateBulkImportTemplate}
                                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-100 hover:text-white"
                                    >
                                        <DownloadIcon className="h-3.5 w-3.5" />
                                        Download CSV Template
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Tab Selection */}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setBulkImportTab("file")}
                                className={[
                                    "h-10 px-4 rounded-xl text-sm font-semibold transition",
                                    bulkImportTab === "file"
                                        ? "bg-white text-zinc-950"
                                        : "border border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                                ].join(" ")}
                            >
                                <span className="flex items-center gap-2">
                                    <UploadIcon className="h-4 w-4" />
                                    Upload File
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setBulkImportTab("paste")}
                                className={[
                                    "h-10 px-4 rounded-xl text-sm font-semibold transition",
                                    bulkImportTab === "paste"
                                        ? "bg-white text-zinc-950"
                                        : "border border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                                ].join(" ")}
                            >
                                <span className="flex items-center gap-2">
                                    <ClipboardIcon className="h-4 w-4" />
                                    Copy &amp; Paste
                                </span>
                            </button>
                        </div>

                        {/* File Upload Tab */}
                        {bulkImportTab === "file" ? (
                            <div className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center">
                                <UploadIcon className="h-10 w-10 mx-auto text-zinc-400" />
                                <div className="mt-3 text-sm text-zinc-300">
                                    Drag and drop a CSV file, or click to browse
                                </div>
                                <input
                                    type="file"
                                    accept=".csv,.txt,.tsv"
                                    onChange={handleBulkImportFile}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    style={{ position: "relative", width: "100%", height: "48px", marginTop: "12px" }}
                                />
                                <label className="mt-3 inline-block cursor-pointer">
                                    <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15">
                                        Choose File
                                    </span>
                                    <input
                                        type="file"
                                        accept=".csv,.txt,.tsv"
                                        onChange={handleBulkImportFile}
                                        className="sr-only"
                                    />
                                </label>
                            </div>
                        ) : null}

                        {/* Paste Tab */}
                        {bulkImportTab === "paste" ? (
                            <div className="space-y-3">
                                <div className="text-xs text-zinc-400">
                                    Copy cells from Excel or Google Sheets (including the header row) and paste below:
                                </div>
                                <textarea
                                    value={bulkImportPasteText}
                                    onChange={(e) => setBulkImportPasteText(e.target.value)}
                                    placeholder={"Title\tSKU\tQuantity\tCategory\tCondition\tStatus\tPurchase Price\tEstimated Sale\tNotes\nMy Item\tSKU-001\t1\tClothes\tGood\tUNLISTED\t10.00\t20.00\tNotes here"}
                                    className="w-full h-40 rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20 font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={handleBulkImportPaste}
                                    className="h-10 rounded-xl bg-white/10 border border-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
                                >
                                    Parse Data
                                </button>
                            </div>
                        ) : null}

                        {/* Preview Table */}
                        {bulkImportItems.length > 0 ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-white">Preview ({bulkImportItems.length} items)</div>
                                    <button
                                        type="button"
                                        onClick={() => setBulkImportItems([])}
                                        className="text-xs text-zinc-400 hover:text-white"
                                    >
                                        Clear all
                                    </button>
                                </div>

                                <div className="max-h-[400px] overflow-auto rounded-xl border border-white/10">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white/5 sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">Title</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">SKU</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">Qty</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">Category</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">Condition</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">Status</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">Purchase</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300">Est. Sale</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/10">
                                            {bulkImportItems.map((item) => (
                                                <tr key={item.id} className={item.valid ? "bg-zinc-950" : "bg-red-500/10"}>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            value={item.title}
                                                            onChange={(e) => updateBulkImportItem(item.id, { title: e.target.value })}
                                                            className={[
                                                                "w-full min-w-[150px] rounded border bg-transparent px-2 py-1 text-sm text-white outline-none",
                                                                item.valid ? "border-white/10 focus:border-white/20" : "border-red-400/50",
                                                            ].join(" ")}
                                                            placeholder="Required"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            value={item.sku}
                                                            onChange={(e) => updateBulkImportItem(item.id, { sku: e.target.value })}
                                                            className="w-full min-w-[80px] rounded border border-white/10 bg-transparent px-2 py-1 text-sm text-white outline-none focus:border-white/20"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={item.quantity}
                                                            onChange={(e) => updateBulkImportItem(item.id, { quantity: e.target.value })}
                                                            className="w-16 rounded border border-white/10 bg-transparent px-2 py-1 text-sm text-white outline-none focus:border-white/20"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <select
                                                            value={item.category}
                                                            onChange={(e) => updateBulkImportItem(item.id, { category: e.target.value })}
                                                            className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white outline-none"
                                                        >
                                                            {CATEGORIES.map((c) => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <select
                                                            value={item.condition}
                                                            onChange={(e) => updateBulkImportItem(item.id, { condition: e.target.value })}
                                                            className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white outline-none"
                                                        >
                                                            {CONDITIONS.map((c) => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <select
                                                            value={item.status}
                                                            onChange={(e) => updateBulkImportItem(item.id, { status: e.target.value })}
                                                            className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white outline-none"
                                                        >
                                                            {STATUSES.map(([v, l]) => (
                                                                <option key={v} value={v}>{l}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={item.purchaseTotal}
                                                            onChange={(e) => updateBulkImportItem(item.id, { purchaseTotal: e.target.value })}
                                                            className="w-20 rounded border border-white/10 bg-transparent px-2 py-1 text-sm text-white outline-none focus:border-white/20"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={item.estimatedSale}
                                                            onChange={(e) => updateBulkImportItem(item.id, { estimatedSale: e.target.value })}
                                                            className="w-20 rounded border border-white/10 bg-transparent px-2 py-1 text-sm text-white outline-none focus:border-white/20"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeBulkImportItem(item.id)}
                                                            className="h-7 w-7 rounded-lg border border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15 flex items-center justify-center"
                                                            title="Remove"
                                                        >
                                                            <TrashIcon className="h-3.5 w-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {bulkImportItems.some((item) => !item.valid) ? (
                                    <div className="text-xs text-red-300">
                                        Items highlighted in red are missing a title and won&apos;t be imported.
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </Modal>
            ) : null}
        </div>
    )
}

function DetailPanel({ item, currencyView, rates }) {
    const c = compute(item)
    const toView = (minor) => fmt(currencyView, convertMinor(minor, c.itemCur, currencyView, rates).value)

    const profit = c.profitTotal == null ? null : convertMinor(c.profitTotal, c.itemCur, currencyView, rates).value
    const profitUnit = c.profitPerUnit == null ? null : convertMinor(c.profitPerUnit, c.itemCur, currencyView, rates).value
    const saleTotal = c.salePriceTotal == null ? null : convertMinor(c.salePriceTotal, c.itemCur, currencyView, rates).value

    const status = String(c.status || "").toUpperCase()
    const saleLabel = status === "LISTED" || status === "SOLD" ? "Listing price" : "Estimated sale"

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {/* Image display */}
            {c.meta.imageUrl ? (
                <div className="md:col-span-2 flex justify-center">
                    <div className="rounded-2xl border border-white/10 overflow-hidden bg-zinc-950/30 p-2">
                        <img
                            src={c.meta.imageUrl}
                            alt={item.name || "Item"}
                            className="max-h-48 rounded-xl object-contain"
                        />
                    </div>
                </div>
            ) : null}

            <Card title="Item">
                <Row label="Status" value={<Pill text={c.status} />} />
                <Row label="Category" value={c.meta.category || "—"} />
                <Row label="Condition" value={c.meta.condition || "—"} />
                <Row label="Quantity" value={c.q} />
                <Row label="SKU" value={item.sku ?? "—"} />
            </Card>

            <Card title={`Finance (${currencyView})`}>
                <Row label="Total purchase" value={toView(c.purchaseTotal)} />
                <Row label={`${saleLabel} total`} value={saleTotal == null ? "—" : fmt(currencyView, saleTotal)} />
                <Row
                    label="Profit total"
                    value={profit == null ? "—" : <span className={profit >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>{fmt(currencyView, profit)}</span>}
                />
                <Row
                    label="Profit / unit"
                    value={profitUnit == null ? "—" : <span className={profitUnit >= 0 ? "text-emerald-200 font-semibold" : "text-red-200 font-semibold"}>{fmt(currencyView, profitUnit)}</span>}
                />
            </Card>

            <Card title="Listing links" className="md:col-span-2">
                {(c.meta.listings || []).length === 0 ? (
                    <div className="text-sm text-zinc-300">No listing links / prices added.</div>
                ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                        {(c.meta.listings || []).map((l, idx) => {
                            const href = linkify(l.url)
                            return (
                                <div key={`${l.platform}-${idx}`} className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-semibold text-white">{String(l.platform || "OTHER").toUpperCase()}</div>
                                        <div className="text-xs text-zinc-300">{l.pricePence == null ? "No price" : `Price: ${toView(Number(l.pricePence) || 0)}`}</div>
                                    </div>
                                    {href ? (
                                        <a href={href} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-zinc-300 underline underline-offset-2 hover:text-white" title={href}>
                                            {href}
                                        </a>
                                    ) : (
                                        <div className="mt-2 text-xs text-zinc-400">No URL</div>
                                    )}
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