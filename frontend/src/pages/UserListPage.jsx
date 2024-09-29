import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const UserListPage = () => {
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(
          "http://localhost:3001/connected-users",
          {
            withCredentials: true, // This ensures cookies are sent with the request
          }
        );
        setUsers(response.data);
      } catch (error) {
        console.error("Error fetching connected users:", error.message);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-4xl">
        <h2 className="text-2xl font-bold mb-4 text-center">Connected Users</h2>
        <ul className="space-y-4">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex items-center space-x-4 p-4 border rounded-lg"
            >
              <img
                src={user.avatar_url}
                alt={`${user.username}'s avatar`}
                className="w-16 h-16 rounded-full"
              />
              <span className="text-lg font-medium">{user.username}</span>
              <button
                className="ml-auto bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-md focus:outline-none"
                onClick={() => handleButtonClick(user.id)}
              >
                Connect
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  function handleButtonClick(userId) {
    // Handle button click logic (e.g., navigate to user's profile)
    navigate(`/user/${userId}`);
  }
};

export default UserListPage;
