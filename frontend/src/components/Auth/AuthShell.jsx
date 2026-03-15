import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import CoachAvatar from "../CoachAvatar";

const defaultHighlights = [
  "Private one-to-one conversations",
  "Real speaking practice and feedback",
  "A calmer path to everyday confidence",
];

const AuthShell = ({
  eyebrow = "LangVoyage",
  title,
  description,
  children,
  footer,
  accentLabel = "Designed for real language confidence",
  highlights = defaultHighlights,
  leftTitle = "A learning space that feels focused, warm, and human.",
  leftDescription = "The mobile app already has that mood. This flow brings the same identity to web so signing in feels like entering LangVoyage, not a generic dashboard.",
}) => {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#081320] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(27,127,121,0.34),transparent_26%),radial-gradient(circle_at_86%_16%,rgba(236,177,208,0.24),transparent_22%),radial-gradient(circle_at_70%_78%,rgba(20,49,74,0.56),transparent_34%),linear-gradient(180deg,#081320_0%,#102131_52%,#10273a_100%)]" />
      <div className="absolute -left-20 top-16 h-72 w-72 rounded-full bg-[rgba(27,127,121,0.18)] blur-3xl" />
      <div className="absolute right-[-5rem] top-24 h-64 w-64 rounded-full bg-[rgba(236,177,208,0.16)] blur-3xl" />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:h-[100dvh] lg:min-h-0 lg:flex-row lg:items-center lg:gap-10 lg:px-8 lg:py-6 xl:gap-12 xl:py-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="flex-1 px-2 py-6 lg:px-4 lg:py-3"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/90 backdrop-blur"
          >
            <CoachAvatar size={46} hideBadge />
            <span className="font-semibold tracking-tight">LangVoyage</span>
          </Link>

          <div className="mt-6 max-w-xl lg:mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[rgba(137,218,211,0.95)]">
              {accentLabel}
            </p>
            <h1 className="mt-3 font-['Georgia'] text-4xl font-semibold leading-[1.02] text-white sm:text-5xl lg:text-[4.2rem] xl:text-[4.8rem]">
              {leftTitle}
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-[rgba(233,239,247,0.76)] sm:text-lg lg:mt-3 lg:text-[1.02rem] lg:leading-7">
              {leftDescription}
            </p>
          </div>

          <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-3 lg:mt-5">
            {highlights.map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-white/6 px-4 py-3.5 backdrop-blur"
              >
                <div className="mb-2.5 h-2.5 w-2.5 rounded-full bg-[#ecb1d0]" />
                <p className="text-sm leading-6 text-[rgba(236,242,248,0.88)]">{item}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="w-full max-w-2xl flex-1 lg:max-w-[42rem]"
        >
          <div className="flex rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(239,246,252,0.94))] p-5 shadow-[0_24px_80px_rgba(3,11,20,0.34)] sm:p-7 lg:min-h-[46rem] lg:flex-col lg:justify-center lg:p-7 xl:p-8">
            <div className="mb-5 lg:mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#1b7f79]">
                {eyebrow}
              </p>
              <h2 className="mt-2.5 font-['Georgia'] text-3xl font-semibold leading-tight text-[#14314a] sm:text-4xl lg:text-[3rem]">
                {title}
              </h2>
              <p className="mt-2.5 max-w-xl text-sm leading-6 text-[#5f7085] sm:text-base">
                {description}
              </p>
            </div>
            {children}
            {footer ? <div className="mt-5 lg:mt-4">{footer}</div> : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AuthShell;
