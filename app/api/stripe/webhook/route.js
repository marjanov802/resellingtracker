// app/api/stripe/webhook/route.js
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe, PLANS } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function POST(request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  console.log(`[Webhook] Processing: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionCancelled(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[Webhook] Error handling ${event.type}:`, error);
    return NextResponse.json({ received: true, error: error.message });
  }
}

// ============================================
// CHECKOUT COMPLETED - Handles BOTH trial AND subscription
// ============================================
async function handleCheckoutCompleted(session) {
  const { userId, plan, trialEndDate } = session.metadata || {};

  if (!userId) {
    console.error('[Webhook] No userId in session metadata');
    return;
  }

  console.log(`[Webhook] Checkout completed - User: ${userId}, Plan: ${plan}, Mode: ${session.mode}`);

  // TRIAL (one-time payment)
  if (session.mode === 'payment' && plan === 'TRIAL') {
    const trialEnd = new Date(trialEndDate);

    await prisma.subscription.upsert({
      where: { userId },
      update: {
        status: 'TRIALING',
        plan: 'TRIAL',
        trialStartDate: new Date(),
        trialEndDate: trialEnd,
        trialUsed: true,
        stripeCustomerId: session.customer,
      },
      create: {
        userId,
        stripeCustomerId: session.customer,
        status: 'TRIALING',
        plan: 'TRIAL',
        trialStartDate: new Date(),
        trialEndDate: trialEnd,
        trialUsed: true,
      },
    });

    // Record payment
    if (session.payment_intent) {
      try {
        await prisma.payment.create({
          data: {
            userId,
            stripePaymentId: session.payment_intent,
            amount: session.amount_total || 100,
            currency: session.currency || 'gbp',
            status: 'succeeded',
            description: '14-day trial access',
          },
        });
      } catch (e) {
        console.log('[Webhook] Payment may already exist');
      }
    }

    console.log(`[Webhook] Trial activated for ${userId}`);
    return;
  }

  // SUBSCRIPTION (monthly/yearly) - THIS WAS MISSING!
  if (session.mode === 'subscription') {
    const subscriptionPlan = plan === 'YEARLY' ? 'YEARLY' : 'MONTHLY';

    // Set period dates
    const now = new Date();
    const periodEnd = new Date(now);
    if (subscriptionPlan === 'YEARLY') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await prisma.subscription.upsert({
      where: { userId },
      update: {
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        status: 'ACTIVE',
        plan: subscriptionPlan,
        trialUsed: true,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      create: {
        userId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        status: 'ACTIVE',
        plan: subscriptionPlan,
        trialUsed: true,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    console.log(`[Webhook] Subscription created for ${userId} - Plan: ${subscriptionPlan}`);
  }
}

// ============================================
// SUBSCRIPTION UPDATE - Updates existing record
// ============================================
async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;

  console.log(`[Webhook] Subscription update - Customer: ${customerId}, Status: ${subscription.status}`);

  // Find existing subscription by customer ID
  const existing = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!existing) {
    console.log(`[Webhook] No subscription found for customer ${customerId}, skipping update`);
    return;
  }

  // Determine plan from price ID
  const priceId = subscription.items?.data?.[0]?.price?.id;
  let plan = existing.plan;
  if (priceId === PLANS.YEARLY.priceId) {
    plan = 'YEARLY';
  } else if (priceId === PLANS.MONTHLY.priceId) {
    plan = 'MONTHLY';
  }

  // Map Stripe status
  const statusMap = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELLED',
    unpaid: 'PAST_DUE',
    trialing: 'TRIALING',
    incomplete: 'INACTIVE',
    incomplete_expired: 'INACTIVE',
  };
  const status = statusMap[subscription.status] || existing.status;

  // Build update data
  const updateData = {
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId || existing.stripePriceId,
    status,
    plan,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
  };

  // Only update dates if valid
  if (subscription.current_period_start && typeof subscription.current_period_start === 'number') {
    updateData.currentPeriodStart = new Date(subscription.current_period_start * 1000);
  }
  if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
    updateData.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  }

  await prisma.subscription.update({
    where: { id: existing.id },
    data: updateData,
  });

  console.log(`[Webhook] Updated subscription for ${existing.userId} - Status: ${status}`);
}

// ============================================
// SUBSCRIPTION CANCELLED
// ============================================
async function handleSubscriptionCancelled(subscription) {
  const customerId = subscription.customer;

  const existing = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
    });
    console.log(`[Webhook] Subscription cancelled for ${existing.userId}`);
  }
}

// ============================================
// INVOICE PAYMENT SUCCEEDED
// ============================================
async function handlePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;

  const existing = await prisma.subscription.findFirst({
    where: { stripeCustomerId: invoice.customer },
  });

  if (!existing) return;

  // Record payment
  if (invoice.payment_intent) {
    try {
      await prisma.payment.create({
        data: {
          userId: existing.userId,
          stripePaymentId: invoice.payment_intent,
          amount: invoice.amount_paid,
          currency: invoice.currency || 'gbp',
          status: 'succeeded',
          description: `Subscription payment - ${existing.plan}`,
        },
      });
    } catch (e) {
      // Payment may already exist
    }
  }

  // Ensure active status
  if (existing.status === 'PAST_DUE') {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE' },
    });
  }

  console.log(`[Webhook] Invoice paid for ${existing.userId}`);
}

// ============================================
// INVOICE PAYMENT FAILED
// ============================================
async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;

  const existing = await prisma.subscription.findFirst({
    where: { stripeCustomerId: invoice.customer },
  });

  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'PAST_DUE' },
    });
    console.log(`[Webhook] Payment failed for ${existing.userId}`);
  }
}