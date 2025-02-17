import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';
import { queryClient } from '../../../libs/react-query';
import { BASE_URL } from '../../../constants/constants';

type UserProfileDTO = {
  username?: string;
  nativeLanguage?: string;
  profileImage?: string;
  // Add other fields if needed
};

// Function to update the user's native language
const editProfile = async (userData: UserProfileDTO): Promise<UserProfileDTO> => {
  const token = sessionStorage.getItem("accessToken"); // Retrieve the token from local storage
  const response = await axios.patch(
    BASE_URL + "/api/profile/edit/",
    userData,
    {
      headers: {
        Authorization: `Bearer ${token}`,  // Include the token in the header
      },
    }
  );  
  console.log(response.data)
  return response.data;
};

type UseEditProfileOptions = {
  config?: UseMutationOptions<
    UserProfileDTO,
    AxiosError<unknown, any>,
    UserProfileDTO,
    { previousUserProfile?: UserProfileDTO }
  >;
};

export const useEditProfile = ({ config }: UseEditProfileOptions) => {
  return useMutation({
    mutationKey: ['editProfile'], // Explicitly setting mutationKey
    mutationFn: editProfile,
    onMutate: async (newData: UserProfileDTO) => {
      // Snapshot the previous user data
      const previousUserProfile = queryClient.getQueryData<UserProfileDTO>(['userProfile']);

      // Optimistically update the user profile in the cache
      queryClient.setQueryData<UserProfileDTO>(['userProfile'], (oldData) => ({
        ...oldData,
        ...newData,
      }));

      return { previousUserProfile };
    },
    onError: (error, newData, context) => {
      // Rollback to the previous user profile data if mutation fails
      if (context?.previousUserProfile) {
        queryClient.setQueryData<UserProfileDTO>(['userProfile'], context.previousUserProfile);
      }
    },
    onSuccess: () => {
      // Invalidate the user profile query to refetch updated data
      queryClient.invalidateQueries(['userProfile']);
    },
    ...config,
  });
};
