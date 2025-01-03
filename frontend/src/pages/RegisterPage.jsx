import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Avatar from "@mui/material/Avatar";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("English");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      console.error("Passwords do not match");
      return;
    }
    try {
      const response = await fetch("http://localhost:8000/api/register/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, nativeLanguage }),
      });
      if (response.ok) {
        console.log("User registered successfully");
        navigate("/login"); // Redirect to login after successful registration
      } else {
        const errorData = await response.json();
        console.error("Error during registration:", errorData.error);
      }
    } catch (error) {
      console.error("Error during registration:", error.message);
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center bg-slate-500 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-2xl font-bold mb-4 text-center">Register</h2>
        <form onSubmit={handleRegister}>
          <TextField
            id="username"
            label="Username"
            fullWidth
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
            margin="normal"
          />
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
