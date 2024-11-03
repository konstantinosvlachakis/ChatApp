// src/api.js

type editProfileDTO = {
    name: string;
}

export async function editProfile({name}: editProfileDTO) {
    try {
        const response = await fetch("http://localhost:8000/api/profile/edit/", {  // Add trailing slash here
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // To include cookies, if required by your API
        body: JSON.stringify({ name }), // Payload with the new name
      });
      console.log(response.json())
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update profile");
      }
  
      const data = await response.json();
      return data; // Return the updated profile data
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error; // Re-throw to handle it in the calling component
    }
  }
  