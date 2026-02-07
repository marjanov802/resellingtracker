// components/SubscriptionManager.jsx
"use client";

import { useState, useEffect } from 'react';

export function SubscriptionManager() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  
  useEffect(() => {
    fetchSubscription();
  }, []);
  
  async function fetchSubscription() {
    try {
      const res = await fetch('/api/stripe/subscription-status');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
    } finally {
      setLoading(false);
    }
  }
  
  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to open portal:', err);
    } finally {
      setPortalLoading(false);
    }
  }
  
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-white/10 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-white/10 rounded w-2/3"></div>
      </div>
    );
  }
  
  if (!subscription?.hasSubscription) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-sm text-white/60">Subscription</div>
        <div className="mt-2 text-lg font-semibold text-white">No active subscription</div>
        <a
          href="/pricing"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 transition"
        >
          View plans
        </a>
      </div>
    );
  }
  
  const planNames = {
    TRIAL: '14-Day Trial',
    MONTHLY: 'Monthly',
    YEARLY: 'Yearly',
  };
  
  const statusColors = {
    ACTIVE: 'text-green-400',
    TRIALING: 'text-amber-400',
    PAST_DUE: 'text-red-400',
    CANCELLED: 'text-gray-400',
    TRIAL_EXPIRED: 'text-red-400',
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };
  
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white/60">Your subscription</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {planNames[subscription.plan] || subscription.plan}
          </div>
          <div className={`mt-1 text-sm ${statusColors[subscription.status] || 'text-white/70'}`}>
            {subscription.status === 'TRIALING' && 'Trial active'}
            {subscription.status === 'ACTIVE' && 'Active'}
            {subscription.status === 'PAST_DUE' && 'Payment overdue'}
            {subscription.status === 'CANCELLED' && 'Cancelled'}
            {subscription.status === 'TRIAL_EXPIRED' && 'Trial expired'}
          </div>
        </div>
        
        {subscription.status !== 'TRIAL_EXPIRED' && subscription.plan !== 'TRIAL' && (
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="shrink-0 rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 transition disabled:opacity-50"
          >
            {portalLoading ? 'Loading...' : 'Manage'}
          </button>
        )}
      </div>
      
      {/* Details */}
      <div className="mt-6 pt-4 border-t border-white/10 space-y-3">
        {subscription.status === 'TRIALING' && (
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Trial ends</span>
            <span className="text-white">{formatDate(subscription.trialEndsAt)}</span>
          </div>
        )}
        
        {subscription.status === 'ACTIVE' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">
                {subscription.cancelAtPeriodEnd ? 'Access until' : 'Next billing'}
              </span>
              <span className="text-white">{formatDate(subscription.periodEndsAt)}</span>
            </div>
            
            {subscription.cancelAtPeriodEnd && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-200">
                Your subscription will end on {formatDate(subscription.periodEndsAt)}
              </div>
            )}
          </>
        )}
        
        {(subscription.status === 'TRIAL_EXPIRED' || subscription.status === 'CANCELLED') && (
          <a
            href="/pricing"
            className="inline-flex w-full items-center justify-center rounded-xl bg-white text-black px-4 py-2.5 text-sm font-semibold hover:bg-white/90 transition"
          >
            Resubscribe
          </a>
        )}
        
        {subscription.status === 'TRIALING' && (
          <a
            href="/pricing"
            className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 border border-white/15 text-white px-4 py-2.5 text-sm font-medium hover:bg-white/15 transition"
          >
            Upgrade to full subscription
          </a>
        )}
      </div>
    </div>
  );
}
