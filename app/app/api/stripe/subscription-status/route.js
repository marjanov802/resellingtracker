// app/api/stripe/subscription-status/route.js
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { isSubscriptionActive } from '@/lib/stripe';

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    
    if (!subscription) {
      return NextResponse.json({
        hasSubscription: false,
        isActive: false,
        canUseTrial: true,
        status: null,
        plan: null,
        trialEndsAt: null,
        periodEndsAt: null,
      });
    }
    
    const isActive = isSubscriptionActive(subscription);
    
    return NextResponse.json({
      hasSubscription: true,
      isActive,
      canUseTrial: !subscription.trialUsed,
      status: subscription.status,
      plan: subscription.plan,
      trialEndsAt: subscription.trialEndDate,
      periodEndsAt: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription status' },
      { status: 500 }
    );
  }
}
