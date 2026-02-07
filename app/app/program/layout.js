// app/program/layout.js
import { redirect } from 'next/navigation';
import { checkSubscription, getDaysRemaining } from '@/lib/subscription';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';

export default async function ProgramLayout({ children }) {
  const { isAuthenticated, isActive, subscription } = await checkSubscription();
  
  // Redirect unauthenticated users to sign in
  if (!isAuthenticated) {
    redirect('/sign-in?redirect_url=/program');
  }
  
  // Redirect users without active subscription to pricing
  if (!isActive) {
    let reason = 'no_subscription';
    
    if (subscription?.status === 'TRIAL_EXPIRED') {
      reason = 'trial_expired';
    } else if (subscription?.status === 'CANCELLED') {
      reason = 'cancelled';
    } else if (subscription?.status === 'PAST_DUE') {
      reason = 'past_due';
    }
    
    redirect(`/pricing?reason=${reason}`);
  }
  
  // Calculate remaining time for trial users
  const isTrial = subscription?.status === 'TRIALING';
  const daysRemaining = isTrial 
    ? getDaysRemaining(subscription?.trialEndsAt)
    : getDaysRemaining(subscription?.periodEndsAt);
  
  return (
    <div className="min-h-screen">
      {/* Show banner for trial users with 3 days or less remaining */}
      {isTrial && daysRemaining <= 3 && (
        <SubscriptionBanner 
          type="trial_ending"
          daysRemaining={daysRemaining}
        />
      )}
      
      {/* Show banner if subscription is set to cancel */}
      {subscription?.cancelAtPeriodEnd && (
        <SubscriptionBanner 
          type="cancelling"
          daysRemaining={daysRemaining}
        />
      )}
      
      {children}
    </div>
  );
}
