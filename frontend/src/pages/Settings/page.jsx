import React, { useEffect, useMemo, useRef, useState } from "react";
import { BASE_URL } from "../../constants/constants";
import { useUser } from "../../context/UserContext";

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English", flag: "gb" },
  { value: "spanish", label: "Spanish", flag: "es" },
  { value: "french", label: "French", flag: "fr" },
  { value: "german", label: "German", flag: "de" },
  { value: "italian", label: "Italian", flag: "it" },
  { value: "portuguese", label: "Portuguese", flag: "pt" },
  { value: "greek", label: "Greek", flag: "gr" },
  { value: "japanese", label: "Japanese", flag: "jp" },
  { value: "korean", label: "Korean", flag: "kr" },
  { value: "chinese", label: "Chinese", flag: "cn" },
  { value: "arabic", label: "Arabic", flag: "sa" },
  { value: "russian", label: "Russian", flag: "ru" },
  { value: "turkish", label: "Turkish", flag: "tr" },
  { value: "hindi", label: "Hindi", flag: "in" },
];

const normalizeLanguageValue = (value) => {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  const directMatch = LANGUAGE_OPTIONS.find((language) => language.value === normalized);
  if (directMatch) return directMatch.value;
  const labelMatch = LANGUAGE_OPTIONS.find(
    (language) => language.label.toLowerCase() === normalized
  );
  return labelMatch ? labelMatch.value : "";
};

const SettingsPage = () => {
  const { user, refreshUserProfile } = useUser();
  const languagesDropdownRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLanguagesDropdownOpen, setIsLanguagesDropdownOpen] = useState(false);

  const [baseTranslateLanguage, setBaseTranslateLanguage] = useState(
    normalizeLanguageValue(
      user?.base_translate_language || user?.native_language || "english"
    ) || "english"
  );
  const [languagesPracticing, setLanguagesPracticing] = useState(
    (user?.languages_practicing || [])
      .map((value) => normalizeLanguageValue(value))
      .filter(Boolean)
  );

  useEffect(() => {
    setBaseTranslateLanguage(
      normalizeLanguageValue(
        user?.base_translate_language || user?.native_language || "english"
      ) || "english"
    );
    setLanguagesPracticing(
      (user?.languages_practicing || [])
        .map((value) => normalizeLanguageValue(value))
        .filter(Boolean)
    );
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        languagesDropdownRef.current &&
        !languagesDropdownRef.current.contains(event.target)
      ) {
        setIsLanguagesDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedLanguageLabel = useMemo(() => {
    return LANGUAGE_OPTIONS.find((lang) => lang.value === baseTranslateLanguage);
  }, [baseTranslateLanguage]);

  const languageMap = useMemo(
    () =>
      LANGUAGE_OPTIONS.reduce((acc, language) => {
        acc[language.value] = language;
        return acc;
      }, {}),
    []
  );

  const selectedPracticingLanguages = useMemo(
    () =>
      languagesPracticing
        .map((value) => languageMap[value])
        .filter(Boolean),
    [languageMap, languagesPracticing]
  );

  const togglePracticingLanguage = (value) => {
    setLanguagesPracticing((prev) =>
      prev.includes(value)
        ? prev.filter((language) => language !== value)
        : [...prev, value]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const response = await fetch(`${BASE_URL}/api/profile/edit/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          base_translate_language: baseTranslateLanguage,
          languages_practicing: languagesPracticing.map(
            (value) => languageMap[value]?.label || value
          ),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save settings.");
      }

      await refreshUserProfile();
      setSuccess("Settings saved.");
    } catch (err) {
      setError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 p-3 sm:p-5 md:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-gray-600 mt-2">
          Choose your base language for message translation.
        </p>

        <div className="mt-6">
          <label
            htmlFor="base-translate-language"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Base Translate Language
          </label>
          <select
            id="base-translate-language"
            value={baseTranslateLanguage}
            onChange={(e) => setBaseTranslateLanguage(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LANGUAGE_OPTIONS.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Current: {selectedLanguageLabel?.label || baseTranslateLanguage}
          </p>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Languages Practicing
          </label>
          <div className="relative" ref={languagesDropdownRef}>
            <button
              type="button"
              onClick={() =>
                setIsLanguagesDropdownOpen((isOpen) => !isOpen)
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedPracticingLanguages.length > 0
                ? `${selectedPracticingLanguages.length} selected`
                : "Select practicing languages"}
            </button>

            {isLanguagesDropdownOpen && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="max-h-64 overflow-y-auto p-1">
                  {LANGUAGE_OPTIONS.map((language) => {
                    const isSelected = languagesPracticing.includes(language.value);
                    return (
                      <button
                        key={language.value}
                        type="button"
                        onClick={() => togglePracticingLanguage(language.value)}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                          isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <img
                            src={`https://flagcdn.com/w20/${language.flag}.png`}
                            alt={language.label}
                            className="h-5 w-5 rounded-full object-cover"
                          />
                          <span>{language.label}</span>
                        </span>
                        <span>{isSelected ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedPracticingLanguages.length > 0 ? (
              selectedPracticingLanguages.map((language) => (
                <span
                  key={language.value}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
                >
                  <img
                    src={`https://flagcdn.com/w20/${language.flag}.png`}
                    alt={language.label}
                    className="h-4 w-4 rounded-full object-cover"
                  />
                  {language.label}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500">
                No practicing languages selected.
              </span>
            )}
          </div>
        </div>

        {error && <p className="text-red-500 mt-4">{error}</p>}
        {success && <p className="text-green-600 mt-4">{success}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-blue-300 sm:w-auto"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
