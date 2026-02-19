import React from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

const Layout = () => {
  const location = useLocation(); // To identify the active page
  const navigate = useNavigate();
  const { setUser } = useUser();

  const handleLogout = () => {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    setUser(null);
    navigate("/login");
  };

  return (
    <div className="flex flex-col ">
      {/* Header/Menu */}
      <header className="bg-gray-700 text-white p-4 shadow-md">
        <nav className="flex items-center justify-between gap-4 ml-4 mr-4">
          {/* Clickable Logo on the top left */}
          <div className="flex items-center gap-4">
            <Link
              to="/profile"
              className="text-xl font-bold tracking-wide  cursor-pointer mr-6"
            >
              LangVoyage
            </Link>

            {/* Navigation Links */}
            <div className="flex space-x-4">
              <Link
                to="/community"
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === "/community"
                    ? "bg-white text-blue-600 shadow"
                    : "hover:bg-blue-700 hover:text-white"
                }`}
              >
                People
              </Link>
              <Link
                to="/conversations"
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === "/conversations"
                    ? "bg-white text-blue-600 shadow"
                    : "hover:bg-blue-700 hover:text-white"
                }`}
              >
                Conversations
              </Link>
              <Link
                to="/profile"
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === "/profile"
                    ? "bg-white text-blue-600 shadow"
                    : "hover:bg-blue-700 hover:text-white"
                }`}
              >
                Profile
              </Link>
              <Link
                to="/chatbot"
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === "/chatbot"
                    ? "bg-white text-blue-600 shadow"
                    : "hover:bg-blue-700 hover:text-white"
                }`}
              >
                Chatbot
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white"
          >
            Logout
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex  bg-gray-50">
        <div className="w-full h-[calc(100vh-112px)] bg-white rounded-lg shadow-md  overflow-y-auto">
          {/* The height dynamically adjusts: Header = 64px, Footer = 48px */}
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 text-center py-4 text-sm">
        &copy; 2025 LangVoyage. All rights reserved.{" "}
        <Link to="/" className="text-blue-400 hover:underline">
          Home
        </Link>
      </footer>
    </div>
  );
};

export default Layout;
