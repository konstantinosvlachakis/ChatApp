import React from "react";
import { Link, useParams } from "react-router-dom";
import PublicHeader from "../../components/Public/PublicHeader";
import PublicFooter from "../../components/Public/PublicFooter";
import FaqList from "../../components/Public/FaqList";
import CtaLink from "../../components/Public/CtaLink";
import Illustration from "../../components/Public/Illustrations";
import { Flag, FlagPair } from "../../components/Public/PublicIcons";
import { titleCase } from "../../constants/languages";
import { EXCHANGE_PAIRS, getExchangePair, registerPath } from "./pairs";
import { PAIR_DETAILS } from "./pairDetails";

const LEVELS = [
  ["beginner", "Beginner"],
  ["intermediate", "Intermediate"],
  ["advanced", "Advanced"],
];

/** Shown for /exchange/<unknown> (not prerendered; seo/config.js marks it noindex). */
const ExchangeNotFound = () => (
  <div className="lp-page">
    <PublicHeader page="pair" />
    <main>
      <section className="lp-section">
        <div className="lp-container lp-narrow">
          <p className="lp-eyebrow">Page not found</p>
          <h1 className="lp-page-title">We don't have a guide for that exchange yet</h1>
          <p className="lp-section-lead">
            You can still practise any combination of the languages LangVoyage offers. These are the exchanges
            we've written guides for:
          </p>
          <div className="lp-grid">
            {EXCHANGE_PAIRS.map((pair) => (
              <Link key={pair.slug} to={pair.path} className="lp-card lp-pair-card">
                <FlagPair languages={pair.languages} small />
                <span className="lp-link">{pair.label} exchange</span>
              </Link>
            ))}
          </div>
          <div className="lp-actions">
            <Link to="/" className="lp-btn lp-btn-outline">
              Go to the home page
            </Link>
          </div>
        </div>
      </section>
    </main>
    <PublicFooter />
  </div>
);

const ExchangePairPage = ({ slug: slugProp }) => {
  const params = useParams();
  const summary = getExchangePair(slugProp || params.pair);
  if (!summary) return <ExchangeNotFound />;
  const pair = { ...summary, ...PAIR_DETAILS[summary.slug] };

  const [firstName, secondName] = pair.languages.map(titleCase);
  const otherPairs = EXCHANGE_PAIRS.filter((other) => other.slug !== pair.slug);
  const ctaButtons = (variant) =>
    pair.cta.map((cta, index) => (
      <CtaLink
        key={`${cta.speak}-${cta.learn}`}
        to={registerPath(cta)}
        page="pair"
        pair={pair.slug}
        className={`lp-btn ${index === 0 ? "lp-btn-primary" : variant}`}
      >
        {cta.label}
      </CtaLink>
    ));

  return (
    <div className="lp-page">
      <PublicHeader page="pair" pair={pair.slug} />
      <main>
        <section className="lp-hero lp-on-navy" aria-labelledby="pair-heading">
          <div className="lp-container">
            <nav aria-label="Breadcrumb">
              <ol className="lp-breadcrumb">
                <li>
                  <Link to="/">Home</Link>
                </li>
                <li aria-current="page">{pair.label} exchange</li>
              </ol>
            </nav>
            <FlagPair languages={pair.languages} />
            <p className="lp-eyebrow">
              {firstName} ⇄ {secondName} language exchange
            </p>
            <h1 id="pair-heading">{pair.heading}</h1>
            <p className="lp-hero-lead">{pair.reverse}</p>
            <div className="lp-actions">{ctaButtons("lp-btn-ghost")}</div>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="pair-why">
          <div className="lp-container lp-narrow lp-prose">
            <p className="lp-eyebrow">Why this pair works</p>
            <h2 id="pair-why">A partner who needs you as much as you need them</h2>
            {pair.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </section>

        <section className="lp-section lp-section-alt" aria-labelledby="pair-how">
          <div className="lp-container">
            <p className="lp-eyebrow">How it works</p>
            <h2 id="pair-how">How a LangVoyage {pair.label} exchange works</h2>
            <ol className="lp-steps lp-steps-4">
              {pair.steps.map((step) => (
                <li key={step.title} className="lp-card">
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="lp-grid lp-grid-2">
              <Illustration kind="timer" languages={pair.languages} />
              <Illustration kind="match" languages={pair.languages} />
            </div>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="pair-notes">
          <div className="lp-container">
            <p className="lp-eyebrow">Language notes</p>
            <h2 id="pair-notes">What each side usually finds tricky</h2>
            <p className="lp-section-lead">
              A few things partners in this exchange often help each other with. Ask your partner to correct them
              whenever they come up.
            </p>
            <div className="lp-grid lp-grid-2">
              {pair.sides.map((side) => (
                <article key={side.learning} className="lp-card">
                  <span className="lp-side-tag">
                    <Flag language={side.learning} small />
                    Learning {titleCase(side.learning)}
                  </span>
                  <h3>{side.title}</h3>
                  <ul className="lp-notes">
                    {side.notes.map((note) => (
                      <li key={note.title}>
                        <h4>{note.title}</h4>
                        <p>{note.text}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="lp-correction">
                    <span className="lp-correction-label">A typical correction</span>
                    <del lang={side.correction.lang}>{side.correction.original}</del>
                    <ins lang={side.correction.lang}>{side.correction.corrected}</ins>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-section-alt" aria-labelledby="pair-topics">
          <div className="lp-container">
            <p className="lp-eyebrow">Conversation topics</p>
            <h2 id="pair-topics">Topics to try at each level</h2>
            <p className="lp-section-lead">
              Guided exchanges suggest topics for the lower of your two levels. These are a few that work well
              for {firstName} and {secondName} speakers.
            </p>
            <div className="lp-grid lp-grid-3">
              {LEVELS.map(([level, label]) => (
                <div key={level} className="lp-card">
                  <h3>
                    <span className="lp-level">{label}</span>
                  </h3>
                  <ul className="lp-topic-list">
                    {pair.topics[level].map((topic) => (
                      <li key={topic.title}>
                        <strong>{topic.title}</strong>
                        <span>{topic.prompt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="pair-faq">
          <div className="lp-container lp-narrow">
            <p className="lp-eyebrow">FAQ</p>
            <h2 id="pair-faq">{pair.label} exchange questions</h2>
            <FaqList items={pair.faq} />
          </div>
        </section>

        <section className="lp-section" style={{ paddingTop: 0 }} aria-labelledby="pair-cta">
          <div className="lp-container">
            <div className="lp-cta-band">
              <h2 id="pair-cta">Start your {pair.label} exchange</h2>
              <p className="lp-section-lead">
                Choose the side that fits you. We'll fill in your languages on the sign-up form, and you can change
                them before you continue.
              </p>
              <div className="lp-actions">{ctaButtons("lp-btn-outline")}</div>
              <p className="lp-section-lead" style={{ fontSize: 15 }}>
                Other guides:{" "}
                {otherPairs.map((other, index) => (
                  <React.Fragment key={other.slug}>
                    {index > 0 ? " · " : ""}
                    <Link to={other.path} className="lp-link">
                      {other.label}
                    </Link>
                  </React.Fragment>
                ))}
                {" · "}
                <Link to="/how-it-works" className="lp-link">
                  How LangVoyage works
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
};

export default ExchangePairPage;
