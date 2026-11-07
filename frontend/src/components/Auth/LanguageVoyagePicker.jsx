import React, { useEffect, useId, useRef, useState } from "react";
import { describeLanguage, flagUrl } from "../../constants/languages";

// Sign-up language and level fields share one compact, keyboard-accessible picker.

export const PRACTICE_LEVELS = [
  { value: "beginner", label: "Beginner", bars: 1, hint: "A few words" },
  { value: "intermediate", label: "Intermediate", bars: 2, hint: "Simple chats" },
  { value: "advanced", label: "Advanced", bars: 3, hint: "Most topics" },
  { value: "fluent", label: "Fluent", bars: 4, hint: "Express myself freely" },
];

function CompassIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[19px] w-[19px]">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function PickerChevron({ open }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PickerCheck() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-[var(--lv-teal)]">
      <path d="m5 10 3.25 3.25L15 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Decorative: the language name is always shown next to the flag. */
export function FlagAvatar({ language, size = 32 }) {
  const src = language ? flagUrl(language, 80) : null;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--lv-sage)] text-[var(--lv-teal)] ring-1 ring-inset ring-black/5"
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <CompassIcon />
      )}
    </span>
  );
}

function PickerSelect({
  id,
  labelId,
  value,
  options,
  placeholder,
  placeholderIcon,
  onChange,
  invalid = false,
  describedBy,
  multiple = false,
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState({ above: false, height: 288 });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const selectedValues = multiple ? value : [value];
  const selectedOptions = selectedValues.map((key) => options.find((option) => option.value === key)).filter(Boolean);
  const selected = selectedOptions[0];
  const valueId = `${id}-value`;

  const openList = () => {
    const index = options.findIndex((option) => option.value === selectedValues[0]);
    setActiveIndex(index >= 0 ? index : 0);
    setOpen(true);
  };
  const choose = (option) => {
    if (multiple) {
      onChange(selectedValues.includes(option.value)
        ? selectedValues.filter((key) => key !== option.value)
        : [...selectedValues, option.value]);
      return;
    }
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      const below = Math.max(0, bottom - rect.bottom - 20);
      const above = Math.max(0, rect.top - top - 20);
      const openAbove = below < 240 && above > below;
      setPlacement({ above: openAbove, height: Math.min(288, Math.max(80, openAbove ? above : below)) });
    };
    position();
    listRef.current?.focus({ preventScroll: true });
    const close = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = list?.querySelector(`[data-index="${activeIndex}"]`);
    if (!list || !option) return;
    // Scroll the options only: scrollIntoView would also move the entire page.
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [activeIndex, open, placement.height]);

  const onListKeyDown = (event) => {
    const last = options.length - 1;
    if (event.key === "ArrowDown") setActiveIndex((index) => Math.min(last, index + 1));
    else if (event.key === "ArrowUp") setActiveIndex((index) => Math.max(0, index - 1));
    else if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End") setActiveIndex(last);
    else if (event.key === "Enter" || event.key === " ") {
      if (options[activeIndex]) choose(options[activeIndex]);
    } else if (event.key === "Tab") {
      if (multiple) return;
      setOpen(false);
      // Continue native tab navigation from the trigger, which stays in the DOM.
      buttonRef.current?.focus({ preventScroll: true });
      return;
    } else if (/^[a-z]$/i.test(event.key)) {
      const letter = event.key.toLowerCase();
      const start = activeIndex + 1;
      const order = [...options.slice(start), ...options.slice(0, start)];
      const match = order.find((option) => option.label.toLowerCase().startsWith(letter));
      if (match) setActiveIndex(options.indexOf(match));
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <div
      className="relative"
      ref={rootRef}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          buttonRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      <button
        id={id}
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (open) listRef.current?.focus({ preventScroll: true });
            else openList();
          } else if (["Enter", " "].includes(event.key) && !open) {
            event.preventDefault();
            openList();
          }
        }}
        className={`flex h-[50px] w-full items-center gap-2.5 rounded-2xl border bg-white px-3 text-left shadow-sm outline-none transition focus:border-[var(--lv-focus)] focus:ring-4 focus:ring-[rgba(27,127,121,0.12)] ${
          invalid ? "border-rose-300" : "border-[#d6e0e8] hover:border-[#9cc9c4]"
        }`}
      >
        {selected?.icon || placeholderIcon}
        <span id={valueId} className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-sm font-semibold leading-5 text-[var(--lv-ink)]">{selected.label}</span>
              {multiple && selectedOptions.length > 1 ? (
                <>
                  <span className="sr-only">, {selectedOptions.slice(1).map((option) => option.label).join(", ")}</span>
                  <span aria-hidden="true" className="block truncate text-xs leading-4 text-[var(--lv-muted-ink)]">{selectedOptions.length} languages</span>
                </>
              ) : selected.hint ? <span className="block truncate text-xs leading-4 text-[var(--lv-muted-ink)]">{selected.hint}</span> : null}
            </>
          ) : (
            <span className="block text-sm text-slate-400">{placeholder}</span>
          )}
        </span>
        {multiple && selectedOptions.length > 1 ? (
          <span aria-hidden="true" className="rounded-full bg-[var(--lv-sage)] px-2 py-1 text-xs font-semibold text-[var(--lv-teal)]">+{selectedOptions.length - 1}</span>
        ) : null}
        <PickerChevron open={open} />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 z-30 overflow-hidden rounded-2xl border border-[#d6e0e8] bg-white shadow-[0_18px_40px_rgba(20,49,74,0.18)] motion-safe:animate-[lv-picker-in_140ms_ease-out]"
          style={placement.above ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }}
        >
          <ul
          id={listId}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-invalid={invalid || undefined}
          aria-multiselectable={multiple || undefined}
          aria-describedby={describedBy}
          aria-activedescendant={`${listId}-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className="relative overflow-auto overscroll-contain p-1.5 outline-none"
          style={{ maxHeight: placement.height - (multiple ? 48 : 0) }}
        >
          {options.map((option, index) => {
            const isSelected = selectedValues.includes(option.value);
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className={`flex min-h-[48px] cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                  isActive ? "bg-[var(--lv-sage)]" : ""
                }`}
              >
                {option.icon}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5 text-[var(--lv-ink)]">{option.label}</span>
                  {option.hint ? <span className="block text-xs leading-4 text-[var(--lv-muted-ink)]">{option.hint}</span> : null}
                </span>
                <span className={multiple
                  ? `flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${isSelected ? "border-[var(--lv-teal)] bg-white" : "border-slate-300"}`
                  : `shrink-0 ${isSelected ? "" : "invisible"}`}>
                  {isSelected ? <PickerCheck /> : null}
                </span>
              </li>
            );
          })}
          </ul>
          {multiple ? (
            <div className="flex h-[46px] items-center justify-between border-t border-[#d6e0e8] bg-white px-3">
              <span className="text-xs text-[var(--lv-muted-ink)]">{selectedOptions.length ? `${selectedOptions.length} selected` : "Choose at least one"}</span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus({ preventScroll: true });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Tab" && event.shiftKey) {
                    event.preventDefault();
                    listRef.current?.focus({ preventScroll: true });
                  }
                }}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--lv-teal)] outline-none hover:bg-[var(--lv-sage)] focus-visible:ring-2 focus-visible:ring-[var(--lv-focus)]"
              >
                Done
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SignalBars({ count }) {
  return (
    <span aria-hidden="true" className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--lv-sage)] text-[var(--lv-teal)]">
      <span className="inline-flex h-3.5 items-end gap-[2px]">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            style={{ height: `${bar * 25}%` }}
            className={`w-[3px] rounded-full ${
              bar <= count ? "bg-current" : "bg-current opacity-20"
            }`}
          />
        ))}
      </span>
    </span>
  );
}

export function LanguageSelect({ options, ...props }) {
  return (
    <PickerSelect
      placeholder="Choose a language"
      placeholderIcon={
        <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--lv-sage)] text-[var(--lv-teal)]">
          <CompassIcon />
        </span>
      }
      {...props}
      options={options.map((key) => {
        const language = describeLanguage(key);
        return { value: language.key, label: language.name, hint: language.endonym, icon: <FlagAvatar language={key} size={28} /> };
      })}
    />
  );
}

export function LevelPicker({ value, onChange, id = "practice-level", labelId = "practice-level-label" }) {
  return (
    <PickerSelect
      id={id}
      labelId={labelId}
      value={value}
      onChange={onChange}
      options={PRACTICE_LEVELS.map((level) => ({ ...level, icon: <SignalBars count={level.bars} /> }))}
    />
  );
}

/** The first exchange as a ticket: native → learning. Shown once a language is chosen. */
export function RouteTicket({ nativeLanguage, practiceLanguages }) {
  if (!practiceLanguages.length) return null;
  const from = describeLanguage(nativeLanguage);
  const targets = practiceLanguages.map(describeLanguage);
  const names = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(targets.map((language) => language.name));
  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-[#9cc9c4] bg-[linear-gradient(90deg,#f2faf9,#fdf4f8)] px-4 py-2.5 motion-safe:animate-[lv-ticket-in_320ms_ease-out]"
    >
      <FlagAvatar language={from.key} size={30} />
      <span aria-hidden="true" className="flex flex-1 items-center">
        <span className="h-px flex-1 border-t-2 border-dotted border-[#9cc9c4]" />
        <span className="mx-1 text-base text-[#1b7f79] motion-safe:animate-[lv-fly_2.4s_ease-in-out_infinite]">✈</span>
        <span className="h-px flex-1 border-t-2 border-dotted border-[#9cc9c4]" />
      </span>
      <span className="flex -space-x-2">
        {targets.slice(0, 3).map((language) => <FlagAvatar key={language.key} language={language.key} size={30} />)}
        {targets.length > 3 ? <span className="flex h-[30px] min-w-[30px] items-center justify-center rounded-full bg-[var(--lv-sage)] px-1 text-xs font-semibold text-[var(--lv-teal)]">+{targets.length - 3}</span> : null}
      </span>
      <span className="w-full min-w-0 border-t border-dashed border-[#9cc9c4] pt-2 text-xs leading-5 text-slate-600 sm:ml-1 sm:w-auto sm:max-w-[16rem] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
        <span className="block font-semibold text-[#14314a]">Your first voyage</span>
        You&apos;ll meet {names} speakers who are learning {from.name}.
      </span>
    </div>
  );
}
