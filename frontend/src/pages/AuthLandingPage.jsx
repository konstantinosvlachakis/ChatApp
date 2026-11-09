import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../components/CoachAvatar";
import CtaLink from "../components/Public/CtaLink";
import FaqList from "../components/Public/FaqList";
import PublicFooter from "../components/Public/PublicFooter";
import { FlagPair, LineIcon } from "../components/Public/PublicIcons";
import { HOME_FAQ, HOME_FEATURES, HOME_STEPS } from "./Landing/landingContent";
import { EXCHANGE_PAIRS } from "./Exchange/pairs";

// Home: hero, then short sections for visitors and search engines (how it works,
// features, exchange guides, FAQ). One warm ivory surface; sections fade in on scroll
// and a slim header appears after the hero. Styles: src/styles/public.css.

const delay = (ms) => ({ "--lp-delay": `${ms}ms` });

const HomeSections = () => (
  <>
    <section className="lp-section" aria-labelledby="home-how">
      <div className="lp-container">
        <p className="lp-eyebrow lp-reveal">How it works</p>
        <h2 id="home-how" className="lp-reveal" style={delay(60)}>
          A language exchange in three steps
        </h2>
        <ol className="lp-steps lp-steps-3">
          {HOME_STEPS.map((step, index) => (
            <li key={step.title} className="lp-card lp-reveal" style={delay(120 + index * 90)}>
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
        <p className="lp-eyebrow lp-reveal">What you get</p>
        <h2 id="home-features" className="lp-reveal" style={delay(60)}>
          Everything a language exchange needs
        </h2>
        <ul className="lp-grid lp-grid-3" style={{ listStyle: "none", padding: 0 }}>
          {HOME_FEATURES.map((feature, index) => (
            <li key={feature.title} className="lp-card lp-reveal" style={delay(100 + (index % 3) * 90)}>
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
        <p className="lp-eyebrow lp-reveal">Exchange guides</p>
        <h2 id="home-pairs" className="lp-reveal" style={delay(60)}>
          Featured language exchanges
        </h2>
        <p className="lp-section-lead lp-reveal" style={delay(100)}>
          Tips for each side, conversation topics by level and common questions.
        </p>
        <div className="lp-grid lp-grid-3">
          {EXCHANGE_PAIRS.map((pair, index) => (
            <Link
              key={pair.slug}
              to={pair.path}
              className="lp-card lp-pair-card lp-reveal"
              style={delay(140 + index * 90)}
            >
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
        <p className="lp-eyebrow lp-reveal">FAQ</p>
        <h2 id="home-faq" className="lp-reveal" style={delay(60)}>
          Questions about LangVoyage
        </h2>
        <div className="lp-reveal" style={delay(120)}>
          <FaqList items={HOME_FAQ} />
        </div>
      </div>
    </section>

    <section className="lp-section" aria-labelledby="home-cta">
      <div className="lp-container">
        <div className="lp-cta-band lp-reveal">
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

const HERO_POINTS = [
  "Practise with native speakers who are learning your language",
  "Guided 10–30 minute exchanges that switch language halfway",
  "Gentle corrections you can save to your phrasebook",
];

const LandingHero = ({ ctaRef }) => (
  <section className="lp-home-hero lv-font-body overflow-hidden text-[var(--lv-ink)]" aria-labelledby="home-hero">
    <div className="relative z-10 flex flex-col items-center px-4 pb-14 pt-14 text-center sm:px-5 sm:pb-20 sm:pt-20">
      <div
        style={{
          "--lv-rise-y": "22px",
          "--lv-rise-scale": "0.97",
          "--lv-rise-duration": "0.75s",
        }}
        className="lv-rise mx-auto max-w-3xl"
      >
        <div className="lp-hero-mark mx-auto flex w-fit justify-center">
          <CoachAvatar size={112} hideBadge />
        </div>

        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.34em] text-[var(--lv-teal-strong)]">
          LangVoyage
        </p>
        <h1
          id="home-hero"
          className="lv-font-display mt-4 text-[2.5rem] font-bold leading-[1.05] text-[var(--lv-ink)] sm:text-[3.5rem]"
        >
          Speak with confidence,
          <br />
          every day.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[var(--lv-muted-ink)] sm:text-lg">
          Find a language exchange partner, take turns speaking each other&apos;s language and
          pick up corrections along the way — with guided sessions that keep the conversation going.
        </p>

        <div ref={ctaRef} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <CtaLink to="/register" page="home" className="lp-btn lp-btn-primary min-w-[220px]">
            Create account
          </CtaLink>
          <Link to="/login" className="lp-btn lp-btn-outline min-w-[220px]">
            Log in
          </Link>
        </div>

        <ul className="mt-10 grid gap-3 text-left sm:grid-cols-3">
          {HERO_POINTS.map((item) => (
            <li key={item} className="lp-hero-point rounded-3xl px-4 py-4">
              <div aria-hidden="true" className="lp-hero-dot mb-3 h-2.5 w-2.5 rounded-full" />
              <p className="text-sm leading-6 text-[var(--lv-ink)]">{item}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

/**
 * Client-only motion. Adds `.lp-js` to the page (so the prerendered HTML and visitors
 * without JS always see every section), reveals `.lp-reveal` elements as they scroll
 * into view, and reports when the hero buttons have scrolled above the viewport.
 */
export function useLandingMotion(rootRef, ctaRef) {
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const items = Array.from(root.querySelectorAll(".lp-reveal"));
    if (typeof window.IntersectionObserver !== "function") {
      items.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }
    root.classList.add("lp-js");
    const revealer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    items.forEach((item) => revealer.observe(item));

    let heroWatcher;
    if (ctaRef.current) {
      heroWatcher = new window.IntersectionObserver(([entry]) => {
        setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      });
      heroWatcher.observe(ctaRef.current);
    }
    return () => {
      revealer.disconnect();
      if (heroWatcher) heroWatcher.disconnect();
      root.classList.remove("lp-js");
    };
  }, [rootRef, ctaRef]);

  return pastHero;
}

// Duplicate of the hero's links: hidden from keyboard and screen readers until shown.
const StickyBar = ({ shown }) => {
  const focus = shown ? undefined : -1;
  return (
    <div className={`lp-stickybar${shown ? " is-shown" : ""}`} aria-hidden={shown ? undefined : true}>
      <nav className="lp-container lp-stickybar-inner" aria-label="Quick links">
        <Link to="/" className="lp-stickybar-brand" tabIndex={focus}>
          <CoachAvatar size={30} hideBadge />
          LangVoyage
        </Link>
        <Link to="/how-it-works" className="lp-stickybar-link lp-stickybar-hide-sm" tabIndex={focus}>
          How it works
        </Link>
        <Link to="/login" className="lp-stickybar-link" tabIndex={focus}>
          Log in
        </Link>
        <CtaLink to="/register" page="home" className="lp-btn lp-btn-primary lp-btn-sm" tabIndex={focus}>
          Create account
        </CtaLink>
      </nav>
    </div>
  );
};

const AuthLandingPage = () => {
  const rootRef = useRef(null);
  const ctaRef = useRef(null);
  const pastHero = useLandingMotion(rootRef, ctaRef);
  return (
    <div className="lp-page" ref={rootRef}>
      <StickyBar shown={pastHero} />
      <main>
        <LandingHero ctaRef={ctaRef} />
        <HomeSections />
      </main>
      <PublicFooter />
    </div>
  );
};

export default AuthLandingPage;
