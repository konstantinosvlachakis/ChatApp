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

  const imageUrl =
    user.profile_image_url
      ? user.profile_image_url.startsWith("http")
        ? user.profile_image_url
        : `${BASE_URL_IMG}${user.profile_image_url}`
      : "/default-avatar.png";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-8 flex flex-col items-center gap-4">
          <img
            src={imageUrl}
            alt="Profile"
            className="w-32 h-32 rounded-full object-cover border-4 border-blue-300"
          />
          <h1 className="text-2xl font-bold text-gray-800">
            {user.username}, {user.age}
          </h1>
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full transition"
            onClick={() => setModalNameOpen(true)}
          >
            Edit Profile
          </button>
        </div>

        {/* Info Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          {/* Personal Info */}
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
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
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
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
                {(user.languages || ["English", "Spanish", "French"]).map(
                  (lang, i) => (
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
        <div className="bg-white rounded-2xl shadow p-6 mt-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
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
