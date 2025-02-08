import { BASE_URL_IMG } from "../../constants/constants";
import { cn } from "../../libs/utils";
import { Card } from "@mui/material";

interface ProfileCardDTO {
  content: string;
  nativeLanguage?: string;
  profileImage?: string;
  index?: number;
  isDragging?: boolean;
}

export function ProfileCard({
  index: key,
  content,
  nativeLanguage,
  profileImage,
}: ProfileCardDTO) {
  const defaultImage = `${BASE_URL_IMG}profile_images/MainAfter.jpg`;
  profileImage = BASE_URL_IMG + profileImage;

  return (
    <Card
      key={key}
      className={cn(
        "space-y-6 max-w-[350px] h-full p-4 border border-gray-200 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-200 transform hover:scale-105"
      )}
    >
      <div className="p-2 space-y-5 h-full">
        <div className="flex items-center space-x-4">
          {/* Profile Image */}
          <img
            src={profileImage ? profileImage : defaultImage}
            alt="Profile"
            onError={(e) => {
              e.currentTarget.src = defaultImage;
            }}
            className="w-20 h-20 rounded-full border-2 border-gray-300 object-cover"
          />
          {/* Profile Content */}
          <div>
            <p className="font-semibold text-lg text-gray-800">{content}</p>
            <p className="italic text-gray-500">
              {nativeLanguage || "Unknown"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
