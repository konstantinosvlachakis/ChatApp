import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import axios from "axios";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post("http://localhost:8000/api/token/", {
        username,
        password,
      });

      const { access, refresh } = response.data;

      // Store tokens in sessionStorage to maintain separate sessions per tab
      sessionStorage.setItem("accessToken", access);
      sessionStorage.setItem("refreshToken", refresh);

      console.log("Login successful. Access token:", access);
      navigate("/profile");
    } catch (error) {
      setError(error.response?.data?.detail || "Login failed.");
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpClick = () => {
    navigate("/register");
  };

  return (
    <div className="min-h-screen bg-cover bg-center bg-slate-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-2xl font-bold mb-4 text-center">Sign in</h2>
        <form onSubmit={handleLogin}>
          <TextField
            id="username"
            label="Username"
            fullWidth
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
            margin="normal"
            required // Ensures the field is required
          />
          <TextField
            id="password"
            label="Password"
            fullWidth
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            variant="outlined"
            margin="normal"
            required // Ensures the field is required
          />
          {error && (
            <div className="text-red-500 text-center mt-2">{error}</div>
          )}{" "}
          {/* Display error message */}
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            style={{ marginTop: "1rem" }}
            disabled={loading} // Disable button when loading
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : "Login"}{" "}
            {/* Loading indicator */}
          </Button>
        </form>

        <p className="text-center mt-4">
          Don't have an account?{" "}
          <span
            className="text-blue-500 cursor-pointer hover:underline"
            onClick={handleSignUpClick}
          >
            Sign Up
          </span>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
