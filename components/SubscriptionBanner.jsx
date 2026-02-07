// components/SubscriptionBanner.jsx
"use client";

import Link from 'next/link';

export function SubscriptionBanner({ type, daysRemaining }) {
  const bannerStyles = {
    trial_ending: {
      bg: 'bg-amber-500/10 border-amber-500/20',
      text: 'text-amber-200',
      icon: '⏳',
    },
    cancelling: {
      bg: 'bg-red-500/10 border-red-500/20',
      text: 'text-red-200',
      icon: '⚠️',
    },
    past_due: {
      bg: 'bg-red-500/10 border-red-500/20',
      text: 'text-red-200',
      icon: '💳',
    },
  };
  
  const style = bannerStyles[type] || bannerStyles.trial_ending;
  
  const messages = {
    trial_ending: daysRemaining === 0 
      ? 'Your trial ends today! Subscribe now to keep access.'
      : `Your trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Subscribe to continue using all features.`,
    cancelling: `Your subscription ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Resubscribe to keep access.`,
    past_due: 'Your payment failed. Please update your payment method to continue.',
  };
  
  return (
    <div className={`border-b ${style.bg} ${style.text}`}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span>{style.icon}</span>
          <span>{messages[type]}</span>
        </div>
        
        <Link
          href="/pricing"
          className="shrink-0 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-1.5 text-sm font-medium transition"
        >
          {type === 'past_due' ? 'Update payment' : 'View plans'}
        </Link>
      </div>
    </div>
  );
}
