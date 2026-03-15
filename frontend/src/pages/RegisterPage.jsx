import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BASE_URL } from "../constants/constants";
import AuthShell from "../components/Auth/AuthShell";

const languageOptions = [
  {
    value: "English",
    label: "English",
    flag: "https://flagcdn.com/w320/us.png",
  },
  {
    value: "Greek",
    label: "Greek",
    flag: "https://flagcdn.com/w320/gr.png",
  },
  {
    value: "French",
    label: "French",
    flag: "https://flagcdn.com/w320/fr.png",
  },
  {
    value: "German",
    label: "German",
    flag: "https://flagcdn.com/w320/de.png",
  },
  {
    value: "Portuguese",
    label: "Portuguese",
    flag: "https://flagcdn.com/w320/pt.png",
  },
  {
    value: "Russian",
    label: "Russian",
    flag: "https://flagcdn.com/w320/ru.png",
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,30}$/;
const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MIN_BIRTH_YEAR = 1900;

const getMinBirthDate = () => {
  const now = new Date();
  return new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
};

const toDateInputValue = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const isSameDay = (a, b) =>
  a &&
  b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const RegisterPage = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("English");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initialDate = parseDateInputValue(dateOfBirth) || getMinBirthDate();
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });
  const calendarRef = useRef(null);

  const navigate = useNavigate();
  const maxBirthDate = getMinBirthDate();
  const selectedDate = parseDateInputValue(dateOfBirth);
  const yearOptions = useMemo(() => {
    const years = [];
    const maxYear = maxBirthDate.getFullYear();
    for (let year = maxYear; year >= MIN_BIRTH_YEAR; year -= 1) {
      years.push(year);
    }
    return years;
  }, [maxBirthDate]);

  const passwordChecks = useMemo(
    () => ({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      digit: /[0-9]/.test(password),
      symbol: /[^A-Za-z0-9]/.test(password),
    }),
    [password]
  );

  const isPasswordStrong = Object.values(passwordChecks).every(Boolean);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setIsCalendarOpen(false);
      }
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const getCalendarDays = (monthDate) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const startDate = new Date(year, month, 1 - startOffset);
    const days = [];

    for (let i = 0; i < 42; i += 1) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }

    return days;
  };

  const validate = () => {
    const nextErrors = {};
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedUsername) {
      nextErrors.username = "Username is required.";
    } else if (!USERNAME_REGEX.test(trimmedUsername)) {
      nextErrors.username =
        "Use 3-30 chars: letters, numbers, dot, dash or underscore.";
    }

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!dateOfBirth) {
      nextErrors.dateOfBirth = "Date of birth is required.";
    } else {
      const dob = new Date(dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        nextErrors.dateOfBirth = "Date of birth is invalid.";
      } else if (dob > getMinBirthDate()) {
        nextErrors.dateOfBirth = "You must be at least 13 years old.";
      }
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (!isPasswordStrong) {
      nextErrors.password = "Password does not meet the requirements.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!validate()) {
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(BASE_URL + "/api/register/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim().toLowerCase(),
          dateOfBirth,
          password,
          nativeLanguage,
        }),
      });

      if (response.ok) {
        navigate("/login");
      } else {
        const errorData = await response.json().catch(() => ({}));
        setSubmitError(errorData.error || "Could not create account.");
      }
    } catch (error) {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const passwordStrengthLabel = isPasswordStrong ? "Strong password" : "Keep going";

  const inputClassName =
    "w-full rounded-2xl border border-[#d6e0e8] bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1b7f79] focus:ring-4 focus:ring-[rgba(27,127,121,0.12)]";

  return (
    <AuthShell
      eyebrow="Create Account"
      title="Join LangVoyage with the same tone as the mobile app."
      description="Create your profile, choose your native language, and start from a web flow that finally feels branded, intentional, and calm."
      footer={
        <>
          <p className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <button
              type="button"
              className="font-semibold text-[#1b7f79] hover:text-[#14314a]"
              onClick={() => navigate("/login")}
            >
              Log in
            </button>
          </p>
          <p className="mt-3 text-center text-xs leading-6 text-slate-500">
            By creating an account, you agree to our{" "}
            <Link to="/terms-and-conditions" className="font-medium text-[#1b7f79] hover:text-[#14314a]">
              Terms and Conditions
            </Link>{" "}
            and{" "}
            <Link to="/privacy-policy" className="font-medium text-[#1b7f79] hover:text-[#14314a]">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      }
    >
      <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-[#14314a]">
                Username
              </label>
              <input
                id="username"
                className={inputClassName}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_ross"
                autoComplete="username"
              />
              {errors.username && <p className="mt-1 text-xs text-rose-600">{errors.username}</p>}
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-[#14314a]">
                Email
              </label>
              <input
                id="email"
                type="email"
                className={inputClassName}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="date-of-birth"
                  className="mb-1.5 block text-sm font-semibold text-[#14314a]"
                >
                  Date of birth
                </label>
                <div className="relative" ref={calendarRef}>
                  <button
                    id="date-of-birth"
                    type="button"
                    className={`${inputClassName} flex items-center justify-between`}
                    onClick={() => {
                      const anchorDate = selectedDate || maxBirthDate;
                      setCalendarMonth(
                        new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
                      );
                      setIsCalendarOpen((prev) => !prev);
                    }}
                  >
                    <span className={dateOfBirth ? "text-slate-900" : "text-slate-400"}>
                      {dateOfBirth || "Select date"}
                    </span>
                    <span className="text-slate-400">▼</span>
                  </button>

                  {isCalendarOpen && (
                    <div className="absolute left-0 right-auto top-[calc(100%+8px)] z-20 w-[min(320px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-[1.6rem] border border-[#d6e0e8] bg-white p-3 shadow-2xl sm:w-[320px] sm:max-w-none">
                      <div className="mb-3 flex items-center gap-2">
                        <select
                          aria-label="Select month"
                          className="w-1/2 rounded-xl border border-[#d6e0e8] px-2 py-2 text-sm text-slate-700"
                          value={calendarMonth.getMonth()}
                          onChange={(e) =>
                            setCalendarMonth(
                              (prev) =>
                                new Date(
                                  prev.getFullYear(),
                                  Number(e.target.value),
                                  1
                                )
                            )
                          }
                        >
                          {MONTH_LABELS.map((monthLabel, monthIndex) => (
                            <option key={monthLabel} value={monthIndex}>
                              {monthLabel}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Select year"
                          className="w-1/2 rounded-xl border border-[#d6e0e8] px-2 py-2 text-sm text-slate-700"
                          value={calendarMonth.getFullYear()}
                          onChange={(e) =>
                            setCalendarMonth(
                              (prev) =>
                                new Date(
                                  Number(e.target.value),
                                  prev.getMonth(),
                                  1
                                )
                            )
                          }
                        >
                          {yearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-2 grid grid-cols-7 gap-1">
                        {WEEK_DAYS.map((day) => (
                          <div
                            key={day}
                            className="text-center text-[11px] font-semibold uppercase text-slate-500"
                          >
                            {day}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {getCalendarDays(calendarMonth).map((day) => {
                          const isCurrentMonth =
                            day.getMonth() === calendarMonth.getMonth() &&
                            day.getFullYear() === calendarMonth.getFullYear();
                          const disabled = day > maxBirthDate;
                          const selected = isSameDay(day, selectedDate);

                          return (
                            <button
                              key={toDateInputValue(day)}
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                setDateOfBirth(toDateInputValue(day));
                                setErrors((prev) => ({ ...prev, dateOfBirth: "" }));
                                setIsCalendarOpen(false);
                              }}
                              className={`h-9 rounded-lg text-sm transition ${
                                selected
                                  ? "bg-[#14314a] text-white"
                                  : isCurrentMonth
                                    ? "text-slate-800 hover:bg-[#eef4f8]"
                                    : "text-slate-300 hover:bg-slate-50"
                              } ${disabled ? "cursor-not-allowed text-slate-200 hover:bg-white" : ""}`}
                            >
                              {day.getDate()}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-500 hover:text-slate-700"
                          onClick={() => {
                            setDateOfBirth("");
                            setIsCalendarOpen(false);
                          }}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-[#1b7f79] hover:text-[#14314a]"
                          onClick={() => {
                            const fallback = toDateInputValue(maxBirthDate);
                            setDateOfBirth(fallback);
                            setCalendarMonth(
                              new Date(
                                maxBirthDate.getFullYear(),
                                maxBirthDate.getMonth(),
                                1
                              )
                            );
                            setIsCalendarOpen(false);
                          }}
                        >
                          Use latest allowed
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {errors.dateOfBirth && (
                  <p className="mt-1 text-xs text-rose-600">{errors.dateOfBirth}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="native-language"
                  className="mb-1.5 block text-sm font-semibold text-[#14314a]"
                >
                  Native language
                </label>
                <select
                  id="native-language"
                  className={inputClassName}
                  value={nativeLanguage}
                  onChange={(e) => setNativeLanguage(e.target.value)}
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-[#14314a]">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={inputClassName}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password}</p>}
              <div className="mt-2 grid grid-cols-5 gap-1">
                {Object.values(passwordChecks).map((check, index) => (
                  <span
                    key={index}
                    className={`h-1.5 rounded-full ${check ? "bg-[#1b7f79]" : "bg-slate-200"}`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {passwordStrengthLabel}: 8+ chars, upper, lower, number and symbol.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-sm font-semibold text-[#14314a]"
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className={inputClassName}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword}</p>
              )}
            </div>

            {submitError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#14314a] py-3.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(20,49,74,0.22)] transition hover:bg-[#10263a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>
    </AuthShell>
  );
};

export default RegisterPage;
