// FILE: app/program/inventory/page.js
"use client"

import { useEffect, useMemo, useState } from "react"

const moneyPenceToGBP = (pence) => {
    const n = Number.isFinite(pence) ? pence : 0
    return `£${(n / 100).toFixed(2)}`
}

export default function InventoryPage() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")
    const [ok, setOk] = useState("")
    const [form, setForm] = useState({
        name: "",
        sku: "",
        quantity: 1,
        costPence: 0,
        notes: "",
    })

    const totals = useMemo(() => {
        const totalQty = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0)
        const totalCostPence = items.reduce(
            (a, it) => a + (Number(it.costPence) || 0) * (Number(it.quantity) || 0),
            0
        )
        return { totalQty, totalCostPence }
    }, [items])

    const loadItems = async () => {
        setLoading(true)
        setError("")
        setOk("")
        try {
            const res = await fetch("/api/items", { cache: "no-store" })
            const data = await res.json().catch(() => null)

            if (!res.ok) {
                const msg = data?.error || `Failed to load items (${res.status})`
                throw new Error(msg)
            }

            setItems(Array.isArray(data) ? data : [])
            setOk("Loaded.")
        } catch (e) {
            setError(e?.message || "Failed to load items")
            setItems([])
        } finally {
            setLoading(false)
            setTimeout(() => setOk(""), 1500)
        }
    }

    useEffect(() => {
        loadItems()
    }, [])

    const onChange = (key) => (e) => {
        const value = e.target.value
        setForm((prev) => {
            if (key === "quantity") return { ...prev, quantity: value === "" ? "" : Number(value) }
            if (key === "costPence") return { ...prev, costPence: value === "" ? "" : Number(value) }
            return { ...prev, [key]: value }
        })
    }

    const createItem = async (e) => {
        e.preventDefault()
        setSubmitting(true)
        setError("")
        setOk("")

        try {
            const payload = {
                name: String(form.name || "").trim(),
                sku: String(form.sku || "").trim() || null,
                quantity: Number.isFinite(Number(form.quantity)) ? Math.max(0, Math.trunc(Number(form.quantity))) : 0,
                costPence: Number.isFinite(Number(form.costPence)) ? Math.max(0, Math.trunc(Number(form.costPence))) : 0,
                notes: String(form.notes || "").trim() || null,
            }

            if (!payload.name) throw new Error("Name is required")

            const res = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await res.json().catch(() => null)

            if (!res.ok) {
                const msg = data?.error || `Failed to create item (${res.status})`
                throw new Error(msg)
            }

            setForm({ name: "", sku: "", quantity: 1, costPence: 0, notes: "" })
            setOk("Created.")
            await loadItems()
        } catch (e2) {
            setError(e2?.message || "Failed to create item")
        } finally {
            setSubmitting(false)
            setTimeout(() => setOk(""), 1500)
        }
    }

    const deleteItem = async (id) => {
        setError("")
        setOk("")
        const prev = items
        setItems((x) => x.filter((it) => it.id !== id))

        try {
            const res = await fetch(`/api/items/${id}`, { method: "DELETE" })
            const data = await res.json().catch(() => null)

            if (!res.ok) {
                const msg = data?.error || `Failed to delete (${res.status})`
                throw new Error(msg)
            }
            setOk("Deleted.")
        } catch (e) {
            setItems(prev)
            setError(e?.message || "Failed to delete item")
        } finally {
            setTimeout(() => setOk(""), 1500)
        }
    }

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-50">
            <div className="mx-auto w-full max-w-6xl px-4 py-8">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
                        <p className="mt-1 text-sm text-zinc-300">
                            Items are scoped to the signed-in user.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={loadItems}
                            className="h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/15"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {(error || ok) && (
                    <div className="mb-5 grid gap-2">
                        {error ? (
                            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                {error}
                            </div>
                        ) : null}
                        {ok ? (
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                                {ok}
                            </div>
                        ) : null}
                    </div>
                )}

                <div className="mb-6 grid gap-4 md:grid-cols-3">
                    <StatCard label="Total SKUs" value={items.length} sub={loading ? "Loading…" : "Live from DB"} />
                    <StatCard label="Total quantity" value={totals.totalQty} sub="Sum of all quantities" />
                    <StatCard label="Total cost" value={moneyPenceToGBP(totals.totalCostPence)} sub="Cost × quantity" />
                </div>

                <div className="grid gap-6 lg:grid-cols-5">
                    <div className="lg:col-span-2">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-semibold text-white">Add item</div>
                                    <div className="text-xs text-zinc-300">Fast entry — pence avoids float issues</div>
                                </div>
                            </div>

                            <form onSubmit={createItem} className="space-y-3">
                                <Field label="Name">
                                    <input
                                        value={form.name}
                                        onChange={onChange("name")}
                                        placeholder="e.g. Nike Tech Fleece"
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white placeholder:text-zinc-400 outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10"
                                    />
                                </Field>

                                <Field label="SKU (optional)">
                                    <input
                                        value={form.sku}
                                        onChange={onChange("sku")}
                                        placeholder="e.g. SKU-001"
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white placeholder:text-zinc-400 outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10"
                                    />
                                </Field>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Quantity">
                                        <input
                                            type="number"
                                            min={0}
                                            value={form.quantity}
                                            onChange={onChange("quantity")}
                                            className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10"
                                        />
                                    </Field>

                                    <Field label="Cost (pence)">
                                        <input
                                            type="number"
                                            min={0}
                                            value={form.costPence}
                                            onChange={onChange("costPence")}
                                            className="h-11 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10"
                                        />
                                        <div className="mt-1 text-[11px] text-zinc-300">
                                            Preview: <span className="font-semibold text-white">{moneyPenceToGBP(Number(form.costPence) || 0)}</span>
                                        </div>
                                    </Field>
                                </div>

                                <Field label="Notes (optional)">
                                    <textarea
                                        value={form.notes}
                                        onChange={onChange("notes")}
                                        placeholder="Condition, size, supplier, etc."
                                        className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-zinc-400 outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10"
                                    />
                                </Field>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="h-11 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {submitting ? "Adding…" : "Add item"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setForm({ name: "", sku: "", quantity: 1, costPence: 0, notes: "" })}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-transparent px-4 text-sm font-semibold text-white/90 transition hover:bg-white/5"
                                >
                                    Clear
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="lg:col-span-3">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-semibold text-white">Your items</div>
                                    <div className="text-xs text-zinc-300">
                                        {loading ? "Loading…" : `${items.length} item(s)`}
                                    </div>
                                </div>

                                <div className="text-xs text-zinc-300">
                                    <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                                        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                                        API: /api/items
                                    </span>
                                </div>
                            </div>

                            <div className="overflow-x-auto rounded-2xl border border-white/10">
                                <table className="w-full min-w-[760px] text-left text-sm">
                                    <thead className="bg-white/5 text-xs text-zinc-200">
                                        <tr>
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">SKU</th>
                                            <th className="px-4 py-3">Qty</th>
                                            <th className="px-4 py-3">Cost</th>
                                            <th className="px-4 py-3">Notes</th>
                                            <th className="px-4 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-white/10">
                                        {!loading && items.length === 0 ? (
                                            <tr>
                                                <td className="px-4 py-6 text-zinc-300" colSpan={6}>
                                                    No items yet — add your first item.
                                                </td>
                                            </tr>
                                        ) : null}

                                        {items.map((it, idx) => (
                                            <tr key={it.id} className={idx % 2 === 0 ? "bg-zinc-950/30" : "bg-zinc-950/10"}>
                                                <td className="px-4 py-3 font-semibold text-white">{it.name}</td>
                                                <td className="px-4 py-3 text-zinc-200">{it.sku ?? "—"}</td>
                                                <td className="px-4 py-3 text-zinc-200">{it.quantity}</td>
                                                <td className="px-4 py-3 text-zinc-200">{moneyPenceToGBP(it.costPence)}</td>
                                                <td className="px-4 py-3 max-w-[280px] truncate text-zinc-300">
                                                    {it.notes ?? "—"}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => deleteItem(it.id)}
                                                        className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/30 p-4 text-xs text-zinc-300">
                                <div className="font-semibold text-white">Tests</div>
                                <pre className="mt-2 whitespace-pre-wrap leading-relaxed text-zinc-200">{`// 1) GET (logged in): should return array
fetch("/api/items").then(r=>r.json()).then(console.log)

// 2) POST (logged in): should return 201 with userId
fetch("/api/items",{
  method:"POST",
  headers:{ "Content-Type":"application/json" },
  body: JSON.stringify({ name:"UI Test", sku:"UI-001", quantity:1, costPence:999, notes:"created from UI" })
}).then(async r=>({status:r.status, body: await r.json()})).then(console.log)

// 3) DELETE (logged in): pick an id from GET, should return {ok:true}
fetch("/api/items").then(r=>r.json()).then(items=>{
  const id = items?.[0]?.id
  if(!id) return console.log("no items to delete")
  return fetch("/api/items/"+id,{method:"DELETE"}).then(async r=>({status:r.status, body: await r.json()})).then(console.log)
})

// 4) Logged out test: sign out in UI then open /api/items -> 401
// 5) Multi-user test: sign in as another account -> /api/items should be empty (different userId)`}</pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
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

function Field({ label, children }) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-200">{label}</label>
            {children}
        </div>
    )
}
