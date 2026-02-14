// app/login/page.jsx
"use client";

import { useMemo, useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const { isLoaded, signIn, setActive } = useSignIn();

    const [form, setForm] = useState({
        emailAddress: "",
        password: "",
    });

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const canSubmit = useMemo(() => {
        return form.emailAddress.trim().length > 0 && form.password.length > 0;
    }, [form]);

    const onChange = (key) => (e) => {
        setErr("");
        setForm((p) => ({ ...p, [key]: e.target.value }));
    };

    const safeErr = (e) => {
        const msg =
            e?.errors?.[0]?.longMessage ||
            e?.errors?.[0]?.message ||
            e?.message ||
            "Something went wrong";
        return msg;
    };

    const submitLogin = async (e) => {
        e.preventDefault();
        if (!isLoaded || loading) return;

        setLoading(true);
        setErr("");

        try {
            const res = await signIn.create({
                identifier: form.emailAddress,
                password: form.password,
            });

            if (res.status === "complete") {
                await setActive({ session: res.createdSessionId });
                router.push("/program");
            } else {
                // Handle other statuses if needed (e.g., 2FA)
                setErr("Sign in not complete. Please try again.");
            }
        } catch (e2) {
            setErr(safeErr(e2));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="bg-black h-[100dvh] overflow-hidden">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute -top-32 right-10 h-[440px] w-[440px] rounded-full bg-blue-500/14 blur-3xl" />
                <div className="absolute bottom-10 left-10 h-[420px] w-[420px] rounded-full bg-purple-500/14 blur-3xl" />
            </div>

            {/* Layout that never overlaps a fixed navbar */}
            <div className="relative h-full grid grid-rows-[var(--nav-h,80px)_1fr_40px] px-4 sm:px-6 lg:px-10">
                <div />

                <div className="flex items-center justify-center">
                    <div className="w-full max-w-[520px]">
                        <div className="bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.55)] rounded-2xl p-5 sm:p-6 overflow-hidden">
                            <div className="mb-5">
                                <h1 className="text-white text-xl sm:text-2xl font-semibold">
                                    Welcome back
                                </h1>
                                <p className="text-white/70 text-sm sm:text-base mt-1">
                                    Sign in to your account to continue.
                                </p>
                            </div>

                            {err ? (
                                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {err}
                                </div>
                            ) : null}

                            {!isLoaded ? (
                                <div className="text-white/70 text-sm">Loading…</div>
                            ) : (
                                <form onSubmit={submitLogin} className="space-y-4">
                                    <div>
                                        <label className="block text-white/70 text-sm mb-2">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={form.emailAddress}
                                            onChange={onChange("emailAddress")}
                                            className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none focus:border-white/20"
                                            placeholder="you@example.com"
                                            autoComplete="email"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-white/70 text-sm mb-2">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={form.password}
                                            onChange={onChange("password")}
                                            className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none focus:border-white/20"
                                            placeholder="Enter your password"
                                            autoComplete="current-password"
                                            required
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={!canSubmit || loading}
                                        className={[
                                            "w-full rounded-xl py-3 font-medium",
                                            "bg-white text-black hover:bg-white/90",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                        ].join(" ")}
                                    >
                                        {loading ? "Signing in…" : "Sign in"}
                                    </button>

                                    <div className="text-sm text-white/60">
                                        Don't have an account?{" "}
                                        <a
                                            href="/signup"
                                            className="text-white hover:text-white/80 underline underline-offset-4"
                                        >
                                            Create one
                                        </a>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                <div />
            </div>
        </main>
    );
}