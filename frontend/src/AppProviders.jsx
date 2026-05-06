import React, { useState } from "react";
import { QueryClientProvider } from "react-query";
import { UserProvider } from "./context/UserContext";
import { createQueryClient } from "./libs/react-query";

const AppProviders = ({ children }) => {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>{children}</UserProvider>
    </QueryClientProvider>
  );
};

export default AppProviders;
