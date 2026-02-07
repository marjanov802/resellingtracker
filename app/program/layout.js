// app/program/layout.js
import { Inter } from "next/font/google"
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import ProgramNavbar from "@/components/ProgramNavbar"
import { prisma } from '@/lib/prisma'
import { SubscriptionBanner } from '@/components/SubscriptionBanner'

const inter = Inter({ subsets: ["latin"] })

export default async function ProgramLayout({ children }) {
  const { userId } = await auth()

  // Not logged in - redirect to login
  if (!userId) {
    redirect('/login')
  }

  // Get subscription
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  })

  // No subscription or inactive - redirect to onboarding
  if (!subscription) {
    redirect('/onboarding')
  }

  // Check if subscription is active
  const isActive = ['ACTIVE', 'TRIALING'].includes(subscription.status)

  // Check trial expiry
  if (subscription.status === 'TRIALING' && subscription.trialEndDate) {
    if (new Date() >= new Date(subscription.trialEndDate)) {
      redirect('/onboarding?reason=trial_expired')
    }
  }

  // Not active - redirect to onboarding
  if (!isActive) {
    const reason = subscription.status === 'CANCELLED' ? 'cancelled' :
      subscription.status === 'PAST_DUE' ? 'past_due' :
        subscription.status === 'TRIAL_EXPIRED' ? 'trial_expired' :
          'inactive'
    redirect(`/onboarding?reason=${reason}`)
  }

  // Calculate days remaining for banners
  const isTrial = subscription.status === 'TRIALING'
  const endDate = isTrial ? subscription.trialEndDate : subscription.currentPeriodEnd
  const daysRemaining = endDate
    ? Math.max(0, Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0

  return (
    <div className={`${inter.className} min-h-screen bg-black`}>
      {/* Show banner for trial users with 3 days or less remaining */}
      {isTrial && daysRemaining <= 3 && (
        <SubscriptionBanner
          type="trial_ending"
          daysRemaining={daysRemaining}
        />
      )}

      {/* Show banner if subscription is set to cancel */}
      {subscription.cancelAtPeriodEnd && (
        <SubscriptionBanner
          type="cancelling"
          daysRemaining={daysRemaining}
        />
      )}

      <ProgramNavbar />
      <main className="pt-16">{children}</main>
    </div>
  )
}