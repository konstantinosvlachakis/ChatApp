import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";
import { fetchUserProfile } from "../pages/Profile/api/fetchUserProfile";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

  const refreshUserProfile = async () => {
    await fetchUserProfile(setUser, () => {}, setError, navigate);
  };

  useEffect(() => {
    refreshUserProfile();
  }, [navigate]);

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
