// Layout.jsx
import React from "react";
import { Outlet } from "react-router-dom"; // Outlet is where page-specific content will render
import { Link } from "react-router-dom";

const Layout = () => {
  return (
    <>
      <div className="flex flex-col h-screen">
        {/* Header/Menu */}
        <header className="bg-blue-500 text-white p-4">
          <nav className="flex items-center gap-5">
            <h1 className="text-lg font-bold">LangVoyage</h1>
            <div className="flex space-x-4 ">
              <Link to="/" className="hover:underline">
                People
              </Link>
              <Link to="/community" className="hover:underline">
                Conversations
              </Link>
              <Link to="/profile" className="hover:underline">
                Profile
              </Link>
            </div>
          </nav>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet /> {/* This is where the specific page content renders */}
        </main>

        {/* Footer (optional) */}
      </div>
      <footer className="bg-gray-100 text-center py-2 text-sm">
        &copy; 2025 My App. All rights reserved.
      </footer>
    </>
  );
};

export default Layout;
