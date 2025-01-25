import React, { useEffect, useState } from "react";
import { fetchUserProfile } from "./api/fetchUserProfile";
import Sidebar from "./features/Sidebar";
import ChatRoom from "./features/ChatRoom";
import ModalComponent from "../../components/Modals/Modal";
import { useEditProfile } from "./api/editProfile";
import { useNavigate } from "react-router-dom";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DragDropImage from "../../components/Images/DragDropImage";
import { BASE_URL } from "../../constants/constants";

const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [error, setError] = useState(null);
  const [modalNameOpen, setModalNameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [activeConversation, setActiveConversation] = useState(null);
  const editProfileMutation = useEditProfile({});
  const navigate = useNavigate();
  const imageUrl = BASE_URL + user.profile_image_url;

  useEffect(() => {
    fetchUserProfile(setUser, () => {}, setError, navigate);
  }, [navigate]);

  const handleImageDrop = (file) => console.log("Image dropped:", file);

  const handleSaveName = async () => {
    try {
      await editProfileMutation.mutateAsync({ username: newName });
      setUser((prev) => ({ ...prev, username: newName }));
      setModalNameOpen(false);
    } catch (err) {
      setError(err.message);
    }
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

  const handleModal = () => (
    <ModalComponent open={modalNameOpen} setOpen={setModalNameOpen}>
      <h2 className="text-lg font-semibold mb-4">Edit Name</h2>
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="w-full p-2 mb-4 border rounded"
        placeholder="Enter new Name"
      />
      <div className="flex justify-end space-x-2">
        <button
          className="bg-gray-300 text-gray-800 py-1 px-4 rounded"
          onClick={() => setModalNameOpen(false)}
        >
          Close
        </button>
        <button
          className="bg-blue-500 text-white py-1 px-4 rounded"
          onClick={handleSaveName}
        >
          Save
        </button>
      </div>
    </ModalComponent>
  );

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar
        onSelectConversation={setActiveConversation}
        activeConversationId={activeConversation?.id}
      />
      <div className="flex-1 p-4">
        {activeConversation ? (
          <div className="relative flex flex-col h-full">
            <IconButton
              className="absolute top-4 right-4"
              color="primary"
              onClick={() => setActiveConversation(null)}
              aria-label="Back to Profile"
            >
              <ArrowBackIcon />
            </IconButton>
            <ChatRoom conversation={activeConversation} user={user} />
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-6">
            <button
              className="absolute top-5 right-5 bg-red-500 text-white py-1 px-4 rounded-full"
              onClick={() => navigate("/login")}
            >
              Sign Out
            </button>
            <DragDropImage
              onImageDrop={handleImageDrop}
              initialImage={imageUrl}
            />
            <button
              className="bg-blue-500 text-white py-1 px-4 rounded-full"
              onClick={() => setModalNameOpen(true)}
            >
              Edit
            </button>
            {modalNameOpen && handleModal()}
            <div className="w-full max-w-lg p-4 rounded-lg bg-gray-50 space-y-4">
              {profileFields.map(({ label, value }, index) => (
                <div key={index}>
                  <h2 className="text-lg font-semibold text-gray-600">
                    {label}:
                  </h2>
                  <p className="text-gray-800">{value}</p>
                  {index < profileFields.length - 1 && (
                    <hr className="border-gray-200" />
                  )}
                </div>
              ))}
              {error && <div className="mt-4 text-red-500">{error}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
