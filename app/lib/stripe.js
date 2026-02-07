// lib/stripe.js
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Your pricing plans
export const PLANS = {
  TRIAL: {
    name: 'Trial',
    description: '14-day access to try the full platform',
    price: 100, // £1.00 in pence
    priceId: 'price_1SvQgsCfGsER8WVDBaCk8Kns',
    mode: 'payment', // One-time payment
    features: [
      'Full access for 14 days',
      'All analytics features',
      'Inventory management',
      'CSV import/export',
    ],
    duration: 14,
  },
  MONTHLY: {
    name: 'Monthly',
    description: 'Full access, billed monthly',
    price: 499, // £4.99 in pence
    priceId: 'price_1SvQhGCfGsER8WVDRdksC1Ln',
    mode: 'subscription',
    interval: 'month',
    features: [
      'Full platform access',
      'Advanced analytics & trends',
      'Best/worst performers',
      'Stock alerts (coming soon)',
      'Priority support',
      'Cancel anytime',
    ],
  },
  YEARLY: {
    name: 'Yearly',
    description: 'Full access, billed annually (save £9.88)',
    price: 5000, // £50.00 in pence
    priceId: 'price_1SvQi4CfGsER8WVDhCWwfDtS',
    mode: 'subscription',
    interval: 'year',
    features: [
      'Full platform access',
      'Advanced analytics & trends',
      'Best/worst performers',
      'Stock alerts (coming soon)',
      'Priority support',
      '2 months free vs monthly',
    ],
    savings: '17%',
  },
};

// Helper to format price for display
export function formatPrice(pence) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(pence / 100);
}

// Helper to check if subscription is active
export function isSubscriptionActive(subscription) {
  if (!subscription) return false;
  
  const activeStatuses = ['ACTIVE', 'TRIALING'];
  
  if (!activeStatuses.includes(subscription.status)) {
    return false;
  }
  
  // For trials, check if still within trial period
  if (subscription.status === 'TRIALING' && subscription.trialEndDate) {
    return new Date() < new Date(subscription.trialEndDate);
  }
  
  // For subscriptions, check if within billing period
  if (subscription.currentPeriodEnd) {
    return new Date() < new Date(subscription.currentPeriodEnd);
  }
  
  return true;
}

// Calculate trial end date (14 days from now)
export function calculateTrialEndDate() {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);
  return endDate;
}
