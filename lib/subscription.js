// lib/subscription.js
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { isSubscriptionActive } from '@/lib/stripe';

export async function checkSubscription() {
  const { userId } = await auth();
  
  if (!userId) {
    return {
      isAuthenticated: false,
      hasSubscription: false,
      isActive: false,
      canUseTrial: true,
      subscription: null,
    };
  }
  
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  
  if (!subscription) {
    return {
      isAuthenticated: true,
      hasSubscription: false,
      isActive: false,
      canUseTrial: true,
      subscription: null,
    };
  }
  
  const isActive = isSubscriptionActive(subscription);
  
  // Check if trial has expired
  if (subscription.status === 'TRIALING' && subscription.trialEndDate) {
    const trialExpired = new Date() >= new Date(subscription.trialEndDate);
    if (trialExpired) {
      // Update status to expired
      await prisma.subscription.update({
        where: { userId },
        data: { status: 'TRIAL_EXPIRED' },
      });
      subscription.status = 'TRIAL_EXPIRED';
    }
  }
  
  return {
    isAuthenticated: true,
    hasSubscription: true,
    isActive,
    canUseTrial: !subscription.trialUsed,
    subscription: {
      status: subscription.status,
      plan: subscription.plan,
      trialEndsAt: subscription.trialEndDate,
      periodEndsAt: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },
  };
}

// Helper to get days remaining
export function getDaysRemaining(endDate) {
  if (!endDate) return 0;
  const now = new Date();
  const end = new Date(endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}
