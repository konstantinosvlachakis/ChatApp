import React from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../components/Public/PublicHeader";
import PublicFooter from "../components/Public/PublicFooter";
import CtaLink from "../components/Public/CtaLink";
import Illustration from "../components/Public/Illustrations";
import { FlagPair } from "../components/Public/PublicIcons";
import { HOW_IT_WORKS_SECTIONS } from "./Landing/howItWorksContent";
import { EXCHANGE_PAIRS } from "./Exchange/pairs";

const HowItWorksPage = () => (
  <div className="lp-page">
    <PublicHeader page="how_it_works" />
    <main>
      <section className="lp-hero lp-on-navy" aria-labelledby="hiw-heading">
        <div className="lp-container">
          <nav aria-label="Breadcrumb">
            <ol className="lp-breadcrumb">
              <li>
                <Link to="/">Home</Link>
              </li>
              <li aria-current="page">How it works</li>
            </ol>
          </nav>
          <p className="lp-eyebrow">How it works</p>
          <h1 id="hiw-heading">Language exchange, made fair and easy to keep up</h1>
          <p className="lp-hero-lead">
            LangVoyage pairs you with people who speak the language you're learning and want to learn yours. Here is
            everything that happens after you sign up, from finding a partner to keeping the corrections they give you.
          </p>
          <div className="lp-actions">
            <CtaLink to="/register" page="how_it_works" className="lp-btn lp-btn-primary">
              Create a free account
            </CtaLink>
            <a href="#matching" className="lp-btn lp-btn-ghost">
              See how matching works
            </a>
          </div>
        </div>
      </section>

      <section className="lp-section" aria-label="Features">
        <div className="lp-container">
          {HOW_IT_WORKS_SECTIONS.map((section) => (
            <article key={section.id} id={section.id} className="lp-feature">
              <div className="lp-prose">
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
              <Illustration kind={section.illustration} />
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-section-alt" aria-labelledby="hiw-pairs">
        <div className="lp-container">
          <p className="lp-eyebrow">Exchange guides</p>
          <h2 id="hiw-pairs">See how it works for your languages</h2>
          <p className="lp-section-lead">
            Language notes, topics by level and answers to common questions for some of the exchanges on LangVoyage.
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

      <section className="lp-section" aria-labelledby="hiw-cta">
        <div className="lp-container">
          <div className="lp-cta-band">
            <h2 id="hiw-cta">Ready for your first exchange?</h2>
            <p className="lp-section-lead">
              Sign-up takes three short steps: the language you speak, the one you want to practise, and your account.
            </p>
            <div className="lp-actions">
              <CtaLink to="/register" page="how_it_works" className="lp-btn lp-btn-primary">
                Create a free account
              </CtaLink>
              <Link to="/login" className="lp-btn lp-btn-outline">
                Log in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
    <PublicFooter />
  </div>
);

export default HowItWorksPage;
