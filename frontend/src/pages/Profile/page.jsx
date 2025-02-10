import React, { useEffect, useState, useCallback } from "react";
import { fetchUserProfile } from "./api/fetchUserProfile";
import Sidebar from "./features/Sidebar";
import ChatRoom from "./features/ChatRoom";
import ModalComponent from "../../components/Modals/Modal";
import { useEditProfile } from "./api/editProfile";
import { useNavigate } from "react-router-dom";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DragDropImage from "../../components/Images/DragDropImage";
import { BASE_URL_IMG } from "../../constants/constants";

const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [error, setError] = useState(null);
  const [modalNameOpen, setModalNameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [activeConversation, setActiveConversation] = useState(null);
  const editProfileMutation = useEditProfile({});
  const navigate = useNavigate();
  console.log(user.profile_image_url);

  const imageUrl = user.profile_image_url
    ? BASE_URL_IMG + user.profile_image_url
    : "/default-avatar.png";
  console.log(imageUrl);
  useEffect(() => {
    fetchUserProfile(setUser, () => {}, setError, navigate);
  }, [navigate]);

  const handleImageDrop = useCallback((file) => {
    console.log("Image dropped:", file);
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
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar
        onSelectConversation={setActiveConversation}
        activeConversationId={activeConversation?.id}
      />

      {/* Main Content */}
      <div className="flex-1 relative p-6">
        {activeConversation ? (
          <div className="flex flex-col h-full">
            <div className="absolute top-4 right-4">
              <IconButton
                color="primary"
                aria-label="Back to Profile"
                onClick={() => setActiveConversation(null)}
              >
                <ArrowBackIcon />
              </IconButton>
            </div>
            <ChatRoom conversation={activeConversation} user={user} />
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-6 w-full">
            {/* Sign Out Button */}
            <button
              className="absolute top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-full hover:bg-red-600 transition"
              onClick={handleSignOut}
            >
              Sign Out
            </button>

            {/* Profile Image */}
            <DragDropImage
              onImageDrop={handleImageDrop}
              initialImage={imageUrl}
            />

            {/* Edit Button */}
            <button
              className="bg-blue-500 text-white py-2 px-4 rounded-full hover:bg-blue-600 transition"
              onClick={() => setModalNameOpen(true)}
            >
              Edit
            </button>

            {/* Profile Details */}
            <div className="w-full max-w-lg p-6 bg-white rounded-lg shadow-md">
              {profileFields.map(({ label, value }, index) => (
                <div key={index} className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-700">
                    {label}:
                  </h2>
                  <p className="text-gray-900">{value}</p>
                  {index < profileFields.length - 1 && (
                    <hr className="border-gray-200 mt-2" />
                  )}
                </div>
              ))}
              {error && <div className="text-red-500 mt-4">{error}</div>}
            </div>
          </div>
        )}
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
          <div className="flex justify-end space-x-2">
            <button
              className="bg-gray-300 text-gray-800 py-1 px-4 rounded hover:bg-gray-400 transition"
              onClick={() => setModalNameOpen(false)}
            >
              Close
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
