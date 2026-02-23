import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BASE_URL } from "../../constants/constants";
import { BASE_URL_IMG } from "../../constants/constants";
import { createOrGetConversation } from "../Community/api/conversation";

const PublicProfilePage = () => {
  const { username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stateProfile = location.state?.profile;

  const [profile, setProfile] = useState(stateProfile || null);
  const [loading, setLoading] = useState(!stateProfile);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadPublicProfile = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem("accessToken");
        const response = await fetch(`${BASE_URL}/api/profile/public/${username}/`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Could not load this profile.");
        }

        const data = await response.json();
        if (isMounted) {
          setProfile((prev) => ({ ...prev, ...data }));
          setError("");
        }
      } catch (err) {
        if (isMounted && !stateProfile) {
          setError(err.message || "Could not load this profile.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPublicProfile();
    return () => {
      isMounted = false;
    };
  }, [stateProfile, username]);

  const resolveMediaUrl = (path) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    if (path.startsWith("/media/")) return `${BASE_URL_IMG}${path}`;
    return `${BASE_URL_IMG}/media/${path}`;
  };

  const imageUrl = useMemo(
    () =>
      resolveMediaUrl(profile?.profile_image_url) ||
      `${BASE_URL_IMG}/media/profile_images/MainAfter.jpg`,
    [profile]
  );

  const photoCards = [
    {
      key: "profile",
      label: "Profile Picture",
      image: resolveMediaUrl(profile?.profile_image_url),
    },
    {
      key: "complementary_1",
      label: "Complementary 1",
      image: resolveMediaUrl(profile?.complementary_image_1_url),
    },
    {
      key: "complementary_2",
      label: "Complementary 2",
      image: resolveMediaUrl(profile?.complementary_image_2_url),
    },
  ];

  const reviews = profile?.reviews || [];

  const handleStartConversation = async () => {
    if (!profile?.username) return;
    try {
      const conv = await createOrGetConversation(profile.username);
      if (conv?.id) navigate(`/conversations/${conv.id}`);
    } catch (err) {
      setError("Could not start conversation.");
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading profile...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!profile) return <div className="p-8 text-gray-500">Profile not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-5 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl shadow p-5 sm:p-6 md:p-8 flex flex-col items-center gap-4">
          <img
            src={imageUrl}
            alt="Profile"
            className="h-24 w-24 rounded-full object-cover border-4 border-blue-300 sm:h-28 sm:w-28 md:h-32 md:w-32"
          />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 text-center">
            {profile.username}, {profile.age || "—"}
          </h1>
          <button
            type="button"
            onClick={handleStartConversation}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full transition"
          >
            Start Conversation
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mt-4 sm:mt-6 md:mt-8">
          <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
              <span role="img" aria-label="user">
                👤
              </span>
              Personal Information
            </h2>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>Name:</strong> {profile.username || "N/A"}
              </p>
              <p>
                <strong>Age:</strong> {profile.age || "Not provided"}
              </p>
              <p>
                <strong>Bio:</strong>{" "}
                {profile.bio ||
                  "Passionate about learning new languages and connecting with people from different cultures."}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
              <span role="img" aria-label="globe">
                🌐
              </span>
              Languages
            </h2>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>Native Language:</strong>{" "}
                <span className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                  {profile.native_language || profile.nativeLanguage || "N/A"}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6 mt-4 sm:mt-6 md:mt-8">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            <span role="img" aria-label="target">
              🎯
            </span>
            Learning Goals
          </h2>
          <p className="text-gray-700">
            {profile.learning_goal ||
              "I want to improve fluency and become more confident in real conversations."}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6 mt-4 sm:mt-6 md:mt-8">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            <span role="img" aria-label="camera">
              📸
            </span>
            Photos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {photoCards.map((card) => (
              <div
                key={card.key}
                className="rounded-2xl border border-gray-200 p-2 bg-white"
              >
                <div className="w-full aspect-square rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
                  {card.image ? (
                    <img
                      src={card.image}
                      alt={card.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm text-gray-400">No photo</span>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-gray-700 text-center">
                  {card.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 sm:p-5 md:p-6 mt-4 sm:mt-6 md:mt-8 mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            <span role="img" aria-label="reviews">
              ⭐
            </span>
            Reviews
          </h2>
          {reviews.length === 0 ? (
            <p className="text-gray-500">No reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review, index) => (
                <div key={`${review.author || "review"}-${index}`} className="border rounded-lg p-3">
                  <p className="text-sm text-gray-800 font-medium">
                    {review.author || "Anonymous"} • {review.rating || 5}/5
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{review.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicProfilePage;
