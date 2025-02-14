import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from "react";
import { fetchUserProfile } from "../pages/Conversations/api/fetchUserProfile";
import { User } from "../pages/Profile/types";

interface UserContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  refreshUserProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider = ({ children }: UserProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshUserProfile = async () => {
    try {
      const token = sessionStorage.getItem("accessToken");
      if (!token) return;
      await fetchUserProfile(
        setUser,
        () => {},
        setError,
        () => {}
      );
    } catch (err) {
      setError((err as Error).message);
      console.error("Error refreshing user profile:", err);
    }
  };

  // Automatically fetch user profile when the provider is mounted
  useEffect(() => {
    refreshUserProfile();
  }, []);

  return (
    <UserContext.Provider
      value={{ user, setUser, error, setError, refreshUserProfile }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
