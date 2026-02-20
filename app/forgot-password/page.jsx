// app/forgot-password/page.jsx
"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const { isLoaded, signIn, setActive } = useSignIn();

    // Steps: "email" | "code" | "newPassword"
    const [step, setStep] = useState("email");

    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const safeErr = (e) => {
        const msg =
            e?.errors?.[0]?.longMessage ||
            e?.errors?.[0]?.message ||
            e?.message ||
            "Something went wrong";
        return msg;
    };

    // Step 1: Send reset code
    const submitEmail = async (e) => {
        e.preventDefault();
        if (!isLoaded || loading) return;

        if (!email.trim()) {
            setErr("Please enter your email address");
            return;
        }

        setLoading(true);
        setErr("");

        try {
            await signIn.create({
                strategy: "reset_password_email_code",
                identifier: email,
            });

            setStep("code");
            setSuccessMsg(`We sent a code to ${email}`);
        } catch (e2) {
            setErr(safeErr(e2));
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Verify code
    const submitCode = async (e) => {
        e.preventDefault();
        if (!isLoaded || loading) return;

        if (!code.trim()) {
            setErr("Please enter the verification code");
            return;
        }

        setLoading(true);
        setErr("");

        try {
            const res = await signIn.attemptFirstFactor({
                strategy: "reset_password_email_code",
                code: code,
            });

            if (res.status === "needs_new_password") {
                setStep("newPassword");
                setSuccessMsg("");
            } else {
                setErr("Unexpected status. Please try again.");
            }
        } catch (e2) {
            setErr(safeErr(e2));
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Set new password
    const submitNewPassword = async (e) => {
        e.preventDefault();
        if (!isLoaded || loading) return;

        if (newPassword.length < 8) {
            setErr("Password must be at least 8 characters");
            return;
        }

        if (newPassword !== confirmPassword) {
            setErr("Passwords do not match");
            return;
        }

        setLoading(true);
        setErr("");

        try {
            const res = await signIn.resetPassword({
                password: newPassword,
            });

            if (res.status === "complete") {
                await setActive({ session: res.createdSessionId });
                router.push("/program");
            } else {
                setErr("Password reset not complete. Please try again.");
            }
        } catch (e2) {
            setErr(safeErr(e2));
        } finally {
            setLoading(false);
        }
    };

    // Resend code
    const resendCode = async () => {
        if (!isLoaded || loading) return;

        setLoading(true);
        setErr("");

        try {
            await signIn.create({
                strategy: "reset_password_email_code",
                identifier: email,
            });
            setSuccessMsg("Code resent! Check your inbox.");
        } catch (e2) {
            setErr(safeErr(e2));
        } finally {
            setLoading(false);
        }
    };

    // Render content based on step
    const renderContent = () => {
        if (!isLoaded) {
            return <div className="text-white/70 text-sm">Loading…</div>;
        }

        // STEP 1: Enter email
        if (step === "email") {
            return (
                <>
                    <div className="mb-5">
                        <h1 className="text-white text-xl sm:text-2xl font-semibold">
                            Reset your password
                        </h1>
                        <p className="text-white/70 text-sm sm:text-base mt-1">
                            Enter your email and we'll send you a code to reset your password.
                        </p>
                    </div>

                    {err && (
                        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {err}
                        </div>
                    )}

                    <form onSubmit={submitEmail} className="space-y-4">
                        <div>
                            <label className="block text-white/70 text-sm mb-2">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setErr("");
                                    setEmail(e.target.value);
                                }}
                                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none focus:border-white/20"
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className="w-full rounded-xl py-3 font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Sending…" : "Send reset code"}
                        </button>

                        <Link
                            href="/login"
                            className="block w-full text-center text-sm text-white/60 hover:text-white transition"
                        >
                            ← Back to sign in
                        </Link>
                    </form>
                </>
            );
        }

        // STEP 2: Enter code
        if (step === "code") {
            return (
                <>
                    <div className="mb-5">
                        <h1 className="text-white text-xl sm:text-2xl font-semibold">
                            Check your email
                        </h1>
                        <p className="text-white/70 text-sm sm:text-base mt-1">
                            {successMsg || `Enter the code we sent to ${email}`}
                        </p>
                    </div>

                    {err && (
                        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {err}
                        </div>
                    )}

                    <form onSubmit={submitCode} className="space-y-4">
                        <div>
                            <label className="block text-white/70 text-sm mb-2">
                                Verification code
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={code}
                                onChange={(e) => {
                                    setErr("");
                                    setCode(e.target.value);
                                }}
                                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none focus:border-white/20 tracking-widest"
                                placeholder="123456"
                                required
                            />
                            <p className="mt-2 text-xs text-white/50">
                                Check your inbox (and spam folder).
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !code.trim()}
                            className="w-full rounded-xl py-3 font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Verifying…" : "Verify code"}
                        </button>

                        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                            <button
                                type="button"
                                onClick={resendCode}
                                disabled={loading}
                                className="text-white/60 hover:text-white transition"
                            >
                                Resend code
                            </button>
                            <Link
                                href="/login"
                                className="text-white/60 hover:text-white transition"
                            >
                                Back to sign in
                            </Link>
                        </div>
                    </form>
                </>
            );
        }

        // STEP 3: Set new password
        if (step === "newPassword") {
            const passwordsMatch = newPassword === confirmPassword;
            const passwordLongEnough = newPassword.length >= 8;

            return (
                <>
                    <div className="mb-5">
                        <h1 className="text-white text-xl sm:text-2xl font-semibold">
                            Set new password
                        </h1>
                        <p className="text-white/70 text-sm sm:text-base mt-1">
                            Choose a new password for your account.
                        </p>
                    </div>

                    {err && (
                        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {err}
                        </div>
                    )}

                    <form onSubmit={submitNewPassword} className="space-y-4">
                        <div>
                            <label className="block text-white/70 text-sm mb-2">
                                New password
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => {
                                    setErr("");
                                    setNewPassword(e.target.value);
                                }}
                                className={[
                                    "w-full rounded-xl bg-white/5 border text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none",
                                    newPassword.length > 0 && !passwordLongEnough
                                        ? "border-red-500/50 focus:border-red-500/70"
                                        : "border-white/10 focus:border-white/20"
                                ].join(" ")}
                                placeholder="At least 8 characters"
                                autoComplete="new-password"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-white/70 text-sm mb-2">
                                Confirm new password
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => {
                                    setErr("");
                                    setConfirmPassword(e.target.value);
                                }}
                                className={[
                                    "w-full rounded-xl bg-white/5 border text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none",
                                    confirmPassword.length > 0 && !passwordsMatch
                                        ? "border-red-500/50 focus:border-red-500/70"
                                        : "border-white/10 focus:border-white/20"
                                ].join(" ")}
                                placeholder="Re-enter your password"
                                autoComplete="new-password"
                                required
                            />
                            {confirmPassword.length > 0 && !passwordsMatch && (
                                <p className="mt-2 text-xs text-red-400">
                                    Passwords do not match
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !passwordLongEnough || !passwordsMatch}
                            className="w-full rounded-xl py-3 font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Updating…" : "Update password"}
                        </button>
                    </form>
                </>
            );
        }

        return null;
    };

    return (
        <main className="bg-black h-[100dvh] overflow-hidden">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute -top-32 right-10 h-[440px] w-[440px] rounded-full bg-blue-500/14 blur-3xl" />
                <div className="absolute bottom-10 left-10 h-[420px] w-[420px] rounded-full bg-purple-500/14 blur-3xl" />
            </div>

            {/* Layout */}
            <div className="relative h-full grid grid-rows-[var(--nav-h,80px)_1fr_40px] px-4 sm:px-6 lg:px-10">
                <div />

                <div className="flex items-center justify-center">
                    <div className="w-full max-w-[520px]">
                        <div className="bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.55)] rounded-2xl p-5 sm:p-6 overflow-hidden">
                            {renderContent()}
                        </div>
                    </div>
                </div>

                <div />
            </div>
        </main>
    );
}