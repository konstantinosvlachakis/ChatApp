import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";

const Layout = () => {
  const location = useLocation(); // To identify the active page

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header/Menu */}
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <nav className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Clickable Logo on the top left */}
          <Link
            to="/profile"
            className="text-xl font-bold tracking-wide  cursor-pointer"
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
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex justify-center items-center bg-gray-50">
        <div className="w-3/4 h-[calc(100vh-112px)] bg-white rounded-lg shadow-md p-6 overflow-y-auto">
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
