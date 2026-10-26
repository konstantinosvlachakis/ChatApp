import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

// Client-side guard only; the API must still enforce authentication on every endpoint.
const Protected = ({ children }) => {
  const { user, loading } = useUser();

  if (loading && !user) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default Protected;
