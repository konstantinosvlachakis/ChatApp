import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import CoachAvatar from "../components/CoachAvatar";

const AuthLandingPage = () => {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#081320] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(27,127,121,0.34),transparent_26%),radial-gradient(circle_at_85%_18%,rgba(236,177,208,0.22),transparent_22%),radial-gradient(circle_at_50%_78%,rgba(20,49,74,0.6),transparent_38%),linear-gradient(180deg,#081320_0%,#102131_56%,#112a3d_100%)]" />
      <div className="absolute -left-16 top-10 h-72 w-72 rounded-full bg-[rgba(27,127,121,0.18)] blur-3xl" />
      <div className="absolute right-[-4rem] top-16 h-64 w-64 rounded-full bg-[rgba(236,177,208,0.17)] blur-3xl" />
      <div className="absolute bottom-[-6rem] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[rgba(20,49,74,0.45)] blur-3xl" />

      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-5 py-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.75, ease: "easeOut" }}
          className="mx-auto max-w-3xl"
        >
          <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-[2.25rem] border border-white/10 bg-white/5 shadow-[0_22px_80px_rgba(2,8,15,0.34)] backdrop-blur">
            <CoachAvatar size={96} hideBadge />
          </div>

          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.34em] text-[rgba(137,218,211,0.94)]">
            LangVoyage
          </p>
          <h1 className="mt-4 font-['Georgia'] text-5xl font-semibold leading-none text-white sm:text-6xl">
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
            <Link
              to="/register"
              className="inline-flex min-w-[220px] items-center justify-center rounded-full border border-white/14 bg-white/6 px-7 py-4 text-base font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              Create account
            </Link>
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
        </motion.div>
      </div>
    </div>
  );
};

export default AuthLandingPage;
