// page.js
"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-white/75">
      {children}
    </span>
  )
}

function Kpi({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white tracking-tight">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/55">{sub}</div> : null}
    </div>
  )
}

function SectionHeader({ eyebrow, title, desc, dark }) {
  return (
    <div className={`max-w-2xl ${dark ? "text-white" : "text-black"}`}>
      <div className={`text-sm font-semibold ${dark ? "text-white/60" : "text-black/55"}`}>{eyebrow}</div>
      <h2 className={`mt-3 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight ${dark ? "text-white" : "text-black"}`}>
        {title}
      </h2>
      <p className={`mt-4 text-base sm:text-lg leading-relaxed ${dark ? "text-white/70" : "text-black/70"}`}>{desc}</p>
    </div>
  )
}

function Feature({ title, desc, bullets }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-7 shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
      <h3 className="text-xl font-semibold tracking-tight text-black">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-black/70">{desc}</p>

      {bullets?.length ? (
        <ul className="mt-5 space-y-2 text-sm text-black/70">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-black/25" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 h-px bg-gradient-to-r from-black/0 via-black/10 to-black/0" />
      <div className="mt-5 text-sm text-black/60">Learn more →</div>
    </div>
  )
}

function PricingCard({ name, price, period, desc, bullets, popular, cta }) {
  return (
    <div
      className={[
        "relative rounded-3xl border p-7 backdrop-blur-xl",
        popular ? "border-white/20 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.55)]" : "border-white/10 bg-white/5",
      ].join(" ")}
    >
      {popular ? (
        <div className="absolute -top-3 left-7">
          <Pill>Most popular</Pill>
        </div>
      ) : null}

      <div>
        <div className="text-lg font-semibold text-white">{name}</div>
        <div className="mt-1 text-sm text-white/70">{desc}</div>
      </div>

      <div className="mt-6 flex items-end gap-2">
        <div className="text-4xl font-bold text-white tracking-tight">{price}</div>
        <div className="pb-1 text-sm text-white/70">{period}</div>
      </div>

      <Link
        href="/signup"
        className={[
          "mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition",
          popular ? "bg-white text-black hover:bg-white/90" : "bg-white/10 text-white hover:bg-white/15 border border-white/15",
        ].join(" ")}
      >
        {cta}
      </Link>

      <ul className="mt-7 space-y-3 text-sm text-white/75">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 border border-white/10">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FAQ({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4">
      <button
        className="w-full flex items-start justify-between gap-4 text-left"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
      >
        <div className="text-sm md:text-base font-semibold text-white">{q}</div>
        <div
          className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition ${open ? "rotate-45" : "rotate-0"
            }`}
          aria-hidden="true"
        >
          <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </button>

      <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0"}`}>
        <div className="overflow-hidden text-sm text-white/70 leading-relaxed">{a}</div>
      </div>
    </div>
  )
}

export default function Home() {
  const features = useMemo(
    () => [
      {
        title: "Profit and margin analytics",
        desc: "Understand exactly what you are making after fees, postage, returns, and cost of goods.",
        bullets: ["True profit per sale", "Margin by category and platform", "Trends over time"],
      },
      {
        title: "Best and worst performers",
        desc: "See which products move fast, which are slow, and where your cash is tied up.",
        bullets: ["Top movers and slow movers", "Sell-through rate", "Time-to-sell insights"],
      },
      {
        title: "Inventory management that stays tidy",
        desc: "Track every item from purchase to sale with consistent fields and easy filtering.",
        bullets: ["Statuses: in-hand, listed, sold, returned", "Locations and notes", "CSV import and export"],
      },
    ],
    []
  )

  const pricing = useMemo(
    () => [
      {
        name: "Free",
        price: "£0",
        period: "/month",
        desc: "For getting started and staying organised.",
        bullets: ["Basic inventory tracking", "Profit per sale (manual fees)", "Limited analytics", "CSV export"],
        popular: false,
        cta: "Start free",
      },
      {
        name: "Premium",
        price: "£19",
        period: "/month",
        desc: "For serious resellers who want insight and speed.",
        bullets: ["Advanced analytics and trends", "Best and worst performers", "Sell-through and time-to-sell", "Stock alerts (coming soon)", "Priority support"],
        popular: true,
        cta: "Start free trial",
      },
    ],
    []
  )

  const faqs = useMemo(
    () => [
      { q: "What platforms does this support?", a: "You can track sales from any platform. Platform-specific automation can be added later, but the core tracking works for everything." },
      { q: "Does profit include fees and shipping?", a: "Yes. You can record fees, shipping, returns, and extra costs so true profit is accurate." },
      { q: "Can I import my spreadsheet?", a: "Yes. CSV import and export makes it easy to migrate and back up." },
      { q: "Is there a free trial?", a: "Yes. Premium includes a free trial so you can test the analytics before paying." },
      { q: "Can I cancel anytime?", a: "Yes. You can cancel at any time." },
    ],
    []
  )

  return (
    <main className="bg-black">
      {/* HERO */}
      <section id="home" className="relative min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0">
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 h-[640px] w-[640px] rounded-full bg-blue-500/16 blur-3xl" />
          <div className="absolute top-24 left-10 h-[420px] w-[420px] rounded-full bg-purple-500/14 blur-3xl" />
          <div className="absolute bottom-10 right-10 h-[520px] w-[520px] rounded-full bg-white/10 blur-3xl" />
        </div>

        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(circle at 50% 30%, black 48%, transparent 76%)",
            WebkitMaskImage: "radial-gradient(circle at 50% 30%, black 48%, transparent 76%)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-28 sm:pt-32 pb-10 min-h-[100svh] flex items-center">
          <div className="w-full grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6">
              <div className="flex flex-wrap gap-2">
                <Pill>Analytics</Pill>
                <Pill>Inventory</Pill>
                <Pill>True profit</Pill>
              </div>

              <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.05]">
                A reselling platform that shows
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-purple-300 to-white">
                  what is actually making you money
                </span>
              </h1>

              <p className="mt-5 text-base sm:text-lg text-white/70 leading-relaxed max-w-xl">
                Track inventory, sales, and costs — then get clear insights into your best and worst products, margins, and sell-through.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-black hover:bg-white/90 transition shadow-[0_18px_55px_rgba(255,255,255,0.12)]"
                >
                  Get started →
                </Link>
                <a
                  href="#how"
                  onClick={(e) => {
                    e.preventDefault()
                    document.querySelector("#how")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition"
                >
                  See how it works
                </a>
              </div>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                <Kpi label="Revenue (30 days)" value="£4,285" sub="+23% vs last month" />
                <Kpi label="Net profit (30 days)" value="£1,914" sub="After fees and shipping" />
                <Kpi label="Sell-through" value="47%" sub="7-day rolling" />
              </div>

              <div className="mt-8 text-xs text-white/55">No card needed for trial • Cancel anytime</div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative">
                <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-blue-400/14 via-purple-400/10 to-white/6 blur-2xl" />
                <div className="relative rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Analytics preview</div>
                    <div className="text-xs text-white/60">Last 30 days</div>
                  </div>

                  <div className="mt-5 grid sm:grid-cols-3 gap-4">
                    {[
                      { l: "Top product", v: "£312", s: "Nike Dunk Low" },
                      { l: "Worst performer", v: "£-18", s: "Return-heavy" },
                      { l: "Avg margin", v: "44.7%", s: "After fees" },
                    ].map((x) => (
                      <div key={x.l} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="text-xs text-white/60">{x.l}</div>
                        <div className="mt-1 text-2xl font-semibold text-white">{x.v}</div>
                        <div className="mt-2 text-xs text-white/60">{x.s}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white/60">Best and worst</div>
                      <div className="text-xs text-white/60">7 days</div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {[
                        { name: "Nike Dunk Low", profit: "£62", tag: "Best" },
                        { name: "Console Bundle", profit: "£88", tag: "Best" },
                        { name: "Vintage Jacket", profit: "£-6", tag: "Worst" },
                      ].map((row) => (
                        <div key={row.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-sm text-white">{row.name}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-white">{row.profit}</div>
                            <span className="text-[11px] rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/70">
                              {row.tag}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="absolute -top-4 -right-4 rounded-2xl border border-blue-200/20 bg-blue-500/12 backdrop-blur px-4 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.4)]">
                  <div className="text-xs text-white/70">Insight</div>
                  <div className="text-sm font-semibold text-white">4 slow movers</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-7 left-1/2 -translate-x-1/2">
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault()
              document.querySelector("#features")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
            className="group inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
          >
            <span>Scroll</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 group-hover:bg-white/10 transition">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M12 19l-6-6M12 19l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </a>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-white py-20 sm:py-28 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeader
            eyebrow="Features"
            title="Analytics that tell you what to do next"
            desc="Get clarity on what sells, what sits, and where your profit is coming from — without digging through spreadsheets."
          />

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {features.map((f) => (
              <Feature key={f.title} title={f.title} desc={f.desc} bullets={f.bullets} />
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-black py-20 sm:py-28 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeader
            dark
            eyebrow="How it works"
            title="A clean workflow with a simple dashboard"
            desc="Add inventory, record sales, then review insights. Keep your data tidy and your decisions fast."
          />

          <div className="mt-12 grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 grid gap-4">
              {[
                { n: "01", t: "Add inventory", d: "Log purchases with cost, condition, and location so everything is traceable." },
                { n: "02", t: "Record sales", d: "Enter sale price, fees, shipping, returns, and extras for true profit." },
                { n: "03", t: "Get insights", d: "See best and worst products, sell-through, time-to-sell, and trends." },
              ].map((s) => (
                <div key={s.n} className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-6">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80">
                      {s.n}
                    </div>
                    <div>
                      <div className="text-base font-semibold text-white">{s.t}</div>
                      <div className="mt-1 text-sm text-white/70">{s.d}</div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition"
                >
                  Start free trial →
                </Link>
                <a
                  href="#pricing"
                  onClick={(e) => {
                    e.preventDefault()
                    document.querySelector("#pricing")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
                >
                  View pricing
                </a>
              </div>
            </div>

            <div className="lg:col-span-7">
              {/* Replace this with your real demo video or app screenshot later */}
              <div className="relative">
                <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-blue-400/14 via-purple-400/10 to-white/6 blur-2xl" />
                <div className="relative rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div className="text-sm font-semibold text-white">Demo</div>
                    <div className="text-xs text-white/60">Analytics and inventory</div>
                  </div>

                  <div className="p-5">
                    <div className="rounded-2xl border border-white/10 bg-black/25 overflow-hidden">
                      <video
                        className="w-full h-auto block"
                        controls
                        playsInline
                        preload="metadata"
                        poster="/demo-poster.png"
                      >
                        <source src="/demo.mp4" type="video/mp4" />
                      </video>
                    </div>

                    <div className="mt-4 grid sm:grid-cols-3 gap-3">
                      {[
                        { l: "Inventory view", v: "Statuses + filters" },
                        { l: "Analytics view", v: "Best and worst" },
                        { l: "Exports", v: "CSV ready" },
                      ].map((x) => (
                        <div key={x.l} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                          <div className="text-xs text-white/60">{x.l}</div>
                          <div className="mt-2 text-sm font-semibold text-white">{x.v}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 text-xs text-white/55">
                      Swap <span className="text-white/80 font-semibold">/demo.mp4</span> and <span className="text-white/80 font-semibold">/demo-poster.png</span> with your real assets when ready.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative overflow-hidden py-20 sm:py-28 bg-black scroll-mt-24">
        <div className="absolute inset-0">
          <div className="absolute -top-32 right-10 h-[440px] w-[440px] rounded-full bg-blue-500/14 blur-3xl" />
          <div className="absolute bottom-10 left-10 h-[420px] w-[420px] rounded-full bg-purple-500/14 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-sm font-semibold text-white/60">Pricing</div>
            <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white">
              Simple pricing
            </h2>
            <p className="mt-4 text-white/70 leading-relaxed">
              Start free, then upgrade for deeper analytics and performance insights.
            </p>
          </div>

          <div className="mt-10 max-w-3xl mx-auto">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Free trial on Premium</div>
                <div className="text-sm text-white/70">Try Premium analytics before paying.</div>
              </div>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-black bg-white hover:bg-white/90 transition"
              >
                Start free trial →
              </Link>
            </div>
          </div>

          <div className="mt-10 grid lg:grid-cols-2 gap-6 items-stretch max-w-5xl mx-auto">
            {pricing.map((p) => (
              <PricingCard key={p.name} {...p} />
            ))}
          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { t: "Cancel anytime", d: "Simple monthly plans with no lock-in." },
              { t: "Data ownership", d: "CSV exports whenever you need them." },
              { t: "Support", d: "Quick replies and product-led improvements." },
            ].map((x) => (
              <div key={x.t} className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-6">
                <div className="text-sm font-semibold text-white">{x.t}</div>
                <div className="mt-2 text-sm text-white/70">{x.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faqs" className="bg-black py-20 sm:py-28 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeader dark eyebrow="FAQs" title="Quick answers" desc="If you have a question that is not listed here, send a message." />
          <div className="mt-10 grid lg:grid-cols-2 gap-4">
            {faqs.map((f) => (
              <FAQ key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="bg-white py-20 sm:py-28 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeader eyebrow="Contact" title="Talk to us" desc="Want a demo, have a question, or want to suggest a feature? Send a message." />

          <div className="mt-12 grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 grid gap-4">
              {[
                { t: "Fast response", d: "Typically within 24 hours." },
                { t: "Feature feedback", d: "Built around what resellers actually need." },
                { t: "Partnerships", d: "Interested in collaborating? Let us know." },
              ].map((x) => (
                <div key={x.t} className="rounded-3xl border border-black/10 bg-black/[0.03] p-6">
                  <div className="text-sm font-semibold text-black">{x.t}</div>
                  <div className="mt-2 text-sm text-black/70">{x.d}</div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-[28px] border border-black/10 bg-white p-7 shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
                <div className="text-sm font-semibold text-black">Send a message</div>
                <div className="mt-1 text-sm text-black/60">Placeholder form for now.</div>

                <form className="mt-6 grid gap-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-black/70">Name</span>
                      <input
                        className="h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/30"
                        placeholder="Your name"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-black/70">Email</span>
                      <input
                        className="h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/30"
                        placeholder="you@example.com"
                        type="email"
                      />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-black/70">Subject</span>
                    <input
                      className="h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/30"
                      placeholder="What is this about?"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-black/70">Message</span>
                    <textarea
                      className="min-h-[140px] rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-black/30 resize-none"
                      placeholder="Tell us what you need..."
                    />
                  </label>

                  <button
                    type="button"
                    className="mt-2 inline-flex items-center justify-center rounded-2xl bg-black px-6 py-3.5 text-sm font-semibold text-white hover:bg-black/90 transition"
                  >
                    Send message
                  </button>

                  <div className="text-xs text-black/50">By sending this, you agree to be contacted about your enquiry.</div>
                </form>
              </div>
            </div>
          </div>

          <footer className="mt-14 border-t border-black/10 pt-8 text-black/60">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="text-sm">
                <span className="text-black font-semibold">ResellTracker</span>
                <span className="ml-2 text-black/60">© {new Date().getFullYear()}</span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <a href="#home" className="hover:text-black transition">Home</a>
                <a href="#features" className="hover:text-black transition">Features</a>
                <a href="#pricing" className="hover:text-black transition">Pricing</a>
                <a href="#faqs" className="hover:text-black transition">FAQs</a>
                <a href="#contact" className="hover:text-black transition">Contact</a>
              </div>
            </div>
          </footer>
        </div>
      </section>
    </main>
  )
}
