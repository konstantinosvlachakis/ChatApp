import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalComponent from "../../components/Modals/Modal";
import DragDropImage from "../../components/Images/DragDropImage";
import { useEditProfile } from "./api/editProfile";
import { BASE_URL_IMG } from "../../constants/constants";

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalNameOpen, setModalNameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const editProfileMutation = useEditProfile({});
  const navigate = useNavigate();

  // Simplified fetch (no external helpers)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = sessionStorage.getItem("accessToken");
        if (!token) {
          navigate("/login");
          return;
        }

        const res = await fetch(`${BASE_URL_IMG}/api/profile/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 401) {
          sessionStorage.removeItem("accessToken");
          navigate("/login");
          return;
        }

        if (!res.ok) throw new Error("Failed to fetch user profile");
        const data = await res.json();
        setUser(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  const handleSaveName = async () => {
    try {
      await editProfileMutation.mutateAsync({ username: newName });
      setUser((prev) => ({ ...prev, username: newName }));
      setModalNameOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem("accessToken");
    navigate("/login");
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

  const profileFields = [
    { label: "Name", value: user.username || "John Doe" },
    { label: "Date of Birth", value: user.date_of_birth || "Not provided" },
    { label: "Location", value: user.location || "Not specified" },
    { label: "Native Language", value: user.native_language || "English" },
    { label: "Languages Practicing", value: user.languages || "Not provided" },
    { label: "Learning Goal", value: user.learningGoal || "Not specified" },
    { label: "Date Joined", value: user.dateJoined || "Unknown" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-pink-50 p-4">
      <div className="relative w-full max-w-3xl p-10 bg-white rounded-3xl shadow-2xl flex flex-col items-center gap-6">
        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className="absolute top-6 right-6 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-full transition-transform hover:scale-105"
        >
          Sign Out
        </button>

        {/* Profile Image */}
        <DragDropImage onImageDrop={() => {}} initialImage={imageUrl} />

        {/* Edit Button */}
        <button
          onClick={() => setModalNameOpen(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-6 rounded-full shadow hover:scale-105 transition-transform"
        >
          Edit Profile
        </button>

        {/* Profile Info */}
        <div className="w-full flex flex-col gap-6">
          {profileFields.map(({ label, value }, i) => (
            <div key={i} className="flex flex-col">
              <h2 className="text-lg font-semibold text-gray-700">{label}:</h2>
              <p className="text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modalNameOpen && (
        <ModalComponent open={modalNameOpen} setOpen={setModalNameOpen}>
          <h2 className="text-lg text-black font-bold mb-4">Edit name</h2>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full p-2 mb-4 border rounded text-black focus:ring focus:border-blue-300"
            placeholder="Type your new name..."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setModalNameOpen(false)}
              className="bg-gray-300 text-gray-800 py-1 px-4 rounded hover:bg-gray-400 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveName}
              className="bg-blue-500 text-white py-1 px-4 rounded hover:bg-blue-600 transition"
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
