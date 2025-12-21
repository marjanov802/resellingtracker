// components/ProgramNavbar.jsx
"use client"

import { UserButton } from "@clerk/nextjs"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

export default function ProgramNavbar() {
    const pathname = usePathname()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const navItems = [
        { name: "Dashboard", href: "/program" },
        { name: "Inventory", href: "/program/inventory" },
        { name: "Sales", href: "/program/sales" },
        { name: "Analytics", href: "/program/analytics" },
        { name: "Tools", href: "/program/tools" },
    ]

    const isActive = (href) => {
        if (href === "/program") {
            return pathname === href
        }
        return pathname.startsWith(href)
    }

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo and brand */}
                    <div className="flex items-center gap-8">
                        <Link href="/program" className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                <span className="text-white font-bold text-sm">RT</span>
                            </div>
                            <span className="text-white font-semibold text-lg hidden sm:block">
                                ResellTracker
                            </span>
                        </Link>

                        {/* Desktop navigation */}
                        <div className="hidden md:flex items-center gap-1">
                            {navItems.map((item) => (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${isActive(item.href)
                                        ? "bg-white/10 text-white"
                                        : "text-white/70 hover:text-white hover:bg-white/5"
                                        }`}
                                >
                                    {item.name}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Right side - notifications and user menu */}
                    <div className="flex items-center gap-4">
                        {/* Notification bell */}
                        <button className="relative p-2 text-white/70 hover:text-white transition">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-pink-500"></span>
                        </button>

                        {/* User button with custom styling */}
                        <UserButton
                            afterSignOutUrl="/"
                            appearance={{
                                elements: {
                                    avatarBox: "h-8 w-8 ring-2 ring-white/20 hover:ring-white/40 transition",
                                    userButtonPopoverCard: "bg-black border border-white/10",
                                    userButtonPopoverText: "text-white",
                                    userButtonPopoverFooter: "hidden"
                                }
                            }}
                        />

                        {/* Mobile menu button */}
                        <button
                            className="md:hidden p-2 text-white/70 hover:text-white"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile menu */}
                {mobileMenuOpen && (
                    <div className="md:hidden py-2 border-t border-white/10">
                        {navItems.map((item) => (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${isActive(item.href)
                                    ? "bg-white/10 text-white"
                                    : "text-white/70 hover:text-white hover:bg-white/5"
                                    }`}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </nav>
    )
}