import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import Button from "../components/Buttons/Button";
import CircularProgress from "@mui/material/CircularProgress";
import axios from "axios";
import { BASE_URL } from "../constants/constants";
import "../index.css";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(BASE_URL + "/api/token/", {
        email,
        password,
      });

      const { access, refresh } = response.data;
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
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
        <div className="flex flex-col items-center mb-6">
          <img
            src="http://127.0.0.1:8000/media/logo.png"
            alt="Chat Icon"
            className="w-16 h-16 mb-2 transition-transform duration-300 hover:rotate-12"
          />
          <h2 className="text-3xl font-bold font-poppins text-primary mb-2 text-center">
            Welcome Back!
          </h2>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <TextField
            id="email"
            label="Email Address"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            variant="outlined"
            margin="normal"
            required
            InputProps={{
              classes: { root: "focus:ring-2 focus:ring-blue-300" },
            }}
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            variant="outlined"
            margin="normal"
            required
            InputProps={{
              classes: { root: "focus:ring-2 focus:ring-blue-300" },
            }}
          />

          {error && (
            <div className="text-red-500 text-center text-sm">{error}</div>
          )}

          <Button
            type="submit"
            variant="contained"
            colorVariant="richTurquoise"
            fullWidth
            className="py-2 rounded-lg hover:scale-105 hover:shadow-lg transition-transform duration-300"
            disabled={loading}
          >
            {loading ? (
              <CircularProgress size={24} color="secondary" />
            ) : (
              "Login"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Don't have an account?{" "}
          <span
            className="text-blue-500 cursor-pointer hover:underline font-medium"
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
