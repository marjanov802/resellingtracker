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
// CHECKOUT COMPLETED - Main handler
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

  // SUBSCRIPTION (monthly/yearly)
  if (session.mode === 'subscription') {
    const subscriptionPlan = plan === 'YEARLY' ? 'YEARLY' : 'MONTHLY';

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

    console.log(`[Webhook] Subscription ACTIVE for ${userId} - Plan: ${subscriptionPlan}`);
  }
}

// ============================================
// SUBSCRIPTION UPDATE - Only update if beneficial
// ============================================
async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;

  console.log(`[Webhook] Subscription update - Customer: ${customerId}, Stripe Status: ${subscription.status}`);

  const existing = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!existing) {
    console.log(`[Webhook] No subscription found for customer ${customerId}, skipping`);
    return;
  }

  // If already ACTIVE, don't downgrade to other statuses from race conditions
  if (existing.status === 'ACTIVE' && subscription.status === 'active') {
    console.log(`[Webhook] Subscription already ACTIVE, updating details only`);
  }

  // Map Stripe status - be careful with the mapping
  const statusMap = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELLED',
    cancelled: 'CANCELLED',
    unpaid: 'PAST_DUE',
    trialing: 'TRIALING',
    incomplete: 'ACTIVE', // Changed: treat incomplete as active since payment succeeded
    incomplete_expired: 'INACTIVE',
    paused: 'INACTIVE',
  };

  // Only change status if Stripe says it's active, or if it's a downgrade event
  let newStatus = statusMap[subscription.status];

  // If existing is ACTIVE and new would be worse, keep ACTIVE
  // (handles race condition where subscription.created comes after checkout.completed)
  if (existing.status === 'ACTIVE' && !['active', 'past_due', 'canceled', 'cancelled', 'unpaid'].includes(subscription.status)) {
    newStatus = 'ACTIVE';
    console.log(`[Webhook] Keeping ACTIVE status despite Stripe status: ${subscription.status}`);
  }

  // If we couldn't map the status, keep existing
  if (!newStatus) {
    newStatus = existing.status;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id;
  let plan = existing.plan;
  if (priceId === PLANS.YEARLY.priceId) {
    plan = 'YEARLY';
  } else if (priceId === PLANS.MONTHLY.priceId) {
    plan = 'MONTHLY';
  }

  const updateData = {
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId || existing.stripePriceId,
    status: newStatus,
    plan,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
  };

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

  console.log(`[Webhook] Updated subscription for ${existing.userId} - Status: ${newStatus}`);
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

  // Make sure status is ACTIVE after successful payment
  if (existing.status !== 'ACTIVE' && existing.status !== 'TRIALING') {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE' },
    });
    console.log(`[Webhook] Set subscription to ACTIVE after payment for ${existing.userId}`);
  }

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