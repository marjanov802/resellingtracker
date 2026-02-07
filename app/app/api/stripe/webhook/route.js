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
  
  try {
    switch (event.type) {
      // ONE-TIME PAYMENT (Trial)
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, plan, trialEndDate } = session.metadata;
        
        if (session.mode === 'payment' && plan === 'TRIAL') {
          await handleTrialPayment(session, userId, trialEndDate);
        }
        break;
      }
      
      // SUBSCRIPTION EVENTS
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
      
      // INVOICE EVENTS
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
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// HANDLER FUNCTIONS

async function handleTrialPayment(session, userId, trialEndDateStr) {
  const trialEndDate = new Date(trialEndDateStr);
  
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      status: 'TRIALING',
      plan: 'TRIAL',
      trialStartDate: new Date(),
      trialEndDate: trialEndDate,
      trialUsed: true,
      stripeCustomerId: session.customer,
    },
    create: {
      userId,
      stripeCustomerId: session.customer,
      status: 'TRIALING',
      plan: 'TRIAL',
      trialStartDate: new Date(),
      trialEndDate: trialEndDate,
      trialUsed: true,
    },
  });
  
  await prisma.payment.create({
    data: {
      userId,
      stripePaymentId: session.payment_intent,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      description: '14-day trial access',
    },
  });
  
  console.log(`Trial activated for user ${userId} until ${trialEndDate}`);
}

async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  
  let userId;
  
  if (subscription.metadata?.userId) {
    userId = subscription.metadata.userId;
  } else {
    const existingSubscription = await prisma.subscription.findUnique({
      where: { stripeCustomerId: customerId },
    });
    userId = existingSubscription?.userId;
    
    if (!userId) {
      const customer = await stripe.customers.retrieve(customerId);
      userId = customer.metadata?.clerkUserId;
    }
  }
  
  if (!userId) {
    console.error('Could not find userId for subscription:', subscription.id);
    return;
  }
  
  const priceId = subscription.items.data[0]?.price?.id;
  let plan = 'MONTHLY';
  if (priceId === PLANS.YEARLY.priceId) {
    plan = 'YEARLY';
  }
  
  const statusMap = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELLED',
    unpaid: 'PAST_DUE',
    trialing: 'TRIALING',
  };
  
  const status = statusMap[subscription.status] || 'INACTIVE';
  
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status,
      plan,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status,
      plan,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialUsed: true,
    },
  });
  
  console.log(`Subscription updated for user ${userId}: ${status} (${plan})`);
}

async function handleSubscriptionCancelled(subscription) {
  const customerId = subscription.customer;
  
  const existingSubscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });
  
  if (existingSubscription) {
    await prisma.subscription.update({
      where: { stripeCustomerId: customerId },
      data: {
        status: 'CANCELLED',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
    
    console.log(`Subscription cancelled for user ${existingSubscription.userId}`);
  }
}

async function handlePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;
  
  const existingSubscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId: invoice.customer },
  });
  
  if (existingSubscription) {
    await prisma.payment.create({
      data: {
        userId: existingSubscription.userId,
        stripePaymentId: invoice.payment_intent,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: 'succeeded',
        description: `Subscription payment - ${existingSubscription.plan}`,
      },
    });
    
    if (existingSubscription.status === 'PAST_DUE') {
      await prisma.subscription.update({
        where: { stripeCustomerId: invoice.customer },
        data: { status: 'ACTIVE' },
      });
    }
  }
}

async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  
  await prisma.subscription.updateMany({
    where: { stripeCustomerId: invoice.customer },
    data: { status: 'PAST_DUE' },
  });
  
  console.log(`Payment failed for customer ${invoice.customer}`);
}
