import axios from "axios";
import { Conversation } from "../types";
import { NavigateFunction } from "react-router-dom";

export const fetchConversations = async (
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  navigate: NavigateFunction
): Promise<void> => {
  const token = sessionStorage.getItem("accessToken");

  if (!token) {
    setError("Authentication token is missing. Please log in.");
    navigate("/login"); // Redirect to login if no token
    return;
  }

  try {
    const response = await axios.get<Conversation[]>(
      "http://localhost:8000/api/conversations/",
      {
        headers: {
          Authorization: `Bearer ${token}`, // Use Bearer for JWT tokens
        },
        withCredentials: true, // Include cookies if needed
      }
    );

    setConversations(response.data); // Update state with fetched data
    console.log("Conversations fetched successfully");
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // Handle unauthorized access
        sessionStorage.removeItem("accessToken");
        navigate("/login");
      } else {
        setError(error.response?.data?.detail || "Failed to fetch conversations");
      }
    } else {
      setError("An unexpected error occurred.");
    }
    console.error("Error fetching conversations:", error);
  }
};
