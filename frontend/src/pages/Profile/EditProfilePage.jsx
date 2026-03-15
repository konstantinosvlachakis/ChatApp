import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import { BASE_URL } from "../../constants/constants";
import { useUser } from "../../context/UserContext";
import { getUserLocation } from "./utils/getUserLocation";

const LANGUAGE_OPTIONS = [
  "english",
  "spanish",
  "french",
  "german",
  "italian",
  "portuguese",
  "greek",
  "japanese",
  "korean",
  "chinese",
  "arabic",
  "russian",
  "turkish",
  "hindi",
];

const AVATAR_RING_OPTIONS = [
  {
    value: "#1b7f79",
    label: "Teal",
  },
  {
    value: "#ecb1d0",
    label: "Blush",
  },
  {
    value: "#d7b054",
    label: "Gold",
  },
  {
    value: "#a499e4",
    label: "Lavender",
  },
  {
    value: "#6b7a90",
    label: "Slate",
  },
];

const isValidHexColor = (value = "") => /^#[0-9a-fA-F]{6}$/.test(String(value).trim());

const toTitleCase = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeLanguage = (value = "") => String(value).trim().toLowerCase();

const EditProfilePage = () => {
  const navigate = useNavigate();
  const { user, refreshUserProfile } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    username: "",
    email: "",
    date_of_birth: "",
    native_language: "english",
    base_translate_language: "english",
    location: "",
    languages_practicing: [],
    avatar_ring_color: "#1b7f79",
  });

  useEffect(() => {
    const hydrate = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setForm({
        username: user.username || "",
        email: user.email || "",
        date_of_birth: user.date_of_birth || "",
        native_language: normalizeLanguage(user.native_language || "english"),
        base_translate_language: normalizeLanguage(
          user.base_translate_language || user.native_language || "english"
        ),
        location: user.location || "",
        languages_practicing: (user.languages_practicing || [])
          .map((lang) => normalizeLanguage(lang))
          .filter(Boolean),
        avatar_ring_color: user.avatar_ring_color || "#1b7f79",
      });
      setLoading(false);
    };
    hydrate();
  }, [user]);

  const selectedPracticing = useMemo(
    () =>
      form.languages_practicing
        .filter((lang) => LANGUAGE_OPTIONS.includes(lang))
        .map((lang) => toTitleCase(lang)),
    [form.languages_practicing]
  );

  const previewImageUrl = useMemo(() => {
    const raw = user?.profile_image_url || "";
    if (!raw) return `${BASE_URL}/media/profile_images/MainAfter.jpg`;
    if (raw.startsWith("http")) return raw;
    if (raw.startsWith("/media/")) return `${BASE_URL}${raw}`;
    return `${BASE_URL}/media/${raw}`;
  }, [user?.profile_image_url]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const togglePracticingLanguage = (language) => {
    setForm((prev) => {
      const exists = prev.languages_practicing.includes(language);
      return {
        ...prev,
        languages_practicing: exists
          ? prev.languages_practicing.filter((entry) => entry !== language)
          : [...prev.languages_practicing, language],
      };
    });
  };

  const detectLocation = async () => {
    try {
      setDetectingLocation(true);
      const { city, country } = await getUserLocation();
      const location = [city, country].filter(Boolean).join(", ");
      updateField("location", location);
      setError("");
    } catch (err) {
      setError(String(err || "Unable to detect location."));
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${BASE_URL}/api/profile/edit/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: form.username.trim(),
          email: form.email.trim().toLowerCase(),
          date_of_birth: form.date_of_birth || null,
          native_language: normalizeLanguage(form.native_language),
          base_translate_language: normalizeLanguage(form.base_translate_language),
          location: form.location.trim(),
          languages_practicing: form.languages_practicing.map((lang) =>
            toTitleCase(lang)
          ),
          avatar_ring_color: form.avatar_ring_color,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save profile.");
      }

      await refreshUserProfile();
      setSuccess("Profile updated.");
    } catch (err) {
      setError(String(err.message || "Failed to save profile."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Loading profile editor...</div>;
  }

  return (
    <div className="min-h-full bg-slate-50 p-3 sm:p-5 md:p-8">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            <ArrowBackIosNewOutlinedIcon fontSize="inherit" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-800 sm:text-2xl">Edit Profile</h1>
          <div className="w-14" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Username</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <PersonOutlineIcon fontSize="small" className="text-slate-500" />
              <input
                value={form.username}
                onChange={(event) => updateField("username", event.target.value)}
                className="w-full bg-transparent text-slate-800 outline-none"
                placeholder="Username"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <EmailOutlinedIcon fontSize="small" className="text-slate-500" />
              <input
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                className="w-full bg-transparent text-slate-800 outline-none"
                placeholder="Email"
                type="email"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Date of Birth</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <CalendarMonthOutlinedIcon fontSize="small" className="text-slate-500" />
              <input
                value={form.date_of_birth}
                onChange={(event) => updateField("date_of_birth", event.target.value)}
                className="w-full bg-transparent text-slate-800 outline-none"
                type="date"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Location</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <PlaceOutlinedIcon fontSize="small" className="text-slate-500" />
              <input
                value={form.location}
                onChange={(event) => updateField("location", event.target.value)}
                className="w-full bg-transparent text-slate-800 outline-none"
                placeholder="City, Country"
              />
              <button
                type="button"
                onClick={detectLocation}
                className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                title="Detect current location"
                disabled={detectingLocation}
              >
                <MyLocationOutlinedIcon fontSize="small" />
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Native Language</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <PublicOutlinedIcon fontSize="small" className="text-slate-500" />
              <select
                value={form.native_language}
                onChange={(event) => updateField("native_language", event.target.value)}
                className="w-full bg-transparent text-slate-800 outline-none"
              >
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language} value={language}>
                    {toTitleCase(language)}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Base Translate Language</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <TranslateOutlinedIcon fontSize="small" className="text-slate-500" />
              <select
                value={form.base_translate_language}
                onChange={(event) =>
                  updateField("base_translate_language", event.target.value)
                }
                className="w-full bg-transparent text-slate-800 outline-none"
              >
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language} value={language}>
                    {toTitleCase(language)}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <TranslateOutlinedIcon fontSize="small" />
            Languages Practicing
          </p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((language) => {
              const selected = form.languages_practicing.includes(language);
              return (
                <button
                  key={language}
                  type="button"
                  onClick={() => togglePracticingLanguage(language)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    selected
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {toTitleCase(language)}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Selected: {selectedPracticing.length ? selectedPracticing.join(", ") : "None"}
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200">
          <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#f7fafc_0%,#eef5f8_100%)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lv-link)]">
              Avatar Accent
            </p>
            <div className="mt-4 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div className="flex flex-col items-center rounded-[26px] border border-white/70 bg-white/80 p-5 text-center">
                <div
                  className="group h-28 w-28 overflow-hidden rounded-full border-4 shadow-sm sm:h-32 sm:w-32"
                  style={{ borderColor: form.avatar_ring_color }}
                >
                  <img
                    src={previewImageUrl}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-800">Live profile preview</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  This uses the same ring thickness and size as your main profile avatar.
                </p>
              </div>

              <div className="rounded-[26px] border border-white/70 bg-white/80 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">Pick a custom color</span>
                    <input
                      type="color"
                      value={isValidHexColor(form.avatar_ring_color) ? form.avatar_ring_color : "#1b7f79"}
                      onChange={(event) => updateField("avatar_ring_color", event.target.value.toLowerCase())}
                      className="h-12 w-16 cursor-pointer rounded-2xl border border-slate-200 bg-white p-1"
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Hex value
                    </span>
                    <input
                      type="text"
                      value={form.avatar_ring_color}
                      onChange={(event) => updateField("avatar_ring_color", event.target.value)}
                      placeholder="#1b7f79"
                      className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition ${
                        isValidHexColor(form.avatar_ring_color)
                          ? "border-slate-200 focus:border-[var(--lv-primary)]"
                          : "border-rose-300 focus:border-rose-400"
                      }`}
                    />
                  </label>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
                  <span
                    className="h-3 w-3 rounded-full border border-white"
                    style={{ backgroundColor: form.avatar_ring_color }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {form.avatar_ring_color}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Quick palettes</p>
                <p className="mt-1 text-sm text-slate-500">
                  Start from a balanced color, then fine-tune it with the picker.
                </p>
              </div>
            </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {AVATAR_RING_OPTIONS.map((option) => {
              const isSelected = form.avatar_ring_color.toLowerCase() === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateField("avatar_ring_color", option.value)}
                  className={`rounded-[22px] border px-3 py-3 text-left transition ${
                    isSelected
                      ? "border-[var(--lv-primary)] bg-[rgba(27,127,121,0.06)]"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div
                    className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border-[3px]"
                    style={{
                      borderColor: option.value,
                      backgroundColor: `${option.value}1a`,
                    }}
                  >
                    <span className="h-7 w-7 rounded-full bg-slate-200" />
                  </div>
                  <p className="text-sm font-medium text-slate-800">{option.label}</p>
                </button>
              );
            })}
          </div>
          {!isValidHexColor(form.avatar_ring_color) && (
            <p className="mt-3 text-xs text-rose-600">
              Enter a valid 6-digit hex color like `#1b7f79`.
            </p>
          )}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

        <div className="mt-8 flex flex-col gap-3 rounded-[24px] border border-[var(--lv-border)] bg-[var(--lv-surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--lv-text)]">Ready to update your profile?</p>
            <p className="mt-1 text-sm text-[var(--lv-muted-text)]">
              Save your changes to refresh how your profile appears across LangVoyage.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[var(--lv-navy)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#10263a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SaveOutlinedIcon fontSize="small" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditProfilePage;
