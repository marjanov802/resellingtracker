// app/onboarding/page.jsx
"use client"

import { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function PricingCard({ name, price, period, desc, bullets, popular, cta, planId, badge, onSelect, loading }) {
    return (
        <div
            className={[
                "relative rounded-3xl border p-7 backdrop-blur-xl",
                popular ? "border-white/20 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.55)]" : "border-white/10 bg-white/5",
            ].join(" ")}
        >
            {popular && (
                <div className="absolute -top-3 left-7">
                    <span className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-white/75">
                        Most popular
                    </span>
                </div>
            )}

            {badge && (
                <div className="absolute -top-3 right-7">
                    <span className="inline-flex items-center rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1 text-xs text-green-300 font-medium">
                        {badge}
                    </span>
                </div>
            )}

            <div>
                <div className="text-lg font-semibold text-white">{name}</div>
                <div className="mt-1 text-sm text-white/70">{desc}</div>
            </div>

            <div className="mt-6 flex items-end gap-2">
                <div className="text-4xl font-bold text-white tracking-tight">{price}</div>
                <div className="pb-1 text-sm text-white/70">{period}</div>
            </div>

            <button
                onClick={() => onSelect(planId)}
                disabled={loading}
                className={[
                    "mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    loading
                        ? "bg-white/5 text-white/40 cursor-not-allowed"
                        : popular
                            ? "bg-white text-black hover:bg-white/90"
                            : "bg-white/10 text-white hover:bg-white/15 border border-white/15",
                ].join(" ")}
            >
                {loading ? (
                    <span className="flex items-center gap-2">
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

            <ul className="mt-7 space-y-3 text-sm text-white/75">
                {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                        <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 border border-white/10">
                            <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        <span>{b}</span>
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
        bullets: ["Full platform access", "Advanced analytics & trends", "Best/worst performers", "Stock alerts (coming soon)", "Priority support"],
        popular: true,
        cta: "Subscribe monthly",
    },
    {
        planId: "YEARLY",
        name: "Yearly",
        price: "£50",
        period: "/year",
        desc: "Best value - save 17%.",
        bullets: ["Full platform access", "Advanced analytics & trends", "Best/worst performers", "Stock alerts (coming soon)", "Priority support", "2 months free"],
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

    // Check if user already has subscription
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

    // Handle plan selection
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

    // Handle cancel/exit
    const handleCancel = async () => {
        await signOut()
        router.push('/')
    }

    // Show loading while Clerk loads or checking subscription
    if (!isLoaded || checkingSubscription) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-white rounded-full mx-auto"></div>
                    <p className="mt-4 text-white/60 text-sm">Setting up your account...</p>
                </div>
            </main>
        )
    }

    // Redirect to signup if not signed in
    if (!isSignedIn) {
        router.push('/signup')
        return null
    }

    return (
        <main className="min-h-screen bg-black">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute -top-32 right-10 h-[440px] w-[440px] rounded-full bg-blue-500/14 blur-3xl" />
                <div className="absolute bottom-10 left-10 h-[420px] w-[420px] rounded-full bg-purple-500/14 blur-3xl" />
            </div>

            <div className="relative">
                {/* Minimal Header */}
                <header className="py-6 px-4 sm:px-6">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <Link href="/" className="text-lg font-semibold text-white">
                            ResellTracker
                        </Link>

                        <button
                            onClick={handleCancel}
                            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition px-3 py-2 rounded-lg hover:bg-white/5"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Cancel
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
                    {/* Progress Steps */}
                    <div className="flex items-center justify-center gap-3 text-sm mb-12">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                            <span className="text-green-400 font-medium">Account created</span>
                        </div>

                        <div className="w-8 h-px bg-white/20"></div>

                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 border border-white/30 text-white text-xs font-semibold">
                                2
                            </span>
                            <span className="text-white font-medium">Choose plan</span>
                        </div>

                        <div className="w-8 h-px bg-white/10"></div>

                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/40 text-xs">
                                3
                            </span>
                            <span className="text-white/40">Start tracking</span>
                        </div>
                    </div>

                    {/* Welcome message */}
                    <div className="text-center max-w-2xl mx-auto mb-10">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                            Welcome{user?.firstName ? `, ${user.firstName}` : ''}! 👋
                        </h1>
                        <p className="mt-4 text-white/60 leading-relaxed">
                            One last step — choose a plan to start tracking your reselling business.
                        </p>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="mb-8 max-w-md mx-auto">
                            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-200 text-center">
                                {error}
                            </div>
                        </div>
                    )}

                    {/* Pricing cards */}
                    <div className="grid lg:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
                        {PRICING_PLANS.map((plan) => (
                            <PricingCard
                                key={plan.name}
                                {...plan}
                                onSelect={handleSelectPlan}
                                loading={loading}
                            />
                        ))}
                    </div>

                    {/* Trust badges */}
                    <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-sm text-white/50">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Secure payments via Stripe
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="12" cy="12" r="10" />
                            </svg>
                            Cancel anytime
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Instant access
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}