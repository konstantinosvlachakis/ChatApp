import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL_IMG } from "../../constants/constants";
import { useEditProfile } from "./api/editProfile";
import ModalComponent from "../../components/Modals/Modal";
import { getUserLocation } from "./utils/getUserLocation";

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalNameOpen, setModalNameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [uploadingSlot, setUploadingSlot] = useState("");
  const editProfileMutation = useEditProfile({});
  const navigate = useNavigate();

  // ---- Fetch User ----
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = sessionStorage.getItem("accessToken");
        if (!token) return navigate("/login");

        const res = await fetch(`${BASE_URL_IMG}/api/profile/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          sessionStorage.removeItem("accessToken");
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
      if (!user || user.location) return; // skip if user not loaded or already has location

      try {
        const { city, country } = await getUserLocation();
        const locationString = `${city}, ${country}`;
        console.log(`Detected location: ${locationString}`);

        // Send to backend
        await fetch(`${BASE_URL_IMG}/api/profile/`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("accessToken")}`,
          },
          body: JSON.stringify({ location: locationString }),
        });

        // Update UI immediately
        setUser((prev) => (prev ? { ...prev, location: locationString } : prev));
      } catch (err) {
        console.warn("Could not get location:", err);
      }
    };

    detectLocation();
  }, [user]);

  // ---- Edit Name ----
  const handleSaveName = async () => {
    try {
      await editProfileMutation.mutateAsync({ username: newName });
      setUser((prev) => ({ ...prev, username: newName }));
      setModalNameOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

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
      const token = sessionStorage.getItem("accessToken");
      const formData = new FormData();
      formData.append("profile_image", file);
      formData.append("slot", slot);

      const res = await fetch(
        `${BASE_URL_IMG}/api/profile/${user.user_id}/update-image/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
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
    <div className="min-h-screen bg-gray-50 p-3 sm:p-5 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-5 sm:p-6 md:p-8 flex flex-col items-center gap-4">
          <img
            src={imageUrl}
            alt="Profile"
            className="h-24 w-24 rounded-full object-cover border-4 border-blue-300 sm:h-28 sm:w-28 md:h-32 md:w-32"
          />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 text-center">
            {user.username}, {user.age}
          </h1>
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full transition text-sm sm:text-base"
            onClick={() => setModalNameOpen(true)}
          >
            Edit Profile
          </button>
        </div>

        {/* Info Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mt-4 sm:mt-6 md:mt-8">
          {/* Personal Info */}
          <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
              <span role="img" aria-label="user">
                👤
              </span>
              Personal Information
            </h2>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>Name:</strong> {user.username || "N/A"}
              </p>
              <p>
                <strong>Age:</strong> {user.age || "Not provided"}
              </p>
              <p>
                <strong>Location:</strong>{" "}
                {user.location ? (
                  <span className="text-gray-800">{user.location}</span>
                ) : (
                  <span className="text-gray-500">Detecting...</span>
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
          <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
              <span role="img" aria-label="globe">
                🌐
              </span>
              Languages
            </h2>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>Native Language:</strong>{" "}
                <span className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
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
                      className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
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
        <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6 mt-4 sm:mt-6 md:mt-8">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            <span role="img" aria-label="target">
              🎯
            </span>
            Learning Goals
          </h2>
          <p className="text-gray-700">
            {user.learningGoal ||
              "My goal is to become fluent and confident in new languages for both travel and communication."}
          </p>
        </div>

        {/* Photos */}
        <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6 mt-4 sm:mt-6 md:mt-8">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            <span role="img" aria-label="camera">
              📸
            </span>
            Photos
          </h2>
          <p className="text-sm text-gray-600 mb-5">
            Add one profile photo and two complementary photos.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {photoCards.map((card) => (
              <label
                key={card.key}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 transition p-2"
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
                <div className="w-full aspect-square rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center relative">
                  {card.image ? (
                    <img
                      src={card.image}
                      alt={card.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl text-gray-400">+</span>
                  )}
                  {uploadingSlot === card.key && (
                    <div className="absolute inset-0 bg-black/40 text-white text-sm flex items-center justify-center">
                      Uploading...
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-gray-700 text-center">
                  {card.label}
                </p>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Name Modal */}
      {modalNameOpen && (
        <ModalComponent open={modalNameOpen} setOpen={setModalNameOpen}>
          <h2 className="text-lg text-black font-bold mb-4">Edit name</h2>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full p-2 mb-4 border rounded focus:outline-none text-black focus:border-blue-300"
            placeholder="Type your new name..."
          />
          <div className="flex justify-end gap-2">
            <button
              className="bg-gray-300 text-gray-800 py-1 px-4 rounded hover:bg-gray-400 transition"
              onClick={() => setModalNameOpen(false)}
            >
              Cancel
            </button>
            <button
              className="bg-blue-500 text-white py-1 px-4 rounded hover:bg-blue-600 transition"
              onClick={handleSaveName}
            >
              Save
            </button>
          </div>
        </ModalComponent>
      )}
    </div>
  );
};

export default ProfilePage;
