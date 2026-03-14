import React from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../components/CoachAvatar";

const features = [
  {
    title: "Unlimited AI coaching",
    description:
      "Unlock longer Lumi sessions, smarter follow-up prompts, and deeper conversation practice.",
  },
  {
    title: "Detailed pronunciation feedback",
    description:
      "Get more precise speaking corrections, replay drills, and confidence-building guidance.",
  },
  {
    title: "Personalized study plans",
    description:
      "Receive weekly recommendations and structured practice paths tailored to your level.",
  },
  {
    title: "Priority matching",
    description:
      "Reach more relevant language partners faster with better discovery and visibility.",
  },
];

const reasons = [
  "AI conversations and speech feedback are the most expensive features to run well.",
  "Premium helps fund safer moderation, faster product improvements, and better coaching quality.",
  "A paid tier lets LangVoyage keep a strong free experience while giving serious learners more power.",
];

const comparison = [
  ["Daily AI practice", "Limited", "Unlimited"],
  ["Pronunciation analysis", "Basic", "Detailed"],
  ["Partner discovery", "Standard", "Priority"],
  ["Study plans", "No", "Yes"],
];

const PremiumPage = () => {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(27,127,121,0.16),_transparent_30%),linear-gradient(180deg,_var(--lv-background)_0%,_#eef4f7_100%)] px-3 py-4 sm:px-5 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-[32px] bg-[var(--lv-navy)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(8,19,32,0.22)] sm:px-8 sm:py-9">
          <div className="absolute -right-10 top-0 h-52 w-52 rounded-full bg-[rgba(27,127,121,0.28)] blur-3xl" />
          <div className="absolute -left-8 bottom-0 h-44 w-44 rounded-full bg-[rgba(236,177,208,0.22)] blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.35fr_0.85fr] lg:items-end">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lv-link)]">
                LangVoyage Premium
              </div>
              <div className="mt-5">
                <CoachAvatar size={68} hideBadge />
              </div>
              <h1 className="mt-4 max-w-2xl font-['Sora'] text-3xl font-bold leading-tight sm:text-5xl">
                Learn with more depth, speed, and support.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[rgba(245,247,251,0.82)] sm:text-base">
                Premium is designed for learners who want stronger coaching, more speaking reps,
                and a faster path to real-world confidence.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[var(--lv-navy)] transition hover:bg-[var(--lv-surface-muted)]"
                >
                  Start 7-day free trial
                </button>
                <Link
                  to="/premium/compare"
                  className="rounded-2xl px-5 py-3 text-sm font-semibold transition hover:brightness-[0.98]"
                  style={{ backgroundColor: "var(--lv-blush)", color: "var(--lv-navy)" }}
                >
                  Compare plans
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-[rgba(245,247,251,0.72)]">Premium plan</p>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="font-['Sora'] text-4xl font-bold">$12.99</span>
                    <span className="pb-1 text-sm text-[rgba(245,247,251,0.72)]">/ month</span>
                  </div>
                  <p className="mt-2 text-sm text-[rgba(245,247,251,0.72)]">Cancel anytime. Trial-ready mockup.</p>
                </div>
                <span className="rounded-full bg-[var(--lv-blush)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--lv-navy)]">
                  Most Popular
                </span>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white/6 p-4">
                  <p className="font-['Sora'] text-xl font-bold">3x</p>
                  <p className="mt-2 text-xs leading-5 text-[rgba(245,247,251,0.72)]">More AI practice time</p>
                </div>
                <div className="rounded-2xl bg-white/6 p-4">
                  <p className="font-['Sora'] text-xl font-bold">Weekly</p>
                  <p className="mt-2 text-xs leading-5 text-[rgba(245,247,251,0.72)]">Progress plans and insights</p>
                </div>
                <div className="rounded-2xl bg-white/6 p-4">
                  <p className="font-['Sora'] text-xl font-bold">Priority</p>
                  <p className="mt-2 text-xs leading-5 text-[rgba(245,247,251,0.72)]">Matching and support</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--lv-link)]">
              What You Unlock
            </p>
            <h2 className="mt-3 font-['Sora'] text-2xl font-bold text-[var(--lv-text)]">
              Premium is about better learning outcomes, not just status.
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-3xl border border-[var(--lv-border)] bg-[var(--lv-surface-muted)] p-5"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(27,127,121,0.14)] text-[var(--lv-primary)]">
                    ✦
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--lv-text)]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--lv-muted-text)]">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--lv-danger)]">
              Why Premium Exists
            </p>
            <h2 className="mt-3 font-['Sora'] text-2xl font-bold text-[var(--lv-text)]">
              A fair reason to pay, explained clearly.
            </h2>
            <div className="mt-6 space-y-4">
              {reasons.map((reason, index) => (
                <div
                  key={reason}
                  className="flex gap-4 rounded-3xl p-4"
                  style={{ backgroundColor: index === 1 ? "rgba(236,177,208,0.18)" : "var(--lv-surface-muted)" }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: index === 1 ? "var(--lv-danger)" : "var(--lv-primary)" }}
                  >
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-[var(--lv-text)]">{reason}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--lv-muted-text)]">
                Free Vs Premium
              </p>
              <h2 className="mt-2 font-['Sora'] text-2xl font-bold text-[var(--lv-text)]">
                Make the upgrade value obvious.
              </h2>
            </div>
            <p className="text-sm text-[var(--lv-muted-text)]">Simple comparison mockup for the pricing story.</p>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--lv-border)]">
            <div className="grid grid-cols-[1.2fr_0.5fr_0.6fr] bg-[var(--lv-surface-muted)] px-4 py-4 text-xs font-bold uppercase tracking-wide text-[var(--lv-muted-text)] sm:px-6">
              <div>Feature</div>
              <div className="text-center">Free</div>
              <div className="text-center text-[var(--lv-primary)]">Premium</div>
            </div>
            {comparison.map(([feature, free, premium], index) => (
              <div
                key={feature}
                className={`grid grid-cols-[1.2fr_0.5fr_0.6fr] px-4 py-4 sm:px-6 ${
                  index !== comparison.length - 1 ? "border-t border-[var(--lv-border)]" : ""
                }`}
              >
                <div className="pr-3 text-sm font-medium text-[var(--lv-text)]">{feature}</div>
                <div className="text-center text-sm text-[var(--lv-muted-text)]">{free}</div>
                <div className="text-center text-sm font-semibold text-[var(--lv-primary)]">{premium}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PremiumPage;
