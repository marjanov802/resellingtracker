// app/signup/page.jsx
"use client";

import { useMemo, useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
    const router = useRouter();
    const { isLoaded, signUp, setActive } = useSignUp();

    const [step, setStep] = useState("details"); // details | verify
    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        emailAddress: "",
        password: "",
        confirmPassword: "",
    });
    const [code, setCode] = useState("");

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const passwordsMatch = form.password === form.confirmPassword;
    const passwordLongEnough = form.password.length >= 8;

    const canSubmitDetails = useMemo(() => {
        return (
            form.firstName.trim().length > 0 &&
            form.emailAddress.trim().length > 0 &&
            passwordLongEnough &&
            passwordsMatch
        );
    }, [form, passwordLongEnough, passwordsMatch]);

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

    const submitDetails = async (e) => {
        e.preventDefault();
        if (!isLoaded || loading) return;

        if (!passwordsMatch) {
            setErr("Passwords do not match");
            return;
        }

        if (!passwordLongEnough) {
            setErr("Password must be at least 8 characters");
            return;
        }

        setLoading(true);
        setErr("");

        try {
            await signUp.create({
                firstName: form.firstName,
                lastName: form.lastName || undefined,
                emailAddress: form.emailAddress,
                password: form.password,
            });

            // email verification
            await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
            setStep("verify");
        } catch (e2) {
            setErr(safeErr(e2));
        } finally {
            setLoading(false);
        }
    };

    const submitCode = async (e) => {
        e.preventDefault();
        if (!isLoaded || loading) return;

        setLoading(true);
        setErr("");

        try {
            const res = await signUp.attemptEmailAddressVerification({ code });

            if (res.status === "complete") {
                await setActive({ session: res.createdSessionId });
                router.push("/onboarding");
            } else {
                setErr("Verification not complete. Try again.");
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
                                    {step === "details" ? "Create your account" : "Verify your email"}
                                </h1>
                                <p className="text-white/70 text-sm sm:text-base mt-1">
                                    {step === "details"
                                        ? "Enter your details to get started."
                                        : `We sent a code to ${form.emailAddress}`}
                                </p>
                            </div>

                            {err ? (
                                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {err}
                                </div>
                            ) : null}

                            {!isLoaded ? (
                                <div className="text-white/70 text-sm">Loading…</div>
                            ) : step === "details" ? (
                                <form onSubmit={submitDetails} className="space-y-4">
                                    {/* Name fields */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-white/70 text-sm mb-2">
                                                First name
                                            </label>
                                            <input
                                                type="text"
                                                value={form.firstName}
                                                onChange={onChange("firstName")}
                                                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none focus:border-white/20"
                                                placeholder="John"
                                                autoComplete="given-name"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-white/70 text-sm mb-2">
                                                Last name
                                            </label>
                                            <input
                                                type="text"
                                                value={form.lastName}
                                                onChange={onChange("lastName")}
                                                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none focus:border-white/20"
                                                placeholder="Doe"
                                                autoComplete="family-name"
                                            />
                                        </div>
                                    </div>

                                    {/* Email */}
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

                                    {/* Password */}
                                    <div>
                                        <label className="block text-white/70 text-sm mb-2">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={form.password}
                                            onChange={onChange("password")}
                                            className={[
                                                "w-full rounded-xl bg-white/5 border text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none",
                                                form.password.length > 0 && !passwordLongEnough
                                                    ? "border-red-500/50 focus:border-red-500/70"
                                                    : "border-white/10 focus:border-white/20"
                                            ].join(" ")}
                                            placeholder="At least 8 characters"
                                            autoComplete="new-password"
                                            minLength={8}
                                            required
                                        />
                                    </div>

                                    {/* Confirm Password */}
                                    <div>
                                        <label className="block text-white/70 text-sm mb-2">
                                            Confirm password
                                        </label>
                                        <input
                                            type="password"
                                            value={form.confirmPassword}
                                            onChange={onChange("confirmPassword")}
                                            className={[
                                                "w-full rounded-xl bg-white/5 border text-white placeholder:text-white/40 px-4 py-3 text-[16px] outline-none",
                                                form.confirmPassword.length > 0 && !passwordsMatch
                                                    ? "border-red-500/50 focus:border-red-500/70"
                                                    : "border-white/10 focus:border-white/20"
                                            ].join(" ")}
                                            placeholder="Re-enter your password"
                                            autoComplete="new-password"
                                            required
                                        />
                                        {form.confirmPassword.length > 0 && !passwordsMatch && (
                                            <p className="mt-2 text-xs text-red-400">
                                                Passwords do not match
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={!canSubmitDetails || loading}
                                        className={[
                                            "w-full rounded-xl py-3 font-medium",
                                            "bg-white text-black hover:bg-white/90",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                        ].join(" ")}
                                    >
                                        {loading ? "Creating account…" : "Create account"}
                                    </button>

                                    <div className="text-sm text-white/60">
                                        Already have an account?{" "}
                                        <a
                                            href="/login"
                                            className="text-white hover:text-white/80 underline underline-offset-4"
                                        >
                                            Sign in
                                        </a>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={submitCode} className="space-y-4">
                                    <div>
                                        <label className="block text-white/70 text-sm mb-2">
                                            Verification code
                                        </label>
                                        <input
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
                                        disabled={loading || code.trim().length === 0}
                                        className={[
                                            "w-full rounded-xl py-3 font-medium",
                                            "bg-white text-black hover:bg-white/90",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                        ].join(" ")}
                                    >
                                        {loading ? "Verifying…" : "Verify and continue"}
                                    </button>

                                    <div className="flex flex-wrap items-center gap-3 text-sm">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!isLoaded || loading) return;
                                                setLoading(true);
                                                setErr("");
                                                try {
                                                    await signUp.prepareEmailAddressVerification({
                                                        strategy: "email_code",
                                                    });
                                                } catch (e2) {
                                                    setErr(safeErr(e2));
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            className="text-white/80 hover:text-white underline underline-offset-4"
                                        >
                                            Resend code
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setErr("");
                                                setCode("");
                                                setStep("details");
                                            }}
                                            className="text-white/60 hover:text-white/80 underline underline-offset-4"
                                        >
                                            Change email
                                        </button>
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