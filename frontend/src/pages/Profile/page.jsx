import React, { useEffect, useState, useCallback } from "react";
import { fetchUserProfile } from "../Conversations/api/fetchUserProfile";
import ModalComponent from "../../components/Modals/Modal";
import { useEditProfile } from "./api/editProfile";
import { useNavigate } from "react-router-dom";
import DragDropImage from "../../components/Images/DragDropImage";
import { BASE_URL_IMG } from "../../constants/constants";

const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [error, setError] = useState(null);
  const [modalNameOpen, setModalNameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const editProfileMutation = useEditProfile({});
  const navigate = useNavigate();

  const imageUrl = user.profile_image_url
    ? BASE_URL_IMG + user.profile_image_url
    : "/default-avatar.png";


  useEffect(() => {
    fetchUserProfile(setUser, () => {}, setError, navigate);
  }, [navigate]);

  const handleImageDrop = useCallback((file) => {
  }, []);

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

  const profileFields = [
    { label: "Name", value: user.username || "John Doe" },
    { label: "Date of Birth", value: user.date_of_birth || "Not provided" },
    { label: "Location", value: user.location || "Not specified" },
    { label: "Native Language", value: user.native_language || "English" },
    {
      label: "Languages Practicing",
      value: user.languages || "Spanish, French",
    },
    {
      label: "Learning Goal",
      value: user.learningGoal || "Become fluent for travel",
    },
    { label: "Date Joined", value: user.dateJoined || "January 1, 2023" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-pink-50 p-4">
      <div className="relative w-full max-w-3xl p-10 bg-white rounded-3xl shadow-2xl flex flex-col items-center gap-6">
        {/* Sign Out Button */}
        <button
          className="absolute top-6 right-6 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-full transition-transform transform hover:scale-105"
          onClick={handleSignOut}
        >
          Sign Out
        </button>

        {/* Profile Image */}
        <DragDropImage onImageDrop={handleImageDrop} initialImage={imageUrl} />

        {/* Edit Button */}
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-6 rounded-full shadow hover:scale-105 transition-transform"
          onClick={() => setModalNameOpen(true)}
        >
          Edit Profile
        </button>

        {/* Profile Details */}
        <div className="w-full flex flex-col gap-6">
          {profileFields.map(({ label, value }, index) => (
            <div key={index} className="flex flex-col">
              <h2 className="text-lg font-semibold text-gray-700">{label}:</h2>
              <p className="text-gray-900">{value}</p>
            </div>
          ))}
          {error && <div className="text-red-500 mt-4">{error}</div>}
        </div>
      </div>

      {/* Edit Name Modal */}
      {modalNameOpen && (
        <ModalComponent open={modalNameOpen} setOpen={setModalNameOpen}>
          <h2 className="text-lg font-semibold mb-4">Edit Name</h2>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full p-2 mb-4 border rounded focus:outline-none focus:ring focus:border-blue-300"
            placeholder="Enter new Name"
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
