import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL_IMG } from "../../constants/constants";
import { getUserLocation } from "./utils/getUserLocation";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState("");
  const navigate = useNavigate();
  const isDetectingLocationRef = useRef(false);

  // ---- Fetch User ----
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${BASE_URL_IMG}/api/profile/`, {
          credentials: "include",
        });

        if (res.status === 401) {
          navigate("/login");
          return;
        }

        const data = await res.json();
        setUser(data);
      } catch (err) {
        console.error(err);
        setError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  // ---- Detect and Save User Location ----
  useEffect(() => {
    const detectLocation = async () => {
      if (!user) return;
      if ((user.location || "").trim()) {
        return;
      }
      if (isDetectingLocationRef.current) return;
      isDetectingLocationRef.current = true;

      try {
        const { city, country } = await getUserLocation();
        const locationString = `${city}, ${country}`;
        console.log(`Detected location: ${locationString}`);

        const response = await fetch(`${BASE_URL_IMG}/api/profile/location/`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            city,
            country,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to update location.");
        }

        const payload = await response.json();
        setUser((prev) =>
          prev
            ? {
                ...prev,
                location: payload.location || locationString,
                location_updated_at: payload.location_updated_at,
              }
            : prev
        );
      } catch (err) {
        console.warn("Could not get location:", err);
      } finally {
        isDetectingLocationRef.current = false;
      }
    };

    detectLocation();
  }, [user]);

  if (loading) return <div className="p-8 text-gray-500">Loading profile...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!user) return null;

  const resolveMediaUrl = (path) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    if (path.startsWith("/media/")) return `${BASE_URL_IMG}${path}`;
    return `${BASE_URL_IMG}/media/${path}`;
  };

  const uploadPhoto = async (slot, file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please select a valid image.");
      return;
    }

    try {
      setUploadingSlot(slot);
      const formData = new FormData();
      formData.append("profile_image", file);
      formData.append("slot", slot);

      const res = await fetch(
        `${BASE_URL_IMG}/api/profile/${user.user_id}/update-image/`,
        {
          method: "PATCH",
          credentials: "include",
          body: formData,
        }
      );

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "Failed to upload image.");
      }

      const payload = await res.json();
      setUser((prev) => ({
        ...prev,
        profile_image_url: payload.profile_image_url || prev.profile_image_url,
        complementary_image_1_url:
          payload.complementary_image_1_url || prev.complementary_image_1_url,
        complementary_image_2_url:
          payload.complementary_image_2_url || prev.complementary_image_2_url,
      }));
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to upload image.");
    } finally {
      setUploadingSlot("");
    }
  };

  const imageUrl = resolveMediaUrl(user.profile_image_url) || "/default-avatar.png";
  const avatarRingColor = /^#[0-9a-fA-F]{6}$/.test(user.avatar_ring_color || "")
    ? user.avatar_ring_color
    : "#1b7f79";
  const photoCards = [
    {
      key: "profile",
      label: "Profile Picture",
      image: resolveMediaUrl(user.profile_image_url),
    },
    {
      key: "complementary_1",
      label: "Complementary 1",
      image: resolveMediaUrl(user.complementary_image_1_url),
    },
    {
      key: "complementary_2",
      label: "Complementary 2",
      image: resolveMediaUrl(user.complementary_image_2_url),
    },
  ];
  const practicingLanguages = user.languages_practicing || user.languages || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-blue-50/40 p-3 sm:p-5 md:p-8">
      <div className="mx-auto max-w-5xl 2xl:max-w-6xl">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.45)] backdrop-blur sm:p-6 md:p-8">
          <div
            className="group h-28 w-28 overflow-hidden rounded-full border-4 shadow-sm sm:h-32 sm:w-32 md:h-36 md:w-36"
            style={{ borderColor: avatarRingColor }}
          >
            <img
              src={imageUrl}
              alt="Profile"
              className="h-full w-full scale-110 object-cover transition-transform duration-300 ease-out group-hover:scale-125"
            />
          </div>
          <h1 className="text-center text-xl font-bold text-slate-800 sm:text-2xl">
            {user.username}, {user.age}
          </h1>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-4 py-2 text-sm text-white transition hover:bg-slate-800 sm:text-base"
            onClick={() => navigate("/profile/edit")}
          >
            <EditOutlinedIcon fontSize="small" />
            Edit Profile
          </button>
        </div>

        {/* Info Sections */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 md:mt-8 md:grid-cols-2 md:gap-8">
          {/* Personal Info */}
          <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)] sm:p-5 md:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800 sm:text-xl">
              <PersonOutlineIcon fontSize="small" className="text-slate-600" />
              Personal Information
            </h2>
            <div className="space-y-3 text-slate-700">
              <p>
                <strong>Name:</strong> {user.username || "N/A"}
              </p>
              <p>
                <strong>Age:</strong> {user.age || "Not provided"}
              </p>
              <p>
                <strong>Location:</strong>{" "}
                {user.location ? (
                  <span className="text-slate-800">{user.location}</span>
                ) : (
                  <span className="text-slate-500">Detecting...</span>
                )}
              </p>
              <p>
                <strong>Bio:</strong>{" "}
                {user.bio ||
                  "Passionate about learning new languages and connecting with people from different cultures."}
              </p>
            </div>
          </div>

          {/* Languages */}
          <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)] sm:p-5 md:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800 sm:text-xl">
              <PublicOutlinedIcon fontSize="small" className="text-slate-600" />
              Languages
            </h2>
            <div className="space-y-3 text-slate-700">
              <p>
                <strong>Native Language:</strong>{" "}
                <span className="inline-block rounded-full bg-sky-100 px-3 py-1 text-sm text-sky-700">
                  {user.native_language || "N/A"}
                </span>
              </p>
              <p>
                <strong>Languages Practicing:</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                {(practicingLanguages.length
                  ? practicingLanguages
                  : ["English", "Spanish", "French"]
                ).map((lang, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                    >
                      {lang}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Learning Goals */}
        <div className="mt-4 rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)] sm:mt-6 sm:p-5 md:mt-8 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800 sm:text-xl">
            <FlagOutlinedIcon fontSize="small" className="text-slate-600" />
            Learning Goals
          </h2>
          <p className="text-slate-700">
            {user.learningGoal ||
              "My goal is to become fluent and confident in new languages for both travel and communication."}
          </p>
        </div>

        {/* Photos */}
        <div className="mt-4 rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)] sm:mt-6 sm:p-5 md:mt-8 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800 sm:text-xl">
            <PhotoLibraryOutlinedIcon fontSize="small" className="text-slate-600" />
            Photos
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            Add one profile photo and two complementary photos.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {photoCards.map((card) => (
              <label
                key={card.key}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-2 transition hover:border-sky-400"
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      uploadPhoto(card.key, file);
                    }
                    e.target.value = "";
                  }}
                />
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                  {card.image ? (
                    <img
                      src={card.image}
                      alt={card.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl text-slate-400">+</span>
                  )}
                  {uploadingSlot === card.key && (
                    <div className="absolute inset-0 bg-black/40 text-white text-sm flex items-center justify-center">
                      Uploading...
                    </div>
                  )}
                </div>
                <p className="mt-2 text-center text-sm font-medium text-slate-700">
                  {card.label}
                </p>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
