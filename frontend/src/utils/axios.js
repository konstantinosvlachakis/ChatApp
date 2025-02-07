import axios from "axios";

// Function to retrieve CSRF token from cookies
function getCSRFToken() {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="));
  return cookie ? cookie.split("=")[1] : null;
}

// Create Axios instance with proper configurations
const instance = axios.create({
  baseURL:
    process.env.REACT_APP_BASE_URL ||
    "https://langvoyage-d3781c6fad54.herokuapp.com",
  withCredentials: true, // Ensures cookies are sent
});

// Axios Request Interceptor to Attach CSRF Token
instance.interceptors.request.use(
  (config) => {
    const csrfToken = getCSRFToken();
    if (csrfToken) {
      config.headers["X-CSRFToken"] = csrfToken; // Attach CSRF token
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default instance;
