import { useMutation, useQueryClient } from '@tanstack/react-query';

// Define the structure of the user profile data
interface UserProfile {
  username?: string;
  nativeLanguage?: string;
  // Add other fields if needed
}

// Function to edit the user profile
async function editProfile(userData: UserProfile): Promise<UserProfile> {
  const token = localStorage.getItem('accessToken');
  console.log('Retrieved token:', token); // Log the retrieved token
  if (!token) {
    throw new Error('No token found in localStorage');
  }

  const response = await fetch('http://localhost:8000/api/profile/edit/', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`, 
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const errorResponse = await response.json();
    console.error('Error response:', errorResponse);
    throw new Error(`Error updating profile: ${errorResponse.detail}`);
  }

  const updatedProfile = await response.json();
  return updatedProfile;
}

