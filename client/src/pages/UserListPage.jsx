import React, { useEffect, useState } from "react";
import axios from "axios";

const UserListPage = () => {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem("token"); // Retrieve token from localStorage
        if (!token) {
          throw new Error("Token not found");
        }

        const response = await axios.get(
          "http://localhost:3001/connected-users",
          {
            headers: {
              Authorization: `Bearer ${token}`, // Send token in Authorization header
            },
          }
        );
        setUsers(response.data);
      } catch (error) {
        console.error("Error fetching connected users:", error);
        // Handle error: for example, redirect to login or display an error message
      }
    };

    fetchUsers();
  }, []);

  console.log(users);

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
              <button className="ml-auto bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 focus:outline-none">
                Green Button
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default UserListPage;
