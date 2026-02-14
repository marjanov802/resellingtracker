// app/onboarding/page.jsx
"use client"

import { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

function PricingCard({ name, price, period, desc, bullets, popular, cta, planId, badge, onSelect, loading }) {
    return (
        <div
            className={[
                "relative rounded-2xl border p-6",
                popular
                    ? "border-white/20 bg-[#161616]"
                    : "border-[#222] bg-[#111]",
            ].join(" ")}
        >
            {popular && (
                <div className="absolute -top-3 left-6">
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-black">
                        Most popular
                    </span>
                </div>
            )}

            {badge && (
                <div className="absolute -top-3 right-6">
                    <span className="inline-flex items-center rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1 text-xs text-green-400 font-medium">
                        {badge}
                    </span>
                </div>
            )}

            <div className="mt-2">
                <div className="text-lg font-semibold text-white">{name}</div>
                <div className="mt-1 text-sm text-neutral-400">{desc}</div>
            </div>

            <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{price}</span>
                <span className="text-sm text-neutral-500">{period}</span>
            </div>

            <button
                onClick={() => onSelect(planId)}
                disabled={loading}
                className={[
                    "mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition",
                    loading
                        ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                        : popular
                            ? "bg-white text-black hover:bg-neutral-200"
                            : "bg-[#222] text-white hover:bg-[#2a2a2a] border border-[#333]",
                ].join(" ")}
            >
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Processing...
                    </span>
                ) : (
                    cta
                )}
            </button>

            <ul className="mt-5 space-y-2.5">
                {bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-neutral-400">
                        <svg className="h-4 w-4 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {b}
                    </li>
                ))}
            </ul>
        </div>
    )
}

const PRICING_PLANS = [
    {
        planId: "TRIAL",
        name: "Trial",
        price: "£1",
        period: "one-time",
        desc: "Try the full platform for 14 days.",
        bullets: ["Full access for 14 days", "All analytics features", "Inventory management", "CSV import/export"],
        popular: false,
        cta: "Start 14-day trial",
    },
    {
        planId: "MONTHLY",
        name: "Monthly",
        price: "£4.99",
        period: "/month",
        desc: "Full access, cancel anytime.",
        bullets: ["Full platform access", "Advanced analytics", "Best/worst performers", "Priority support"],
        popular: true,
        cta: "Subscribe monthly",
    },
    {
        planId: "YEARLY",
        name: "Yearly",
        price: "£50",
        period: "/year",
        desc: "Best value - save 17%.",
        bullets: ["Everything in Monthly", "2 months free", "Priority support"],
        popular: false,
        cta: "Subscribe yearly",
        badge: "Save 17%",
    },
]

export default function OnboardingPage() {
    const { isSignedIn, isLoaded, user } = useUser()
    const { signOut } = useClerk()
    const router = useRouter()

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [checkingSubscription, setCheckingSubscription] = useState(true)

    useEffect(() => {
        async function checkExistingSubscription() {
            if (!isSignedIn) {
                setCheckingSubscription(false)
                return
            }

            try {
                const res = await fetch('/api/stripe/subscription-status')
                if (res.ok) {
                    const data = await res.json()
                    if (data.isActive) {
                        router.push('/program')
                        return
                    }
                }
            } catch (err) {
                console.error('Failed to check subscription:', err)
            }

            setCheckingSubscription(false)
        }

        if (isLoaded) {
            checkExistingSubscription()
        }
    }, [isSignedIn, isLoaded, router])

    const handleSelectPlan = async (planId) => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: planId }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create checkout session')
            }

            window.location.href = data.url
        } catch (err) {
            setError(err.message)
            setLoading(false)
        }
    }

    const handleCancel = async () => {
        await signOut()
        router.push('/')
    }

    if (!isLoaded || checkingSubscription) {
        return (
            <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-neutral-700 border-t-white rounded-full mx-auto"></div>
                    <p className="mt-4 text-neutral-500 text-sm">Loading...</p>
                </div>
            </main>
        )
    }

    if (!isSignedIn) {
        router.push('/signup')
        return null
    }

    return (
        <main className="min-h-screen bg-[#0a0a0a]">
            {/* Content */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
                {/* Header */}
                <div className="text-center max-w-xl mx-auto">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">
                        Choose your plan
                    </h1>
                    <p className="mt-2 text-neutral-400">
                        {user?.firstName ? `Welcome, ${user.firstName}! ` : ''}Select a plan to get started.
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="mt-6 max-w-md mx-auto">
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 text-center">
                            {error}
                        </div>
                    </div>
                )}

                {/* Pricing cards */}
                <div className="mt-10 grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
                    {PRICING_PLANS.map((plan) => (
                        <PricingCard
                            key={plan.name}
                            {...plan}
                            onSelect={handleSelectPlan}
                            loading={loading}
                        />
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-12 flex flex-col items-center gap-6">
                    <div className="flex items-center justify-center gap-6 text-xs text-neutral-500">
                        <span>🔒 Secure payment</span>
                        <span>↩️ Cancel anytime</span>
                        <span>⚡ Instant access</span>
                    </div>

                    <button
                        onClick={handleCancel}
                        className="text-sm text-neutral-500 hover:text-white transition"
                    >
                        Cancel and sign out
                    </button>
                </div>
            </div>
        </main>
    )
}