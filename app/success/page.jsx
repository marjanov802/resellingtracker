// app/success/page.jsx
"use client"

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [retryCount, setRetryCount] = useState(0)

  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    async function checkStatus() {
      if (!sessionId) {
        setStatus('error')
        return
      }

      try {
        const res = await fetch('/api/stripe/subscription-status')
        if (res.ok) {
          const data = await res.json()
          if (data.isActive) {
            setStatus('success')
          } else if (retryCount < 10) {
            // Retry after 2 seconds (webhook might still be processing)
            setTimeout(() => {
              setRetryCount(prev => prev + 1)
            }, 2000)
          } else {
            setStatus('processing')
          }
        } else {
          setStatus('error')
        }
      } catch (err) {
        console.error('Failed to check subscription status:', err)
        if (retryCount < 10) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1)
          }, 2000)
        } else {
          setStatus('error')
        }
      }
    }

    checkStatus()
  }, [sessionId, retryCount])

  // Auto-redirect after success
  useEffect(() => {
    if (status === 'success') {
      const timer = setTimeout(() => {
        router.push('/program')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [status, router])

  return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-32 right-10 h-[440px] w-[440px] rounded-full bg-green-500/14 blur-3xl" />
        <div className="absolute bottom-10 left-10 h-[420px] w-[420px] rounded-full bg-blue-500/14 blur-3xl" />
      </div>

      <div className="relative max-w-md mx-auto px-4 text-center">
        {status === 'loading' && (
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/10 border border-white/10">
              <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">Processing payment...</h1>
            <p className="text-white/70">Please wait while we confirm your subscription.</p>
            {retryCount > 0 && (
              <p className="text-xs text-white/50">Checking... ({retryCount}/10)</p>
            )}
          </div>
        )}

        {status === 'processing' && (
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30">
              <svg className="h-8 w-8 text-amber-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">Almost there!</h1>
            <p className="text-white/70">
              Your payment was received. Setting up your account...
            </p>
            <button
              onClick={() => setRetryCount(0)}
              className="mt-4 text-sm text-white/70 hover:text-white underline"
            >
              Check again
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 border border-green-500/30">
              <svg className="h-10 w-10 text-green-400" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div>
              <h1 className="text-3xl font-bold text-white">You're all set! 🎉</h1>
              <p className="mt-2 text-white/70">
                Your subscription is active. Let's start tracking your inventory.
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href="/program"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-black hover:bg-white/90 transition"
              >
                Go to dashboard →
              </Link>

              <p className="text-xs text-white/50">
                Redirecting in 3 seconds...
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
              <svg className="h-8 w-8 text-red-400" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
            <p className="text-white/70">
              We couldn't verify your payment. If you were charged, your subscription will be activated shortly.
            </p>
            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={() => {
                  setStatus('loading')
                  setRetryCount(0)
                }}
                className="inline-flex items-center justify-center rounded-2xl bg-white/10 border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15 transition"
              >
                Try again
              </button>
              <Link
                href="/"
                className="text-sm text-white/70 hover:text-white"
              >
                Return home
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}