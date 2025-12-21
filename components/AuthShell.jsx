"use client"

export default function AuthShell({ title, subtitle, children }) {
    return (
        <main className="relative min-h-[100svh] overflow-hidden bg-black">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-black" />
                <div className="absolute -top-56 left-1/2 -translate-x-1/2 h-[720px] w-[720px] rounded-full bg-blue-500/15 blur-3xl" />
                <div className="absolute top-24 left-8 h-[420px] w-[420px] rounded-full bg-purple-500/12 blur-3xl" />
                <div className="absolute bottom-8 right-10 h-[520px] w-[520px] rounded-full bg-white/8 blur-3xl" />
                <div
                    className="absolute inset-0 opacity-[0.10]"
                    style={{
                        backgroundImage:
                            "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
                        backgroundSize: "72px 72px",
                        maskImage: "radial-gradient(circle at 50% 25%, black 45%, transparent 78%)",
                        WebkitMaskImage: "radial-gradient(circle at 50% 25%, black 45%, transparent 78%)",
                    }}
                />
            </div>

            <div className="relative mx-auto flex min-h-[100svh] max-w-7xl items-center justify-center px-4 sm:px-6 pt-28 pb-16">
                <div className="w-full max-w-md">
                    <div className="mb-6 text-center">
                        <div className="text-sm font-semibold text-white/60">{subtitle}</div>
                        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white">{title}</h1>
                        <p className="mt-3 text-sm text-white/70">14-day free trial. Cancel anytime.</p>
                    </div>

                    <div className="relative">
                        <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-blue-400/14 via-purple-400/10 to-white/6 blur-2xl" />
                        <div className="relative rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
                            {children}
                        </div>
                    </div>

                    <p className="mt-6 text-center text-xs text-white/55">By continuing you agree to our Terms and Privacy Policy.</p>
                </div>
            </div>
        </main>
    )
}
