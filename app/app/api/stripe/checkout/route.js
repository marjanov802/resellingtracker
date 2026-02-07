// app/api/stripe/checkout/route.js
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe, PLANS, calculateTrialEndDate } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function POST(request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const user = await currentUser();
    const { plan } = await request.json();
    
    // Validate plan
    if (!plan || !PLANS[plan]) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }
    
    const selectedPlan = PLANS[plan];
    
    // Check if user already has an active subscription
    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    
    // If trying to get trial but already used it
    if (plan === 'TRIAL' && existingSubscription?.trialUsed) {
      return NextResponse.json(
        { error: 'You have already used your trial. Please choose a subscription plan.' },
        { status: 400 }
      );
    }
    
    // If already has active subscription
    if (existingSubscription && ['ACTIVE', 'TRIALING'].includes(existingSubscription.status)) {
      if (existingSubscription.status === 'TRIALING' && 
          existingSubscription.trialEndDate && 
          new Date(existingSubscription.trialEndDate) > new Date()) {
        return NextResponse.json(
          { error: 'You already have an active trial.' },
          { status: 400 }
        );
      }
    }
    
    // Get or create Stripe customer
    let stripeCustomerId = existingSubscription?.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.emailAddresses[0]?.emailAddress,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
        metadata: {
          clerkUserId: userId,
        },
      });
      stripeCustomerId = customer.id;
    }
    
    // Build checkout session config
    const checkoutConfig = {
      customer: stripeCustomerId,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      metadata: {
        userId,
        plan,
      },
    };
    
    // Different handling for trial (one-time) vs subscription
    if (plan === 'TRIAL') {
      checkoutConfig.mode = 'payment';
      checkoutConfig.line_items = [
        {
          price: selectedPlan.priceId,
          quantity: 1,
        },
      ];
      checkoutConfig.metadata.trialEndDate = calculateTrialEndDate().toISOString();
    } else {
      checkoutConfig.mode = 'subscription';
      checkoutConfig.line_items = [
        {
          price: selectedPlan.priceId,
          quantity: 1,
        },
      ];
      checkoutConfig.subscription_data = {
        metadata: {
          userId,
          plan,
        },
      };
    }
    
    const session = await stripe.checkout.sessions.create(checkoutConfig);
    
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
