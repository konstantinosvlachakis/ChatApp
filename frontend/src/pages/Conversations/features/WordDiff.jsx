import React from "react";

/**
 * Renders `diffWords` segments. Removed words are struck through (<del>), added words are
 * underlined (<ins>), so the change never relies on colour alone; screen readers get
 * "removed:" / "added:" around each change.
 */
export default function WordDiff({ segments }) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "equal") {
          return (
            <React.Fragment key={index}>
              {segment.space}
              {segment.text}
            </React.Fragment>
          );
        }
        const removed = segment.type === "removed";
        const Mark = removed ? "del" : "ins";
        return (
          <React.Fragment key={index}>
            {segment.space}
            <Mark className={removed ? "cv-diff-del" : "cv-diff-ins"}>
              <span className="lv-visually-hidden">{removed ? "[removed: " : "[added: "}</span>
              {segment.text}
              <span className="lv-visually-hidden">]</span>
            </Mark>
          </React.Fragment>
        );
      })}
    </>
  );
}
