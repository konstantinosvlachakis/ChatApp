import { createContext, useContext } from "react";

const PresenceContext = createContext({
  onlineUserIds: new Set(),
  subscribeToPresenceEvents: () => () => {},
});

export const PresenceProvider = PresenceContext.Provider;

export const usePresence = () => useContext(PresenceContext);
