import React from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../components/CoachAvatar";

const plans = [
  {
    name: "Free",
    price: "$0",
    cadence: "/ forever",
    tone: "Start here and build a daily habit.",
    accent: "var(--lv-surface-muted)",
    border: "var(--lv-border)",
    ctaLabel: "Current baseline",
    ctaStyle: "secondary",
    features: [
      "Limited AI coaching sessions",
      "Basic pronunciation support",
      "Standard community matching",
      "Core practice tools",
    ],
  },
  {
    name: "Premium",
    price: "$12.99",
    cadence: "/ month",
    tone: "Built for learners who want faster improvement.",
    accent: "rgba(236,177,208,0.22)",
    border: "rgba(236,177,208,0.5)",
    badge: "Best value",
    ctaLabel: "Start 7-day free trial",
    ctaStyle: "primary",
    features: [
      "Unlimited AI coaching",
      "Detailed pronunciation feedback",
      "Weekly personalized study plans",
      "Priority partner matching",
    ],
  },
];

const rows = [
  ["AI coaching", "Limited daily sessions", "Unlimited sessions"],
  ["Pronunciation feedback", "Basic", "Detailed with drill guidance"],
  ["Study plans", "No", "Weekly personalized recommendations"],
  ["Matching", "Standard visibility", "Priority discovery"],
  ["Support", "Standard", "Priority"],
];

export default function ComparePlansPage() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(236,177,208,0.18),_transparent_28%),linear-gradient(180deg,_var(--lv-background)_0%,_#eef4f7_100%)] px-3 py-4 sm:px-5 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-[32px] bg-[var(--lv-navy)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(8,19,32,0.22)] sm:px-8 sm:py-9">
          <div className="absolute -right-16 top-4 h-56 w-56 rounded-full bg-[rgba(236,177,208,0.2)] blur-3xl" />
          <div className="absolute left-0 top-0 h-48 w-48 rounded-full bg-[rgba(27,127,121,0.2)] blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lv-blush)]">
                Compare Plans
              </div>
              <div className="mt-5">
                <CoachAvatar size={68} hideBadge />
              </div>
              <h1 className="mt-4 font-['Sora'] text-3xl font-bold leading-tight sm:text-5xl">
                Choose the plan that fits how seriously you want to learn.
              </h1>
              <p className="mt-4 text-sm leading-7 text-[rgba(245,247,251,0.82)] sm:max-w-2xl sm:text-base">
                Free keeps LangVoyage accessible. Premium gives committed learners more feedback,
                more repetitions, and a clearer path to progress.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/premium"
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[var(--lv-navy)] transition hover:bg-[var(--lv-surface-muted)]"
              >
                Back to premium
              </Link>
              <button
                type="button"
                className="rounded-2xl px-5 py-3 text-sm font-semibold text-[var(--lv-navy)] transition hover:brightness-[0.98]"
                style={{ backgroundColor: "var(--lv-blush)" }}
              >
                Start Premium
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className="rounded-[30px] border bg-[var(--lv-surface)] p-6 shadow-sm"
              style={{ borderColor: plan.border, boxShadow: `0 16px 40px ${plan.accent}` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--lv-link)]">
                    {plan.name} Plan
                  </p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-['Sora'] text-4xl font-bold text-[var(--lv-text)]">
                      {plan.price}
                    </span>
                    <span className="pb-1 text-sm text-[var(--lv-muted-text)]">{plan.cadence}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--lv-muted-text)]">{plan.tone}</p>
                </div>
                {plan.badge ? (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--lv-navy)]"
                    style={{ backgroundColor: "var(--lv-blush)" }}
                  >
                    {plan.badge}
                  </span>
                ) : null}
              </div>

              <div className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-3 rounded-2xl bg-[var(--lv-surface-muted)] px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
                      style={{
                        backgroundColor:
                          plan.name === "Premium" ? "var(--lv-blush)" : "rgba(27,127,121,0.14)",
                        color: "var(--lv-navy)",
                      }}
                    >
                      {plan.name === "Premium" ? "P" : "F"}
                    </div>
                    <span className="text-sm font-medium text-[var(--lv-text)]">{feature}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="mt-6 w-full rounded-2xl px-5 py-3 text-sm font-semibold transition"
                style={
                  plan.ctaStyle === "primary"
                    ? { backgroundColor: "var(--lv-blush)", color: "var(--lv-navy)" }
                    : {
                        backgroundColor: "var(--lv-surface)",
                        color: "var(--lv-text)",
                        border: "1px solid var(--lv-border)",
                      }
                }
              >
                {plan.ctaLabel}
              </button>
            </article>
          ))}
        </section>

        <section className="rounded-[28px] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--lv-muted-text)]">
                Detailed Comparison
              </p>
              <h2 className="mt-2 font-['Sora'] text-2xl font-bold text-[var(--lv-text)]">
                Where Premium pulls ahead.
              </h2>
            </div>
            <p className="text-sm text-[var(--lv-muted-text)]">
              The pink accent marks Premium-focused actions and emphasis.
            </p>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--lv-border)]">
            <div className="grid grid-cols-[1.1fr_0.7fr_0.9fr] bg-[var(--lv-surface-muted)] px-4 py-4 text-xs font-bold uppercase tracking-wide text-[var(--lv-muted-text)] sm:px-6">
              <div>Feature</div>
              <div className="text-center">Free</div>
              <div className="text-center text-[var(--lv-danger)]">Premium</div>
            </div>
            {rows.map(([label, free, premium], index) => (
              <div
                key={label}
                className={`grid grid-cols-[1.1fr_0.7fr_0.9fr] px-4 py-4 sm:px-6 ${
                  index !== rows.length - 1 ? "border-t border-[var(--lv-border)]" : ""
                }`}
              >
                <div className="pr-3 text-sm font-medium text-[var(--lv-text)]">{label}</div>
                <div className="text-center text-sm text-[var(--lv-muted-text)]">{free}</div>
                <div className="text-center text-sm font-semibold text-[var(--lv-danger)]">{premium}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
