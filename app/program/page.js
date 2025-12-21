// app/program/page.js - Resellers Dashboard
"use client"

import { useState } from "react"
import Link from "next/link"

export default function ProgramDashboard() {
    const [timeRange, setTimeRange] = useState("week")

    // Mock data - would come from your database
    const stats = {
        totalRevenue: 12847.32,
        totalProfit: 4253.18,
        activeListings: 47,
        soldThisMonth: 23,
        inventoryValue: 8432.50,
        roi: 33.1
    }

    const recentSales = [
        { id: 1, item: "Nike Air Jordan 1 Retro", soldPrice: 280, profit: 85, date: "2 hours ago", platform: "StockX" },
        { id: 2, item: "PS5 Console", soldPrice: 549, profit: 49, date: "5 hours ago", platform: "eBay" },
        { id: 3, item: "Yeezy Boost 350 V2", soldPrice: 320, profit: 110, date: "1 day ago", platform: "GOAT" },
        { id: 4, item: "iPhone 14 Pro", soldPrice: 1099, profit: 150, date: "2 days ago", platform: "Facebook" },
    ]

    const lowStock = [
        { id: 1, item: "Supreme Box Logo Tee", quantity: 1, value: 450 },
        { id: 2, item: "Nintendo Switch OLED", quantity: 2, value: 349 },
        { id: 3, item: "Travis Scott Jordan 1", quantity: 1, value: 1800 },
    ]

    const quickActions = [
        { name: "Add Item", icon: "➕", href: "/program/inventory/add", color: "from-blue-500 to-cyan-500" },
        { name: "Record Sale", icon: "💰", href: "/program/sales/new", color: "from-green-500 to-emerald-500" },
        { name: "Scan Receipt", icon: "📷", href: "/program/tools/scanner", color: "from-purple-500 to-pink-500" },
        { name: "Price Check", icon: "🏷️", href: "/program/tools/price-check", color: "from-orange-500 to-red-500" },
    ]

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
                {/* Welcome Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome back! 👋</h1>
                    <p className="text-white/60">Here's your reselling business at a glance</p>
                </div>

                {/* Time Range Selector */}
                <div className="mb-6 flex gap-2">
                    {["today", "week", "month", "year"].map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${timeRange === range
                                ? "bg-white text-black"
                                : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                }`}
                        >
                            {range.charAt(0).toUpperCase() + range.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-green-400 text-sm font-medium">Total Revenue</p>
                            <span className="text-green-400 text-xs bg-green-500/20 px-2 py-1 rounded-full">+12.5%</span>
                        </div>
                        <p className="text-3xl font-bold text-white">${stats.totalRevenue.toLocaleString()}</p>
                        <p className="text-white/40 text-sm mt-1">This {timeRange}</p>
                    </div>

                    <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-blue-400 text-sm font-medium">Total Profit</p>
                            <span className="text-blue-400 text-xs bg-blue-500/20 px-2 py-1 rounded-full">+8.3%</span>
                        </div>
                        <p className="text-3xl font-bold text-white">${stats.totalProfit.toLocaleString()}</p>
                        <p className="text-white/40 text-sm mt-1">{stats.roi}% ROI</p>
                    </div>

                    <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-purple-400 text-sm font-medium">Active Listings</p>
                            <span className="text-purple-400 text-xs bg-purple-500/20 px-2 py-1 rounded-full">{stats.activeListings}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">${stats.inventoryValue.toLocaleString()}</p>
                        <p className="text-white/40 text-sm mt-1">Inventory value</p>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {quickActions.map((action) => (
                            <Link
                                key={action.name}
                                href={action.href}
                                className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition group"
                            >
                                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center mb-3 group-hover:scale-110 transition`}>
                                    <span className="text-xl">{action.icon}</span>
                                </div>
                                <p className="text-white font-medium">{action.name}</p>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                    {/* Recent Sales */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Recent Sales</h2>
                            <Link href="/program/sales" className="text-sm text-white/60 hover:text-white transition">
                                View all →
                            </Link>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            <div className="divide-y divide-white/10">
                                {recentSales.map((sale) => (
                                    <div key={sale.id} className="p-4 hover:bg-white/5 transition">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <p className="text-white font-medium">{sale.item}</p>
                                                <p className="text-white/40 text-sm">{sale.platform} • {sale.date}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-white font-semibold">${sale.soldPrice}</p>
                                                <p className="text-green-400 text-sm">+${sale.profit}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Low Stock Alert */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Low Stock Alert</h2>
                            <Link href="/program/inventory" className="text-sm text-white/60 hover:text-white transition">
                                Manage →
                            </Link>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            <div className="divide-y divide-white/10">
                                {lowStock.map((item) => (
                                    <div key={item.id} className="p-4 hover:bg-white/5 transition">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-white font-medium">{item.item}</p>
                                                <p className="text-orange-400 text-sm">Only {item.quantity} left</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-white/60 text-sm">${item.value}/unit</p>
                                                <button className="text-xs text-white/40 hover:text-white transition">
                                                    Restock →
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Performance Chart Placeholder */}
                <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Performance Overview</h2>
                    <div className="h-64 flex items-center justify-center text-white/40">
                        <div className="text-center">
                            <div className="mb-3 text-4xl">📊</div>
                            <p>Chart visualization will appear here</p>
                            <p className="text-sm mt-2">Connect your data source to see trends</p>
                        </div>
                    </div>
                </div>

                {/* Tips Section */}
                <div className="mt-8 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6">
                    <h3 className="text-white font-semibold mb-2">💡 Pro Tip</h3>
                    <p className="text-white/70">
                        Track your cost basis accurately to get real profit margins. Use the receipt scanner to quickly add purchases!
                    </p>
                </div>
            </div>
        </div>
    )
}