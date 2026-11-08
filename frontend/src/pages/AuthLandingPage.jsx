import React from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../components/CoachAvatar";
import CtaLink from "../components/Public/CtaLink";
import FaqList from "../components/Public/FaqList";
import PublicFooter from "../components/Public/PublicFooter";
import { FlagPair, LineIcon } from "../components/Public/PublicIcons";
import { HOME_FAQ, HOME_FEATURES, HOME_STEPS } from "./Landing/landingContent";
import { EXCHANGE_PAIRS } from "./Exchange/pairs";

// Home: the original full-screen hero, then short sections for visitors and search
// engines (how it works, features, exchange guides, FAQ). Styles: src/styles/public.css.
const HomeSections = () => (
  <>
    <section className="lp-section" aria-labelledby="home-how">
      <div className="lp-container">
        <p className="lp-eyebrow">How it works</p>
        <h2 id="home-how">A language exchange in three steps</h2>
        <ol className="lp-steps lp-steps-3">
          {HOME_STEPS.map((step) => (
            <li key={step.title} className="lp-card">
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="lp-section-lead">
          <Link to="/how-it-works" className="lp-link">
            Read the full guide to how LangVoyage works
          </Link>
        </p>
      </div>
    </section>

    <section className="lp-section lp-section-alt" aria-labelledby="home-features">
      <div className="lp-container">
        <p className="lp-eyebrow">What you get</p>
        <h2 id="home-features">Everything a language exchange needs</h2>
        <ul className="lp-grid lp-grid-3" style={{ listStyle: "none", padding: 0 }}>
          {HOME_FEATURES.map((feature) => (
            <li key={feature.title} className="lp-card">
              <span className="lp-icon">
                <LineIcon name={feature.icon} />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section className="lp-section" aria-labelledby="home-pairs">
      <div className="lp-container">
        <p className="lp-eyebrow">Exchange guides</p>
        <h2 id="home-pairs">Featured language exchanges</h2>
        <p className="lp-section-lead">
          Tips for each side, conversation topics by level and common questions.
        </p>
        <div className="lp-grid lp-grid-3">
          {EXCHANGE_PAIRS.map((pair) => (
            <Link key={pair.slug} to={pair.path} className="lp-card lp-pair-card">
              <FlagPair languages={pair.languages} small />
              <h3>{pair.label} exchange</h3>
              <p>{pair.heading}.</p>
              <span className="lp-link">Read the guide</span>
            </Link>
          ))}
        </div>
      </div>
    </section>

    <section className="lp-section lp-section-alt" aria-labelledby="home-faq">
      <div className="lp-container lp-narrow">
        <p className="lp-eyebrow">FAQ</p>
        <h2 id="home-faq">Questions about LangVoyage</h2>
        <FaqList items={HOME_FAQ} />
      </div>
    </section>

    <section className="lp-section" aria-labelledby="home-cta">
      <div className="lp-container">
        <div className="lp-cta-band">
          <h2 id="home-cta">Find your first exchange partner</h2>
          <p className="lp-section-lead">Free to join. Pick your languages and see who is learning yours.</p>
          <div className="lp-actions">
            <CtaLink to="/register" page="home" className="lp-btn lp-btn-primary">
              Create a free account
            </CtaLink>
            <Link to="/login" className="lp-btn lp-btn-outline">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </section>
  </>
);

// The original hero, unchanged (full screen on first load).
const LandingHero = () => {
  return (
    <div className="lv-font-body relative min-h-[100dvh] overflow-hidden bg-[#081320] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(27,127,121,0.34),transparent_26%),radial-gradient(circle_at_85%_18%,rgba(236,177,208,0.22),transparent_22%),radial-gradient(circle_at_50%_78%,rgba(20,49,74,0.6),transparent_38%),linear-gradient(180deg,#081320_0%,#102131_56%,#112a3d_100%)]" />
      <div className="absolute -left-16 top-10 h-72 w-72 rounded-full bg-[rgba(27,127,121,0.18)] blur-3xl" />
      <div className="absolute right-[-4rem] top-16 h-64 w-64 rounded-full bg-[rgba(236,177,208,0.17)] blur-3xl" />
      <div className="absolute bottom-[-6rem] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[rgba(20,49,74,0.45)] blur-3xl" />

      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-5 py-12 text-center">
        <div
          style={{
            "--lv-rise-y": "22px",
            "--lv-rise-scale": "0.97",
            "--lv-rise-duration": "0.75s",
          }}
          className="lv-rise mx-auto max-w-3xl"
        >
          <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-[2.25rem] border border-white/10 bg-white/5 shadow-[0_22px_80px_rgba(2,8,15,0.34)] backdrop-blur">
            <CoachAvatar size={96} hideBadge />
          </div>

          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.34em] text-[rgba(137,218,211,0.94)]">
            LangVoyage
          </p>
          <h1 className="lv-font-display mt-4 text-[2.6rem] font-bold leading-[1.05] text-white sm:text-[3.6rem]">
            Speak with confidence,
            <br />
            every day.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[rgba(234,239,247,0.78)] sm:text-lg">
            Practice in a calmer, more beautiful space with guided conversations, smart feedback,
            and a rhythm that feels closer to coaching than homework.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex min-w-[220px] items-center justify-center rounded-full bg-white px-7 py-4 text-base font-semibold text-[#14314a] shadow-[0_16px_36px_rgba(2,8,15,0.22)] transition hover:-translate-y-0.5"
            >
              Log in
            </Link>
            <CtaLink
              to="/register"
              page="home"
              className="inline-flex min-w-[220px] items-center justify-center rounded-full border border-white/14 bg-white/6 px-7 py-4 text-base font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              Create account
            </CtaLink>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {[
              "Private conversations with people and coach mode",
              "Daily practice loops that feel structured but light",
              "A visual identity that matches the mobile app from the first second",
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-white/6 px-4 py-4 text-left backdrop-blur"
              >
                <div className="mb-3 h-2.5 w-2.5 rounded-full bg-[#ecb1d0]" />
                <p className="text-sm leading-6 text-[rgba(236,242,248,0.88)]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const AuthLandingPage = () => (
  <div className="lp-page">
    <main>
      <LandingHero />
      <HomeSections />
    </main>
    <PublicFooter />
  </div>
);

export default AuthLandingPage;
