import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import axios from "axios";
import { BASE_URL } from "../constants/constants";
import { motion } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { FaGithub, FaApple } from "react-icons/fa";
import { useUser } from "../context/UserContext";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { refreshUserProfile } = useUser();

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

      await refreshUserProfile();

      navigate("/profile");
    } catch (error) {
      setError(error.response?.data?.detail || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpClick = () => {
    navigate("/register");
  };

  const handleSocialLogin = (provider) => {
    console.log(`Logging in with ${provider}`);
    // TODO: Integrate OAuth redirect logic here.
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md mx-4"
      >
        <div className="flex flex-col items-center mb-6">
          <motion.img
            src="http://127.0.0.1:8000/media/logo.png"
            alt="LangVoyage Logo"
            className="w-16 h-16 mb-2"
            initial={{ rotate: 0 }}
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, repeatDelay: 6, duration: 2 }}
          />
          <h2 className="text-3xl font-bold text-blue-600 mb-1 text-center">
            Welcome Back <span role="img" aria-label="wave">👋</span>
          </h2>
          <p className="text-gray-500 text-sm text-center">
            Sign in to continue your language journey
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <TextField
            label="Email Address"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            variant="outlined"
            margin="normal"
            required
            autoFocus
          />
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            variant="outlined"
            margin="normal"
            required
            InputProps={{
              endAdornment: (
                <span
                  onClick={() => setShowPassword(!showPassword)}
                  className="cursor-pointer text-gray-500 text-sm"
                >
                  {showPassword ? "🙈" : "👁️"}
                </span>
              ),
            }}
          />

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-500 text-center text-sm"
            >
              {error}
            </motion.div>
          )}

          <div className="flex items-center justify-between text-sm text-gray-600 mt-1">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-blue-500" /> Remember me
            </label>
            <span className="text-blue-500 hover:underline cursor-pointer">
              Forgot password?
            </span>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition font-medium mt-3 shadow-sm"
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : "Login"}
          </motion.button>
        </form>

        <div className="mt-6">
          <div className="flex items-center justify-center mb-4">
            <span className="text-gray-400 text-sm">or continue with</span>
          </div>

          <div className="flex flex-col gap-2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              className="w-full flex items-center justify-center gap-3 py-2 rounded-lg border hover:bg-gray-50 transition"
              onClick={() => handleSocialLogin("google")}
            >
              <FcGoogle size={20} />
              Continue with Google
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              className="w-full flex items-center justify-center gap-3 py-2 rounded-lg border bg-gray-900 text-white hover:bg-gray-800 transition"
              onClick={() => handleSocialLogin("github")}
            >
              <FaGithub size={18} />
              Continue with GitHub
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              className="w-full flex items-center justify-center gap-3 py-2 rounded-lg border bg-black text-white hover:bg-gray-800 transition"
              onClick={() => handleSocialLogin("apple")}
            >
              <FaApple size={18} />
              Continue with Apple
            </motion.button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          Don’t have an account?{" "}
          <span
            className="text-blue-500 cursor-pointer hover:underline font-medium"
            onClick={handleSignUpClick}
          >
            Sign Up
          </span>
        </p>
      </motion.div>

      <footer className="mt-6 text-gray-400 text-xs">
        © {new Date().getFullYear()} LangVoyage. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginPage;
