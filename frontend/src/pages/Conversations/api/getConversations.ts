import api from "../../../lib/api";
import { Conversation } from "../types";
import { ExtractFnReturnType, QueryConfig } from "../../../libs/react-query";
import { useQuery } from 'react-query';

export const getConversations = async (): Promise<Conversation[]> =>
  api.get<Conversation[]>("/api/conversations/");


type QueryFnType = typeof getConversations;

type UseGetConversationsData = {
  config?: QueryConfig<QueryFnType>;
}


export const useGetConversations = ({ config }: UseGetConversationsData = {}) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    queryKey: ["conversationsList"],
    initialData: [],
    // Treat initial empty data as stale so first mount still fetches from server.
    initialDataUpdatedAt: 0,
    queryFn: getConversations,
    staleTime: 15 * 1000,
    cacheTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    ...config,
    useErrorBoundary: false,

  });
};
