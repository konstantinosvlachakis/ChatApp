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
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="absolute top-5 right-5 flex items-center space-x-3">
          <img
            src={
              "https://live-s3-bucket-sjwburhj9xhf.cdn.live.tandem.net/dd/99/e31704e1e56b8550d431f660276fe183.jpg"
            }
            alt={`${user.name}'s profile`}
            className="w-10 h-10 rounded-full object-cover"
          />

          <span
            className="text-gray-800 font-semibold cursor-pointer flex items-center space-x-1"
            onClick={handleClick}
          >
            {user.username}
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

        <h1 className="text-3xl font-bold">My Profile</h1>
        <h2 className="text-blue-300 mt-2">About me</h2>

        {error && <div className="mt-4 text-red-500">{error}</div>}
      </div>
    </div>
  );
};

export default ProfilePage;
