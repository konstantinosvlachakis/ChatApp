// api/userApi.ts
import { User } from "../../Profile/types";
import api, { ApiError, isApiError } from "../../../lib/api";
import { clearLegacyTokens } from "../../../utils/auth";

export const fetchUserProfile = async (): Promise<User> => {
  // A 401 is refreshed and retried once by the axios instance (utils/csrf.ts).
  try {
    return await api.get<User>("/api/profile/");
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      clearLegacyTokens();
      // UserContext keys its "logged out" handling on this message.
      throw new ApiError({
        status: 401,
        code: error.code,
        message: "Unauthorized",
        requestId: error.requestId,
        data: error.data,
      });
    }
    throw error;
  }
};
