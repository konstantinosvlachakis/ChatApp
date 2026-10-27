import React, { useEffect, useRef } from "react";
import "emoji-picker-element";

/**
 * emoji-picker-element web component, lazy-loaded by MessageInput.
 * Always light (`class="light"`; it otherwise follows the OS colour scheme) and themed through
 * its CSS custom properties in conversations.css (`.cv-emoji-picker`), incl. the Noto emoji font.
 */
export const EmojiPickerWrapper = ({ onEmojiSelect, autoFocus = true }) => {
  const pickerRef = useRef(null);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return undefined;

    const handleEmojiClick = (event) => {
      onEmojiSelect?.(event.detail.unicode);
    };
    picker.addEventListener("emoji-click", handleEmojiClick);
    return () => picker.removeEventListener("emoji-click", handleEmojiClick);
  }, [onEmojiSelect]);

  // The popover sits before the composer in the DOM, so move focus into the search field;
  // MessageInput returns it to the emoji button on close.
  useEffect(() => {
    if (!autoFocus) return undefined;
    let frame = 0;
    let cancelled = false;
    const focusSearch = () => {
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) pickerRef.current?.shadowRoot?.querySelector("input")?.focus();
      });
    };
    if (window.customElements?.whenDefined) {
      window.customElements.whenDefined("emoji-picker").then(focusSearch, () => {});
    }
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocus]);

  return <emoji-picker ref={pickerRef} class="light cv-emoji-picker"></emoji-picker>;
};
