import { useEffect, useState } from "react";
import { ProfileCard } from "../../components/Cards/Card";
import { getProfileData } from "./api/getProfileData";
import { ProfileData } from "./types";
import { useNavigate } from "react-router-dom";
import { createOrGetConversation } from "./api/conversation";
const CommunityPage = () => {
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getProfileData(navigate);
        if (response?.profiles) {
          const transformedData: ProfileData[] = response.profiles.map(
            (profile: any) => ({
              username: profile.username,
              imageURL:
                profile.profile_image_url ||
                "/media/profile_images/MainAfter.jpg",
              nativeLanguage: profile.native_language,
            })
          );
          setProfiles(transformedData);
        } else {
          console.error("Unexpected response structure:", response);
        }
      } catch (error) {
        console.error("Error fetching profile data:", error);
      }
    };
    fetchData();
  }, []);

  // Function to handle clicking on a profile
  const handleProfileClick = async (username: string) => {
    try {
      const conversation = await createOrGetConversation(username);
      if (conversation?.id) {
        navigate(`/chat/${conversation.id}`); // Redirect to chat page
      }
    } catch (error) {
      console.error("Error starting conversation:", error);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      {profiles.map((profile, index) => (
        <ProfileCard
          key={index}
          content={profile.username}
          nativeLanguage={profile.nativeLanguage}
          profileImage={profile.imageURL}
          onClick={() => handleProfileClick(profile.username)} // Pass click handler
        />
      ))}
    </div>
  );
};

export default CommunityPage;
