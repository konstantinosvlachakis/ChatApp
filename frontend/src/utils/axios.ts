import axios from "axios";

const instance = axios.create({
  baseURL: process.env.REACT_APP_BASE_URL || "https://langvoyage-d3781c6fad54.herokuapp.com", // Replace with your backend's base URL
  withCredentials: true, // Ensures cookies are sent
});

export default instance;
