import React from "react";

/**
 * Always-visible FAQ (question = h3, answer = p). seo/config.js emits FAQPage JSON-LD
 * from the same `items`, so keep this rendering the text verbatim.
 */
const FaqList = ({ items }) => (
  <div className="lp-faq">
    {items.map(({ question, answer }) => (
      <div key={question} className="lp-faq-item">
        <h3>{question}</h3>
        <p>{answer}</p>
      </div>
    ))}
  </div>
);

export default FaqList;
