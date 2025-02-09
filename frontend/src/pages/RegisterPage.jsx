import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Avatar from "@mui/material/Avatar";
import { BASE_URL } from "../constants/constants";
import { storage } from "../utils/storage";

const languageOptions = [
  {
    value: "English",
    label: "English",
    flag: "https://flagcdn.com/w320/us.png",
  },
  {
    value: "Greek",
    label: "Greek",
    flag: "https://flagcdn.com/w320/gr.png",
  },
  {
    value: "French",
    label: "French",
    flag: "https://flagcdn.com/w320/fr.png",
  },
  {
    value: "German",
    label: "German",
    flag: "https://flagcdn.com/w320/de.png",
  },
  {
    value: "Portuguese",
    label: "Portuguese",
    flag: "https://flagcdn.com/w320/pt.png",
  },
  {
    value: "Russian",
    label: "Russian",
    flag: "https://flagcdn.com/w320/ru.png",
  },
];

const RegisterPage = () => {
  // State variables
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("English");

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();

    // Password confirmation check
    if (password !== confirmPassword) {
      console.error("Passwords do not match");
      return;
    }

    const csrfToken = storage.getCSRFToken();

    try {
      const response = await fetch(BASE_URL + "/api/register/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken, // Include CSRF token in headers
        },
        body: JSON.stringify({
          username,
          email,
          dateOfBirth,
          password,
          nativeLanguage,
        }),
      });

      if (response.ok) {
        console.log("User registered successfully");
        navigate("/login");
      } else {
        const errorData = await response.json();
        console.error("Error during registration:", errorData.error);
      }
    } catch (error) {
      console.error("Error during registration:", error.message);
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center bg-slate-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-2xl font-bold mb-4 text-center">Register</h2>
        <form onSubmit={handleRegister}>
          {/* Username Field */}
          <TextField
            id="username"
            label="Username"
            fullWidth
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
            margin="normal"
          />

          {/* Email Field */}
          <TextField
            id="email"
            label="Email"
            type="email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            variant="outlined"
            margin="normal"
          />

          {/* Date of Birth Field */}
          <TextField
            id="date-of-birth"
            label="Date of Birth"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            variant="outlined"
            margin="normal"
          />

          {/* Native Language Selector */}
          <FormControl fullWidth variant="outlined" margin="normal">
            <InputLabel id="native-language-label">Native Language</InputLabel>
            <Select
              labelId="native-language-label"
              id="native-language"
              value={nativeLanguage}
              onChange={(e) => setNativeLanguage(e.target.value)}
              label="Native Language"
              renderValue={(selected) => {
                const selectedOption = languageOptions.find(
                  (option) => option.value === selected
                );
                return (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <Avatar
                      alt={selectedOption.label}
                      src={selectedOption.flag}
                      style={{ width: 24, height: 24, marginRight: 8 }}
                    />
                    {selectedOption.label}
                  </div>
                );
              }}
            >
              {languageOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  value={option.value}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <Avatar
                    alt={option.label}
                    src={option.flag}
                    style={{ width: 24, height: 24, marginRight: 8 }}
                  />
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Password Field */}
          <TextField
            id="password"
            label="Password"
            fullWidth
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            variant="outlined"
            margin="normal"
          />

          {/* Confirm Password Field */}
          <TextField
            id="confirm-password"
            label="Confirm Password"
            fullWidth
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            variant="outlined"
            margin="normal"
          />

          {/* Register Button */}
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            style={{ marginTop: "1rem" }}
          >
            Register
          </Button>
        </form>

        {/* Redirect to Login */}
        <p className="text-center mt-4">
          Already have an account?{" "}
          <span
            className="text-blue-500 cursor-pointer hover:underline"
            onClick={() => navigate("/login")}
          >
            Login
          </span>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
