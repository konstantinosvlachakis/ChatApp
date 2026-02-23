import React, { useMemo, useState } from "react";
import { BASE_URL } from "../../constants/constants";
import { useUser } from "../../context/UserContext";

const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Greek",
  "Japanese",
  "Korean",
  "Chinese",
  "Arabic",
  "Russian",
  "Turkish",
  "Hindi",
];

const SettingsPage = () => {
  const { user, refreshUserProfile } = useUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [baseTranslateLanguage, setBaseTranslateLanguage] = useState(
    (user?.base_translate_language || user?.native_language || "english").toLowerCase()
  );

  const selectedLanguageLabel = useMemo(() => {
    return LANGUAGE_OPTIONS.find(
      (lang) => lang.toLowerCase() === baseTranslateLanguage
    );
  }, [baseTranslateLanguage]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const token = sessionStorage.getItem("accessToken");

      const response = await fetch(`${BASE_URL}/api/profile/edit/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          base_translate_language: baseTranslateLanguage,
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
    <div className="min-h-full bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
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
              <option key={language} value={language.toLowerCase()}>
                {language}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Current: {selectedLanguageLabel || baseTranslateLanguage}
          </p>
        </div>

        {error && <p className="text-red-500 mt-4">{error}</p>}
        {success && <p className="text-green-600 mt-4">{success}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
