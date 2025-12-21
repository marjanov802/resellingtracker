// app/login/[[...rest]]/page.js
"use client"

import { SignIn } from "@clerk/nextjs"
import AuthShell from "@/components/AuthShell"

const appearance = {
    elements: {
        rootBox: "w-full",
        card: "bg-transparent shadow-none border-none p-0 w-full",
        header: "hidden",
        socialButtonsBlockButton:
            "bg-white/5 border border-white/10 text-white hover:bg-white/10 transition rounded-2xl",
        dividerLine: "bg-white/10",
        dividerText: "text-white/60",
        formFieldLabel: "text-white/70",
        formFieldInput:
            "bg-black/30 border border-white/10 text-white placeholder:text-white/35 focus:border-white/25 rounded-2xl h-11",
        formButtonPrimary:
            "bg-white text-black hover:bg-white/90 transition rounded-2xl h-11 font-semibold",
        footerActionText: "text-white/60",
        footerActionLink: "text-white hover:text-white/90",
    },
}

export default function Page() {
    return (
        <AuthShell title="Sign in" subtitle="Welcome back">
            <SignIn
                routing="path"
                path="/login"
                signUpUrl="/signup"
                appearance={appearance}
                // ✅ force it (prevents dashboard/defaults overriding)
                forceRedirectUrl="/program"
                fallbackRedirectUrl="/program"
            />
        </AuthShell>
    )
}
