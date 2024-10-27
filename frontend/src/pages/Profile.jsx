import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, MenuItem } from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [error, setError] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false); // Track if menu is open

  const navigate = useNavigate();

  // Fetch user profile on component mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/profile/", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          console.log("User profile fetched successfully");
        } else {
          const errorData = await response.json();
          setError(errorData.error); // Set the error state
          console.error("Error fetching profile:", errorData.error);
        }
      } catch (error) {
        setError(error.message); // Set the error state
        console.error("Error fetching profile:", error.message);
      }
    };

    fetchUserProfile();
  }, [navigate]);

  // Function to handle click event and toggle menu
  const handleClick = (event) => {
    if (menuOpen) {
      setMenuOpen(false);
      setAnchorEl(null); // Close the menu
    } else {
      setAnchorEl(event.currentTarget);
      setMenuOpen(true); // Open the menu
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-100 flex flex-col items-center justify-center">
      <div className="absolute top-5 right-5 flex items-center space-x-3">
        {user.profile_image_url && (
          <img
            src={user.profile_image_url}
            alt={`${user.name}'s profile`}
            className="w-10 h-10 rounded-full object-cover"
          />
        )}

        {/* Display the username and toggle menu on click */}
        <span
          className="text-gray-800 font-semibold cursor-pointer flex items-center space-x-1"
          onClick={handleClick}
        >
          {user.username}
          {menuOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </span>

        {/* Dropdown Menu for 'About me' and 'Languages' */}
        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        >
          <MenuItem>About me: {user.about_me || "N/A"}</MenuItem>
          <MenuItem>Languages: {user.languages || "N/A"}</MenuItem>
        </Menu>
      </div>

      <h1 className="text-3xl font-bold">My Profile</h1>
      <h2 className="text-blue-300 mt-2">About me</h2>

      {/* Display error message if there is an error */}
      {error && <div className="mt-4 text-red-500">{error}</div>}
    </div>
  );
};

export default ProfilePage;
