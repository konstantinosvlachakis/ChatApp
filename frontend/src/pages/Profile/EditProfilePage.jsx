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

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
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
