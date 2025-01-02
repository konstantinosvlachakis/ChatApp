import React, { useEffect, useState } from "react";
import { fetchUserProfile } from "./api/fetchUserProfile";
import Sidebar from "../../components/Sidebar";
import ModalComponent from "../../components/Modals/Modal";
import { useEditNativeLanguage } from "../Profile/api/editProfile";
import { useNavigate } from "react-router-dom";

const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [error, setError] = useState(null);
  const [modalNameOpen, setModalNameOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const editNativeLanguageMutation = useEditNativeLanguage({});
  const navigate = useNavigate();

  useEffect(() => {
    fetchUserProfile(setUser, setNewDate, setError, navigate);
  }, []);

  const handleSaveName = async () => {
    try {
      const userData = { dateOfBirth: newDate }; // Ensure you include the username

      // Call the editNativeLanguage function to update the user profile
      await editNativeLanguageMutation.mutateAsync(userData);

      // Update the local user state with the updated profile data
      setUser((prevUser) => ({ ...prevUser, name: newName }));
      setModalNameOpen(false); // Close the modal after saving
    } catch (error) {
      // Set error if the update fails
      setError(error.message);
    }
  };

  const handleEditNameClick = () => {
    setModalNameOpen(true);
  };

  const handleCloseModal = () => {
    setModalNameOpen(false);
  };

  // Handle sign-out
  const handleSignOut = () => {
    // Clear the authentication token
    localStorage.removeItem("accessToken"); // or sessionStorage if you are using that

    // Redirect to the login page
    navigate("/login");
  };

  function handleModal() {
    return (
      <ModalComponent open={modalNameOpen} setOpen={setModalNameOpen}>
        <h2 className="text-lg font-semibold mb-4">Edit Name</h2>
        <input
          type="text"
          value={newDate}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full p-2 mb-4 border rounded"
          placeholder="Enter new Name"
        />
        <div className="flex justify-end space-x-2">
          <button
            className="bg-gray-300 text-gray-800 py-1 px-4 rounded"
            onClick={handleCloseModal}
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
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Profile Content */}
      <div className="flex-1 flex flex-col items-center p-8 space-y-6">
        <div className="absolute top-5 right-5 flex items-center space-x-3">
          {/* Sign Out Button */}
          <button
            className="text-sm font-medium bg-red-500 text-white py-1 px-4 rounded-full mt-4"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>

        {/* User Profile Picture */}
        <img
          src="https://live-s3-bucket-sjwburhj9xhf.cdn.live.tandem.net/dd/99/e31704e1e56b8550d431f660276fe183.jpg"
          alt={`${user.name}'s profile`}
          className="w-40 h-40 rounded-full object-cover mb-4 shadow-sm"
        />

        {/* Edit Profile Button */}
        <button
          className="text-sm font-medium bg-blue-500 text-white py-1 px-4 rounded-full mt-2"
          onClick={handleEditNameClick}
        >
          Edit
        </button>
        {modalNameOpen && handleModal()}

        {/* Profile Info Container */}
        <div className="w-full max-w-lg p-4 rounded-lg bg-gray-50">
          <div className="space-y-4">
            <div>
              <div className="flex flex-row justify-between">
                <h2 className="text-lg font-semibold text-gray-600">Name:</h2>
              </div>
              <p className="text-gray-800">{user.name || "John Doe"}</p>
            </div>
            <hr className="border-gray-200" />

            <div>
              <h2 className="text-lg font-semibold text-gray-600">
                Date of Birth:
              </h2>

              <p className="text-gray-800">
                {user.dateOfBirth || "Not provided"}
              </p>
            </div>
            <hr className="border-gray-200" />

            <div>
              <h2 className="text-lg font-semibold text-gray-600">Location:</h2>
              <p className="text-gray-800">
                {user.location || "Not specified"}
              </p>
            </div>
            <hr className="border-gray-200" />

            <div>
              <h2 className="text-lg font-semibold text-gray-600">
                Native Language:
              </h2>
              <p className="text-gray-800">
                {user.native_language || "English"}
              </p>
            </div>
            <hr className="border-gray-200" />

            <div>
              <h2 className="text-lg font-semibold text-gray-600">
                Languages Practicing:
              </h2>
              <p className="text-gray-800">
                {user.languages || "Spanish, French"}
              </p>
            </div>
            <hr className="border-gray-200" />

            <div>
              <h2 className="text-lg font-semibold text-gray-600">
                Learning Goal:
              </h2>
              <p className="text-gray-800">
                {user.learningGoal || "Become fluent for travel"}
              </p>
            </div>
            <hr className="border-gray-200" />

            <div>
              <h2 className="text-lg font-semibold text-gray-600">
                Date Joined:
              </h2>
              <p className="text-gray-800">
                {user.dateJoined || "January 1, 2023"}
              </p>
            </div>
          </div>
          {error && <div className="mt-4 text-red-500">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
