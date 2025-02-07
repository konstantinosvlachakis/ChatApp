export const storage = {
  setCSRFToken: (token) => localStorage.setItem("csrfToken", token),
  getCSRFToken: () => localStorage.getItem("csrfToken"),
  setToken: (token) => localStorage.setItem("authToken", token),
  getToken: () => localStorage.getItem("authToken"),
  clearToken: () => localStorage.removeItem("authToken"),
};
