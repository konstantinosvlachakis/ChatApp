import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, MenuItem } from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Sidebar from "../../components/Sidebar";

const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [error, setError] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/profile/", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          console.log("User profile fetched successfully");
        } else {
          const errorData = await response.json();
          setError(errorData.error);
          console.error("Error fetching profile:", errorData.error);
        }
      } catch (error) {
        setError(error.message);
        console.error("Error fetching profile:", error.message);
      }
    };

    fetchUserProfile();
  }, [navigate]);

  const handleClick = (event) => {
    setAnchorEl(menuOpen ? null : event.currentTarget);
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Profile Content */}
      <div className="flex-1 flex flex-col items-center p-8 space-y-6">
        <div className="absolute top-5 right-5 flex items-center space-x-3">
          <span
            className="text-gray-800 font-semibold cursor-pointer flex items-center space-x-1"
            onClick={handleClick}
          >
            Profile
            {menuOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </span>

          <Menu
            anchorEl={anchorEl}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
          >
            <MenuItem>About me: {user.about_me || "N/A"}</MenuItem>
            <MenuItem>Languages: {user.languages || "N/A"}</MenuItem>
          </Menu>
        </div>

        {/* User Profile Picture */}
        <img
          src="https://live-s3-bucket-sjwburhj9xhf.cdn.live.tandem.net/dd/99/e31704e1e56b8550d431f660276fe183.jpg"
          alt={`${user.name}'s profile`}
          className="w-40 h-40 rounded-full object-cover mb-4 shadow-sm"
        />

        {/* Edit Profile Button */}
        <button className="text-sm font-medium bg-blue-500 text-white py-1 px-4 rounded-full mt-2">
          Edit
        </button>

        {/* Profile Info Container */}
        <div className="w-full max-w-lg p-4 rounded-lg bg-gray-50">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-600">Name:</h2>
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
                {user.nativeLanguage || "English"}
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
