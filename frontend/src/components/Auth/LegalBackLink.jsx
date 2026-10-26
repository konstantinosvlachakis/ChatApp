import React from "react";
import { Link } from "react-router-dom";
import { useUser } from "../../context/UserContext";

// Wait for the session check so the first render matches the prerendered HTML.
const LegalBackLink = () => {
  const { user, loading } = useUser();
  const isSignedIn = !loading && Boolean(user);

  return (
    <Link
      to={isSignedIn ? "/profile" : "/login"}
      className="font-semibold text-cyan-700 hover:text-cyan-800"
    >
      {isSignedIn ? "Back to app" : "Back to login"}
    </Link>
  );
};

export default LegalBackLink;
