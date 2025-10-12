import { createContext, useContext, useEffect, useState } from "react";
import { fetchUserProfile } from "../pages/Conversations/api/fetchUserProfile";
import { User } from "../pages/Profile/types";

interface UserContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  loading: boolean;
  error: string | null;
  refreshUserProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUserProfile = async () => {
    setLoading(true);
    try {
      const userData = await fetchUserProfile();
      setUser(userData);
      setError(null);
    } catch (err) {
      setUser(null);
      setError((err as Error).message);
      if ((err as Error).message === "Unauthorized") {
        window.location.href = "/login";
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUserProfile();
  }, []);

  return (
    <UserContext.Provider
      value={{ user, setUser, loading, error, refreshUserProfile }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
