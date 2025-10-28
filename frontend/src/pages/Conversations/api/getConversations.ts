import axios from "axios";
import { Conversation } from "../types";
import { BASE_URL } from "../../../constants/constants";
import { ExtractFnReturnType, QueryConfig } from "../../../libs/react-query";
import { useQuery } from 'react-query';

export const getConversations = async (): Promise<Conversation[]> => {
  const token = sessionStorage.getItem("accessToken");

  if (!token) {
    throw new Error("Authentication token is missing. Please log in.");
  }

  const response = await axios.get(BASE_URL + "/api/conversations/", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    withCredentials: true,
  });

  return response.data;
};


type QueryFnType = typeof getConversations;

type UseGetConversationsData = {
  config?: QueryConfig<QueryFnType>;
}


export const useGetConversations = ({ config }: UseGetConversationsData = {}) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    queryKey: ["conversationsList"],
    initialData: [],
    queryFn: getConversations,
    ...config,
    useErrorBoundary: false,

  });
};
