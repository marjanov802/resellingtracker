// app/program/page.js — FULL reseller-focused dashboard (uses ONLY existing real data)
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

/* ========================= Currency + helpers ========================= */

const CURRENCY_META = {
  GBP: { symbol: "£" },
  USD: { symbol: "$" },
  EUR: { symbol: "€" },
  CAD: { symbol: "$" },
  AUD: { symbol: "$" },
  JPY: { symbol: "¥" },
}

const fmt = (currency, minorUnits) => {
  const c = CURRENCY_META[currency] || CURRENCY_META.GBP
  const n = Number.isFinite(minorUnits) ? minorUnits : 0
  const sign = n < 0 ? "-" : ""
  return `${sign}${c.symbol}${(Math.abs(n) / 100).toFixed(2)}`
}

// FX rates are "units per USD"
const convertMinor = (minor, fromCur, toCur, rates) => {
  const m = Number.isFinite(minor) ? minor : 0
  if (!rates || fromCur === toCur) return m
  if (!rates[fromCur] || !rates[toCur]) return m
  const usd = m / 100 / rates[fromCur]
  return Math.round(usd * rates[toCur] * 100)
}

/* ============================ Date helpers ============================ */

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const endOfDay = (d) => {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

const getRangeBounds = (range) => {
  const now = new Date()

  if (range === "today") {
    return { from: startOfDay(now), to: endOfDay(now) }
  }

  if (range === "week") {
    const d = new Date(now)
    const day = d.getDay() || 7 // Monday start
    d.setDate(d.getDate() - day + 1)
    return { from: startOfDay(d), to: endOfDay(now) }
  }

  if (range === "month") {
    return {
      from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: endOfDay(now),
    }
  }

  return {
    from: startOfDay(new Date(now.getFullYear(), 0, 1)),
    to: endOfDay(now),
  }
}

/* ============================ UI helpers ============================== */

function StatCard({ label, value, sub, className }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 ${className}`}>
      <p className="text-sm text-white/60">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/40">{sub}</p>
    </div>
  )
}

/* ============================== Page ================================= */

export default function ProgramDashboard() {
  const [items, setItems] = useState([])
  const [sales, setSales] = useState([])
  const [range, setRange] = useState("week")
  const [currencyView, setCurrencyView] = useState("GBP")
  const [fxRates, setFxRates] = useState(null)
  const [loading, setLoading] = useState(true)

  /* ----------------------------- Load data ----------------------------- */

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const [itemsRes, salesRes, fxRes] = await Promise.all([
        fetch("/api/items"),
        fetch("/api/sales"),
        fetch("/api/fx?base=USD"),
      ])

      const itemsData = await itemsRes.json().catch(() => [])
      const salesData = await salesRes.json().catch(() => [])
      const fxData = await fxRes.json().catch(() => null)

      setItems(Array.isArray(itemsData) ? itemsData : [])
      setSales(Array.isArray(salesData) ? salesData : [])
      setFxRates(fxData?.rates || null)

      setLoading(false)
    }

    load()
  }, [])

  /* ----------------------------- Ranges ------------------------------- */

  const { from, to } = useMemo(() => getRangeBounds(range), [range])

  /* ----------------------------- Sales -------------------------------- */

  const salesInRange = useMemo(() => {
    const fromMs = from.getTime()
    const toMs = to.getTime()

    return sales.filter((s) => {
      if (!s.soldAt) return false
      const t = new Date(s.soldAt).getTime()
      return t >= fromMs && t <= toMs
    })
  }, [sales, from, to])

  /* ----------------------------- KPIs --------------------------------- */

  const stats = useMemo(() => {
    let revenue = 0
    let profit = 0
    let soldCount = 0

    for (const s of salesInRange) {
      const cur = (s.currency || "GBP").toUpperCase()
      const qty = Number(s.quantitySold || 0)
      const net =
        s.netPence != null
          ? Number(s.netPence) || 0
          : qty * Number(s.salePricePerUnitPence || 0) - Number(s.feesPence || 0)

      const cost =
        s.costTotalPence != null
          ? Number(s.costTotalPence) || 0
          : (Number(s.costPerUnitPence || 0) || 0) * qty

      revenue += convertMinor(net, cur, currencyView, fxRates)
      profit += convertMinor(net - cost, cur, currencyView, fxRates)
      soldCount++
    }

    let inventoryValue = 0
    let activeListings = 0
    let lowStockCount = 0

    for (const i of items) {
      const q = Number(i.quantity || 0)
      if (q <= 0) continue

      const cur = (i.currency || "GBP").toUpperCase()
      const unitCost = Number(i.purchaseSubtotalPence || i.costPence || 0)
      inventoryValue += convertMinor(unitCost * q, cur, currencyView, fxRates)

      if ((i.status || "").toUpperCase() === "LISTED") activeListings++
      if (q <= 2) lowStockCount++
    }

    const roi = revenue > 0 ? (profit / revenue) * 100 : 0
    const velocity = inventoryValue > 0 ? revenue / inventoryValue : 0

    return {
      revenue,
      profit,
      roi,
      soldCount,
      inventoryValue,
      activeListings,
      lowStockCount,
      velocity,
    }
  }, [salesInRange, items, currencyView, fxRates])

  /* ------------------------- Top performers --------------------------- */

  const topItems = useMemo(() => {
    const map = {}

    for (const s of salesInRange) {
      const name = s.itemName || s.item?.name || "Unknown"
      if (!map[name]) map[name] = { profit: 0, units: 0 }

      const cur = (s.currency || "GBP").toUpperCase()
      const qty = Number(s.quantitySold || 0)
      const net = Number(s.netPence || 0)
      const cost = Number(s.costTotalPence || 0)

      map[name].profit += convertMinor(net - cost, cur, currencyView, fxRates)
      map[name].units += qty
    }

    return Object.entries(map)
      .sort((a, b) => b[1].profit - a[1].profit)
      .slice(0, 5)
  }, [salesInRange, currencyView, fxRates])

  /* ---------------------------- Dead stock ---------------------------- */

  const deadStock = useMemo(() => {
    const soldIds = new Set(sales.map((s) => s.itemId))
    return items.filter((i) => Number(i.quantity || 0) > 0 && !soldIds.has(i.id)).slice(0, 5)
  }, [items, sales])

  /* ------------------------------ Render ------------------------------ */

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>

          <select
            value={currencyView}
            onChange={(e) => setCurrencyView(e.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
          >
            {Object.keys(CURRENCY_META).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6 flex gap-2">
          {["today", "week", "month", "year"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-4 py-2 text-sm ${r === range ? "bg-white text-black" : "bg-white/5 text-white/70"
                }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <StatCard
            label="Profit"
            value={loading ? "—" : fmt(currencyView, stats.profit)}
            sub={`${stats.roi.toFixed(1)}% ROI`}
            className="bg-emerald-500/10 border-emerald-500/20"
          />

          <StatCard
            label="Revenue"
            value={loading ? "—" : fmt(currencyView, stats.revenue)}
            sub={`${stats.soldCount} sales`}
            className="bg-blue-500/10 border-blue-500/20"
          />

          <StatCard
            label="Inventory Value"
            value={loading ? "—" : fmt(currencyView, stats.inventoryValue)}
            sub={`Velocity ${(stats.velocity * 100).toFixed(1)}%`}
            className="bg-orange-500/10 border-orange-500/20"
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 font-semibold">Top Performing Items</h2>
            <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/10">
              {topItems.length === 0 ? (
                <p className="p-4 text-sm text-white/40">No sales in this period</p>
              ) : (
                topItems.map(([name, v]) => (
                  <div key={name} className="flex justify-between p-4">
                    <span className="truncate">{name}</span>
                    <span className="text-emerald-300">
                      {fmt(currencyView, v.profit)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-3 font-semibold">Dead Stock</h2>
            <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/10">
              {deadStock.length === 0 ? (
                <p className="p-4 text-sm text-white/40">No dead stock 🎉</p>
              ) : (
                deadStock.map((i) => (
                  <div key={i.id} className="flex justify-between p-4">
                    <span className="truncate">{i.name}</span>
                    <span className="text-orange-300">{i.quantity} units</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
