// app/signup/page.jsx
"use client"

import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
    return (
        <main className="min-h-screen bg-black flex items-center justify-center">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute -top-32 right-10 h-[440px] w-[440px] rounded-full bg-blue-500/14 blur-3xl" />
                <div className="absolute bottom-10 left-10 h-[420px] w-[420px] rounded-full bg-purple-500/14 blur-3xl" />
            </div>

            <div className="relative">
                <SignUp
                    afterSignUpUrl="/onboarding"
                    signInUrl="/login"
                    appearance={{
                        elements: {
                            rootBox: "mx-auto",
                            card: "bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
                            headerTitle: "text-white",
                            headerSubtitle: "text-white/70",
                            socialButtonsBlockButton: "bg-white/10 border-white/10 text-white hover:bg-white/15",
                            socialButtonsBlockButtonText: "text-white",
                            dividerLine: "bg-white/10",
                            dividerText: "text-white/50",
                            formFieldLabel: "text-white/70",
                            formFieldInput: "bg-white/5 border-white/10 text-white placeholder:text-white/40",
                            formButtonPrimary: "bg-white text-black hover:bg-white/90",
                            footerActionLink: "text-white hover:text-white/80",
                            footerActionText: "text-white/60",
                            identityPreviewText: "text-white",
                            identityPreviewEditButton: "text-white/70",
                        }
                    }}
                />
            </div>
        </main>
    )
}