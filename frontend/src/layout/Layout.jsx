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
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header/Menu */}
      <header className="sticky top-0 z-30 bg-gray-700 text-white px-3 py-3 shadow-md sm:px-4">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Clickable Logo on the top left */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
            <Link
              to="/profile"
              className="mr-2 truncate text-base font-bold tracking-wide sm:mr-4 sm:text-xl"
            >
              LangVoyage
            </Link>

            {/* Navigation Links */}
            <div className="flex flex-wrap gap-2">
              <Link
                to="/community"
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm ${
                  location.pathname === "/community"
                    ? "bg-white text-blue-600 shadow"
                    : "hover:bg-blue-700 hover:text-white"
                }`}
              >
                People
              </Link>
              <Link
                to="/conversations"
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm ${
                  location.pathname === "/conversations"
                    ? "bg-white text-blue-600 shadow"
                    : "hover:bg-blue-700 hover:text-white"
                }`}
              >
                Conversations
              </Link>
              <Link
                to="/profile"
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm ${
                  location.pathname === "/profile"
                    ? "bg-white text-blue-600 shadow"
                    : "hover:bg-blue-700 hover:text-white"
                }`}
              >
                Profile
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              title="Settings"
              aria-label="Settings"
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition sm:h-10 sm:w-10 sm:text-lg ${
                location.pathname === "/settings"
                  ? "bg-white text-blue-600 shadow"
                  : "hover:bg-blue-700 hover:text-white"
              }`}
            >
              ⚙
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600 sm:px-3 sm:py-2 sm:text-sm"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="min-h-0 flex-1">
        <div className="mx-auto h-full w-full max-w-7xl px-0 sm:px-2 md:px-4">
          <div className="h-full overflow-y-auto bg-white shadow-sm sm:rounded-lg sm:shadow-md">
          <Outlet />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="hidden bg-gray-800 py-3 text-center text-xs text-gray-400 sm:block sm:text-sm">
        © {new Date().getFullYear()} LangVoyage. All rights reserved.
      </footer>
    </div>
  );
};

export default Layout;
