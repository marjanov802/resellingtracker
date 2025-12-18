// components/Navbar.jsx
"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

const cx = (...c) => c.filter(Boolean).join(" ")

function Wordmark() {
    return (
        <span className="select-none leading-none">
            <span className="text-white tracking-tight">
                <span className="font-semibold">Resell</span>
                <span className="ml-0.5 bg-clip-text text-transparent bg-gradient-to-r from-blue-300 via-purple-300 to-white font-extrabold">
                    Tracker
                </span>
            </span>
            <span className="hidden sm:block text-[11px] text-white/60 mt-1">
                Inventory and profit analytics
            </span>
        </span>
    )
}

export default function Navbar() {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false)
    const [activeHash, setActiveHash] = useState("#home")

    const items = useMemo(
        () => [
            { label: "Home", href: "#home" },
            { label: "Features", href: "#features" },
            { label: "How it works", href: "#how" },
            { label: "Pricing", href: "#pricing" },
            { label: "FAQs", href: "#faqs" },
            { label: "Contact", href: "#contact" },
        ],
        []
    )

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 10)
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    useEffect(() => {
        if (!open) return
        const onKeyDown = (e) => e.key === "Escape" && setOpen(false)
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [open])

    useEffect(() => {
        const sections = items.map((i) => document.querySelector(i.href)).filter(Boolean)
        if (!sections.length) return

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0]
                if (visible?.target?.id) setActiveHash(`#${visible.target.id}`)
            },
            { threshold: [0.2, 0.35, 0.5], rootMargin: "-20% 0px -70% 0px" }
        )

        sections.forEach((s) => observer.observe(s))
        return () => observer.disconnect()
    }, [items])

    const goTo = (href) => (e) => {
        if (!href.startsWith("#")) return
        e.preventDefault()
        setOpen(false)
        const el = document.querySelector(href)
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
        else window.location.hash = href
    }

    const isHome = pathname === "/"

    return (
        <>
            <header className="fixed top-0 inset-x-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-4">
                    <nav
                        className={cx(
                            "relative flex items-center justify-between",
                            "h-14 sm:h-16 rounded-2xl px-4 sm:px-6",
                            "border transition-all duration-300",
                            scrolled
                                ? "bg-black/55 border-white/10 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                                : "bg-transparent border-white/0"
                        )}
                        aria-label="Primary"
                    >
                        <a href="#home" onClick={goTo("#home")} className="flex items-center" aria-label="Home">
                            <Wordmark />
                        </a>

                        <div className="hidden lg:flex items-center gap-1">
                            {items.map((it) => {
                                const active = isHome && activeHash === it.href
                                return (
                                    <a
                                        key={it.href}
                                        href={it.href}
                                        onClick={goTo(it.href)}
                                        className={cx(
                                            "text-sm font-medium px-3 py-2 rounded-xl transition",
                                            active
                                                ? "text-white bg-white/10 border border-white/10"
                                                : "text-white/75 hover:text-white hover:bg-white/10"
                                        )}
                                        aria-current={active ? "page" : undefined}
                                    >
                                        {it.label}
                                    </a>
                                )
                            })}
                        </div>

                        <div className="hidden lg:flex items-center gap-3">
                            <Link href="/login" className="text-sm font-semibold text-white/80 hover:text-white transition">
                                Sign in
                            </Link>

                            <Link
                                href="/signup"
                                className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-black bg-white hover:bg-white/90 transition shadow-[0_10px_30px_rgba(255,255,255,0.12)]"
                            >
                                Get started
                            </Link>
                        </div>

                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            className="lg:hidden inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition h-10 w-10 text-white"
                            aria-label={open ? "Close menu" : "Open menu"}
                            aria-expanded={open}
                        >
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                {open ? (
                                    <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                ) : (
                                    <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                )}
                            </svg>
                        </button>
                    </nav>
                </div>
            </header>

            <div
                className={cx(
                    "fixed inset-0 z-40 lg:hidden transition",
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                aria-hidden={!open}
            >
                <div
                    className={cx(
                        "absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity",
                        open ? "opacity-100" : "opacity-0"
                    )}
                    onClick={() => setOpen(false)}
                />

                <div
                    className={cx(
                        "absolute left-0 right-0 top-0 pt-20 px-4 sm:px-6",
                        "transition-all duration-200",
                        open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
                    )}
                >
                    <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
                        <div className="p-3">
                            <div className="px-3 py-2">
                                <Wordmark />
                            </div>

                            <div className="grid gap-1">
                                {items.map((it) => {
                                    const active = isHome && activeHash === it.href
                                    return (
                                        <a
                                            key={it.href}
                                            href={it.href}
                                            onClick={goTo(it.href)}
                                            className={cx(
                                                "rounded-xl px-4 py-3 text-sm font-medium transition border",
                                                active
                                                    ? "text-white bg-white/10 border-white/10"
                                                    : "text-white/80 hover:text-white hover:bg-white/10 border-transparent"
                                            )}
                                        >
                                            {it.label}
                                        </a>
                                    )
                                })}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <Link
                                    href="/login"
                                    onClick={() => setOpen(false)}
                                    className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white border border-white/15 bg-white/5 hover:bg-white/10 transition"
                                >
                                    Sign in
                                </Link>
                                <Link
                                    href="/signup"
                                    onClick={() => setOpen(false)}
                                    className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-black bg-white hover:bg-white/90 transition"
                                >
                                    Get started
                                </Link>
                            </div>

                            <div className="mt-3 text-center text-xs text-white/55">14-day free trial. No card needed.</div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
