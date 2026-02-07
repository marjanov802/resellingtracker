// app/pricing/page.jsx
"use client";

import { useEffect, useState } from 'react';
import { useUser, SignInButton } from '@clerk/nextjs';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const PLANS = [
  {
    id: 'TRIAL',
    name: 'Trial',
    price: '£1',
    period: 'one-time',
    description: 'Try the full platform for 14 days',
    features: [
      'Full access for 14 days',
      'All analytics features',
      'Inventory management',
      'CSV import/export',
    ],
    popular: false,
    cta: 'Start 14-day trial',
    highlight: '£1 for 14 days',
  },
  {
    id: 'MONTHLY',
    name: 'Monthly',
    price: '£4.99',
    period: '/month',
    description: 'Full access, cancel anytime',
    features: [
      'Full platform access',
      'Advanced analytics & trends',
      'Best/worst performers',
      'Stock alerts (coming soon)',
      'Priority support',
      'Cancel anytime',
    ],
    popular: true,
    cta: 'Subscribe monthly',
  },
  {
    id: 'YEARLY',
    name: 'Yearly',
    price: '£50',
    period: '/year',
    description: 'Best value - save 17%',
    features: [
      'Full platform access',
      'Advanced analytics & trends',
      'Best/worst performers',
      'Stock alerts (coming soon)',
      'Priority support',
      '2 months free vs monthly',
    ],
    popular: false,
    cta: 'Subscribe yearly',
    badge: 'Save 17%',
  },
];

function PricingCard({ plan, onSelect, loading, canUseTrial, isSignedIn }) {
  const isTrialDisabled = plan.id === 'TRIAL' && !canUseTrial;
  const isDisabled = loading || isTrialDisabled;
  
  return (
    <div
      className={`relative rounded-3xl border p-7 backdrop-blur-xl transition-all ${
        plan.popular 
          ? 'border-white/20 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.55)] scale-105' 
          : 'border-white/10 bg-white/5'
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-7">
          <span className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs text-white/90 font-medium">
            Most popular
          </span>
        </div>
      )}
      
      {plan.badge && (
        <div className="absolute -top-3 right-7">
          <span className="inline-flex items-center rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1 text-xs text-green-300 font-medium">
            {plan.badge}
          </span>
        </div>
      )}
      
      <div>
        <div className="text-lg font-semibold text-white">{plan.name}</div>
        <div className="mt-1 text-sm text-white/70">{plan.description}</div>
      </div>
      
      <div className="mt-6 flex items-end gap-2">
        <div className="text-4xl font-bold text-white tracking-tight">{plan.price}</div>
        <div className="pb-1 text-sm text-white/70">{plan.period}</div>
      </div>
      
      {plan.highlight && (
        <div className="mt-2 text-sm text-amber-300/90">{plan.highlight}</div>
      )}
      
      {isSignedIn ? (
        <button
          onClick={() => onSelect(plan.id)}
          disabled={isDisabled}
          className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
            isDisabled
              ? 'bg-white/5 text-white/40 cursor-not-allowed'
              : plan.popular
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'
          }`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </span>
          ) : isTrialDisabled ? (
            'Trial already used'
          ) : (
            plan.cta
          )}
        </button>
      ) : (
        <SignInButton mode="modal" forceRedirectUrl="/pricing">
          <button
            className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              plan.popular
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'
            }`}
          >
            Sign in to {plan.cta.toLowerCase()}
          </button>
        </SignInButton>
      )}
      
      <ul className="mt-7 space-y-3 text-sm text-white/75">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 border border-white/10">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [canUseTrial, setCanUseTrial] = useState(true);
  
  const reason = searchParams.get('reason');
  const cancelled = searchParams.get('cancelled');
  
  useEffect(() => {
    async function fetchStatus() {
      if (!isSignedIn) return;
      
      try {
        const res = await fetch('/api/stripe/subscription-status');
        if (res.ok) {
          const data = await res.json();
          setCanUseTrial(data.canUseTrial);
        }
      } catch (err) {
        console.error('Failed to fetch subscription status:', err);
      }
    }
    
    fetchStatus();
  }, [isSignedIn]);
  
  const handleSelectPlan = async (planId) => {
    if (!isSignedIn) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }
      
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };
  
  const reasonMessages = {
    trial_expired: "Your trial has ended. Subscribe to continue using ResellTracker.",
    cancelled: "Your subscription has been cancelled. Resubscribe to regain access.",
    past_due: "Your payment failed. Please update your payment method or choose a new plan.",
    no_subscription: "Choose a plan to access the full ResellTracker platform.",
  };
  
  return (
    <main className="min-h-screen bg-black">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-32 right-10 h-[440px] w-[440px] rounded-full bg-blue-500/14 blur-3xl" />
        <div className="absolute bottom-10 left-10 h-[420px] w-[420px] rounded-full bg-purple-500/14 blur-3xl" />
      </div>
      
      <div className="relative">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-white font-semibold text-lg">
              ResellTracker
            </Link>
            
            {isLoaded && isSignedIn && (
              <Link 
                href="/program" 
                className="text-sm text-white/70 hover:text-white transition"
              >
                Back to dashboard
              </Link>
            )}
          </div>
        </header>
        
        {/* Alert banner */}
        {(reason || cancelled) && (
          <div className={`border-b ${
            reason === 'past_due' 
              ? 'bg-red-500/10 border-red-500/20 text-red-200'
              : cancelled
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-200'
          }`}>
            <div className="max-w-7xl mx-auto px-4 py-3 text-sm text-center">
              {cancelled 
                ? "Payment was cancelled. Choose a plan when you're ready."
                : reasonMessages[reason] || reasonMessages.no_subscription
              }
            </div>
          </div>
        )}
        
        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-sm font-semibold text-white/60">Pricing</div>
            <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white">
              Choose your plan
            </h1>
            <p className="mt-4 text-white/70 leading-relaxed">
              Try for £1 or subscribe for full access to all features.
            </p>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="mt-8 max-w-md mx-auto">
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            </div>
          )}
          
          {/* Pricing cards */}
          <div className="mt-12 grid md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
            {PLANS.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                onSelect={handleSelectPlan}
                loading={loading}
                canUseTrial={canUseTrial}
                isSignedIn={isSignedIn}
              />
            ))}
          </div>
          
          {/* Trust badges */}
          <div className="mt-16 grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { title: 'Cancel anytime', desc: 'No lock-in contracts. Cancel whenever you want.' },
              { title: 'Secure payments', desc: 'Powered by Stripe. Your card details are never stored with us.' },
              { title: '14-day trial', desc: 'Try everything for just £1 before committing.' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 text-center">
                <div className="text-sm font-semibold text-white">{item.title}</div>
                <div className="mt-2 text-sm text-white/70">{item.desc}</div>
              </div>
            ))}
          </div>
          
          {/* FAQ link */}
          <div className="mt-12 text-center">
            <p className="text-sm text-white/60">
              Have questions?{' '}
              <Link href="/#faqs" className="text-white hover:underline">
                Check our FAQs
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
