import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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
        {/* Display the username here */}
        <span className="text-gray-800 font-semibold">{user.username}</span>
      </div>

      <h1 className="text-3xl font-bold">My Profile</h1>
      <h2 className="text-blue-300 mt-2">About me</h2>

      {/* Display error message if there is an error */}
      {error && <div className="mt-4 text-red-500">{error}</div>}
    </div>
  );
};

export default ProfilePage;
