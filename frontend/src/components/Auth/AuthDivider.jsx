import React from "react";

/** "or …" rule between the Google button and the email form. */
export default function AuthDivider({ children = "or" }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-[#d6e0e8]" />
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-muted-ink)]">{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-[#d6e0e8]" />
    </div>
  );
}
