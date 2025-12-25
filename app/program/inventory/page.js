// FILE: app/program/inventory/page.js
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

const CATEGORIES = [
    ["CLOTHING", "Clothing"],
    ["SHOES", "Shoes"],
    ["TECH", "Tech"],
    ["COLLECTIBLES", "Collectibles"],
    ["TRADING_CARDS", "Trading cards"],
    ["WATCHES", "Watches"],
    ["BAGS", "Bags"],
    ["HOME", "Home"],
    ["BOOKS", "Books"],
    ["TOYS", "Toys"],
    ["BEAUTY", "Beauty"],
    ["OTHER", "Other"],
]

const CONDITIONS = [
    ["NEW", "New"],
    ["LIKE_NEW", "Like new"],
    ["GOOD", "Good"],
    ["FAIR", "Fair"],
    ["POOR", "Poor"],
]

const fmt = (currency, minorUnits) => {
    const c = CURRENCY_META[currency] || CURRENCY_META.GBP
    const n = Number.isFinite(minorUnits) ? minorUnits : 0
    return `${c.symbol}${(n / 100).toFixed(2)}`
}

const clampInt0 = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

// rates map is "units per USD" from open.er-api.com
const convertMinor = (minor, fromCur, toCur, rates) => {
    const m = Number.isFinite(minor) ? minor : 0
    const f = (fromCur || "GBP").toUpperCase()
    const t = (toCur || "GBP").toUpperCase()

    if (!rates || !rates[f] || !rates[t]) {
        return { value: m, ok: f === t }
    }

    if (f === t) return { value: m, ok: true }

    // amountUSD = amount / rate[from] because rate[from] = fromUnits per USD
    const amountUSD = (m / 100) / rates[f]
    const amountTo = amountUSD * rates[t]

    return { value: Math.round(amountTo * 100), ok: true }
}

export default function InventoryPage() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)

    const [toast, setToast] = useState({ type: "", msg: "" })

    // This is a "view currency" that converts ALL displayed money values.
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

    const [selected, setSelected] = useState(() => new Set())

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const [form, setForm] = useState({
        name: "",
        sku: "",
        quantity: 1,
        currency: "GBP",
        purchasePence: 0,
        expectedBestPence: "",
        expectedWorstPence: "",
        condition: "GOOD",
        category: "OTHER",
        notes: "",
    })

    const showToast = (type, msg) => {
        setToast({ type, msg })
        window.clearTimeout(showToast._t)
        showToast._t = window.setTimeout(() => setToast({ type: "", msg: "" }), 1600)
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

    const totals = useMemo(() => {
        const count = items.length
        const qty = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0)

        let invested = 0
        let bestProfit = 0
        let worstProfit = 0

        for (const it of items) {
            const itemCur = (it.currency || "GBP").toUpperCase()
            const q = Number(it.quantity) || 0
            const purchase = Number(it.purchasePence) || 0
            const best = it.expectedBestPence === null || it.expectedBestPence === undefined ? null : Number(it.expectedBestPence)
            const worst = it.expectedWorstPence === null || it.expectedWorstPence === undefined ? null : Number(it.expectedWorstPence)

            const investedItem = purchase * q
            invested += convertMinor(investedItem, itemCur, currencyView, fx.rates).value

            if (best !== null) {
                const p = (best - purchase) * q
                bestProfit += convertMinor(p, itemCur, currencyView, fx.rates).value
            }
            if (worst !== null) {
                const p = (worst - purchase) * q
                worstProfit += convertMinor(p, itemCur, currencyView, fx.rates).value
            }
        }

        return { count, qty, invested, bestProfit, worstProfit }
    }, [items, currencyView, fx.rates])

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

    const onFormChange = (key) => (e) => {
        const v = e.target.value
        setForm((p) => ({ ...p, [key]: v }))
    }

    const submitCreate = async (e) => {
        e.preventDefault()
        setSubmitting(true)

        try {
            const payload = {
                name: String(form.name || "").trim(),
                sku: String(form.sku || "").trim() || null,
                quantity: Math.max(0, Math.trunc(Number(form.quantity) || 0)),
                currency: String(form.currency || "GBP").toUpperCase(),
                purchasePence: Math.max(0, Math.trunc(Number(form.purchasePence) || 0)),
                expectedBestPence: form.expectedBestPence === "" ? null : clampInt0(form.expectedBestPence),
                expectedWorstPence: form.expectedWorstPence === "" ? null : clampInt0(form.expectedWorstPence),
                condition: String(form.condition || "GOOD").toUpperCase(),
                category: String(form.category || "OTHER").toUpperCase(),
                notes: String(form.notes || "").trim() || null,
            }

            if (!payload.name) throw new Error("Name is required")

            const res = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`)

            showToast("ok", "Created")
            setIsModalOpen(false)
            setForm({
                name: "",
                sku: "",
                quantity: 1,
                currency: currencyView,
                purchasePence: 0,
                expectedBestPence: "",
                expectedWorstPence: "",
                condition: "GOOD",
                category: "OTHER",
                notes: "",
            })
            await loadItems()
        } catch (e2) {
            showToast("error", e2?.message || "Create failed")
        } finally {
            setSubmitting(false)
        }
    }

    const selectedCount = selected.size
    const allSelected = items.length > 0 && selectedCount === items.length

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-50">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
                        <p className="mt-1 text-sm text-zinc-300">
                            All money values are converted into your selected display currency.
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
                                {fx.loading ? "FX…" : "FX refresh"}
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={loadItems}
                            className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            Refresh
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setForm((p) => ({ ...p, currency: currencyView }))
                                setIsModalOpen(true)
                            }}
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

                {fx.error ? (
                    <div className="mb-5">
                        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                            FX unavailable: {fx.error}. Showing original currency values where conversion is not possible.
                        </div>
                    </div>
                ) : null}

                <div className="mb-6 grid gap-4 md:grid-cols-4">
                    <StatCard label="Items" value={totals.count} sub={loading ? "Loading…" : "Live"} />
                    <StatCard label="Quantity" value={totals.qty} sub="Total units" />
                    <StatCard
                        label={`Invested (${currencyView})`}
                        value={fmt(currencyView, totals.invested)}
                        sub="Purchase × qty (converted)"
                    />
                    <StatCard
                        label={`Profit range (${currencyView})`}
                        value={`${fmt(currencyView, totals.worstProfit)} → ${fmt(currencyView, totals.bestProfit)}`}
                        sub="Worst → best (converted)"
                    />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Your items</div>
                            <div className="text-xs text-zinc-300">{loading ? "Loading…" : `${items.length} item(s)`}</div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => (allSelected ? clearSelection() : selectAll())}
                                className="h-10 rounded-2xl border border-white/10 bg-transparent px-4 text-sm font-semibold text-white/90 transition hover:bg-white/5"
                            >
                                {allSelected ? "Clear all" : "Select all"}
                            </button>

                            <button
                                type="button"
                                onClick={bulkDelete}
                                disabled={selectedCount === 0}
                                className="h-10 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Bulk delete ({selectedCount})
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                        <table className="w-full min-w-[1300px] text-left text-sm">
                            <thead className="bg-white/5 text-xs text-zinc-200">
                                <tr>
                                    <th className="w-[44px] px-4 py-3">
                                        <span className="sr-only">Select</span>
                                    </th>
                                    <th className="px-4 py-3">Title</th>
                                    <th className="px-4 py-3">SKU</th>
                                    <th className="px-4 py-3">Category</th>
                                    <th className="px-4 py-3">Condition</th>
                                    <th className="px-4 py-3">Qty</th>
                                    <th className="px-4 py-3">{`Purchase (${currencyView})`}</th>
                                    <th className="px-4 py-3">{`Expected sale (${currencyView})`}</th>
                                    <th className="px-4 py-3">{`Profit (range) (${currencyView})`}</th>
                                    <th className="px-4 py-3 text-right">Original</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-white/10">
                                {!loading && items.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-6 text-zinc-300" colSpan={10}>
                                            No items yet — click “Add item”.
                                        </td>
                                    </tr>
                                ) : null}

                                {items.map((it, idx) => {
                                    const rowBg = idx % 2 === 0 ? "bg-zinc-950/30" : "bg-zinc-950/10"

                                    const itemCur = (it.currency || "GBP").toUpperCase()
                                    const q = Number(it.quantity) || 0
                                    const purchase = Number(it.purchasePence) || 0
                                    const best =
                                        it.expectedBestPence === null || it.expectedBestPence === undefined
                                            ? null
                                            : Number(it.expectedBestPence)
                                    const worst =
                                        it.expectedWorstPence === null || it.expectedWorstPence === undefined
                                            ? null
                                            : Number(it.expectedWorstPence)

                                    const purchaseView = convertMinor(purchase, itemCur, currencyView, fx.rates).value
                                    const bestView = best === null ? null : convertMinor(best, itemCur, currencyView, fx.rates).value
                                    const worstView = worst === null ? null : convertMinor(worst, itemCur, currencyView, fx.rates).value

                                    const profitBest = best === null ? null : convertMinor((best - purchase) * q, itemCur, currencyView, fx.rates).value
                                    const profitWorst = worst === null ? null : convertMinor((worst - purchase) * q, itemCur, currencyView, fx.rates).value

                                    return (
                                        <tr key={it.id} className={rowBg}>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(it.id)}
                                                    onChange={() => toggleSelect(it.id)}
                                                    className="h-4 w-4 rounded border-white/20 bg-transparent accent-white"
                                                />
                                            </td>

                                            <td className="px-4 py-3 font-semibold text-white">{it.name}</td>
                                            <td className="px-4 py-3 text-zinc-200">{it.sku ?? "—"}</td>
                                            <td className="px-4 py-3 text-zinc-200">{it.category}</td>
                                            <td className="px-4 py-3 text-zinc-200">{it.condition}</td>
                                            <td className="px-4 py-3 text-zinc-200">{q}</td>

                                            <td className="px-4 py-3 text-zinc-200">
                                                {fmt(currencyView, purchaseView)}
                                            </td>

                                            <td className="px-4 py-3 text-zinc-200">
                                                {worstView === null && bestView === null
                                                    ? "—"
                                                    : `${worstView === null ? "—" : fmt(currencyView, worstView)} → ${bestView === null ? "—" : fmt(currencyView, bestView)
                                                    }`}
                                            </td>

                                            <td className="px-4 py-3 text-zinc-200">
                                                {profitWorst === null && profitBest === null
                                                    ? "—"
                                                    : `${profitWorst === null ? "—" : fmt(currencyView, profitWorst)} → ${profitBest === null ? "—" : fmt(currencyView, profitBest)
                                                    }`}
                                            </td>

                                            <td className="px-4 py-3 text-right">
                                                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                                                    {itemCur}
                                                    <span className="text-zinc-400">•</span>
                                                    <span className="text-zinc-200">{fmt(itemCur, purchase)}</span>
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
                        <div>
                            {fx.nextUpdateUtc ? `FX next update: ${fx.nextUpdateUtc}` : "FX next update: —"}
                        </div>

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

            {isModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
                    <button aria-label="Close" onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/70" />
                    <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <div className="text-lg font-semibold text-white">Add item</div>
                                <div className="text-xs text-zinc-300">Prices are per unit (minor units).</div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                            >
                                Close
                            </button>
                        </div>

                        <form onSubmit={submitCreate} className="grid gap-3 md:grid-cols-2">
                            <Field label="Title">
                                <input
                                    value={form.name}
                                    onChange={onFormChange("name")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/25"
                                    placeholder="e.g. Air Max 95"
                                />
                            </Field>

                            <Field label="SKU (optional)">
                                <input
                                    value={form.sku}
                                    onChange={onFormChange("sku")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/25"
                                    placeholder="e.g. AM95-BLK-01"
                                />
                            </Field>

                            <Field label="Category">
                                <select
                                    value={form.category}
                                    onChange={onFormChange("category")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                                >
                                    {CATEGORIES.map(([v, label]) => (
                                        <option key={v} value={v}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Condition">
                                <select
                                    value={form.condition}
                                    onChange={onFormChange("condition")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                                >
                                    {CONDITIONS.map(([v, label]) => (
                                        <option key={v} value={v}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Quantity">
                                <input
                                    type="number"
                                    min={0}
                                    value={form.quantity}
                                    onChange={onFormChange("quantity")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                                />
                            </Field>

                            <Field label="Original currency">
                                <select
                                    value={form.currency}
                                    onChange={onFormChange("currency")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                                >
                                    {Object.keys(CURRENCY_META).map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Purchase price (minor units)">
                                <input
                                    type="number"
                                    min={0}
                                    value={form.purchasePence}
                                    onChange={onFormChange("purchasePence")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                                />
                            </Field>

                            <Field label="Expected sale (best) (minor units)">
                                <input
                                    type="number"
                                    min={0}
                                    value={form.expectedBestPence}
                                    onChange={onFormChange("expectedBestPence")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                                />
                            </Field>

                            <Field label="Expected sale (worst) (minor units)">
                                <input
                                    type="number"
                                    min={0}
                                    value={form.expectedWorstPence}
                                    onChange={onFormChange("expectedWorstPence")}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none"
                                />
                            </Field>

                            <Field label="Notes (optional)" className="md:col-span-2">
                                <textarea
                                    value={form.notes}
                                    onChange={onFormChange("notes")}
                                    className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none"
                                    placeholder="Size, colour, supplier, defects, etc."
                                />
                            </Field>

                            <div className="md:col-span-2 mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="h-11 rounded-2xl border border-white/10 bg-transparent px-5 text-sm font-semibold text-white/90 hover:bg-white/5"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-60"
                                >
                                    {submitting ? "Saving…" : "Save item"}
                                </button>
                            </div>

                            <div className="md:col-span-2 mt-1 text-xs text-zinc-300">
                                Preview (original): purchase {fmt(form.currency, Number(form.purchasePence) || 0)} • best{" "}
                                {form.expectedBestPence === "" ? "—" : fmt(form.currency, Number(form.expectedBestPence) || 0)} • worst{" "}
                                {form.expectedWorstPence === "" ? "—" : fmt(form.currency, Number(form.expectedWorstPence) || 0)}
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
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

function Field({ label, children, className = "" }) {
    return (
        <div className={["space-y-1", className].join(" ")}>
            <label className="text-xs font-semibold text-zinc-200">{label}</label>
            {children}
        </div>
    )
}
