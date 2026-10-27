import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { createOrGetConversation } from "../Community/api/conversation";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import api, { getErrorMessage, isAbortError } from "../../lib/api";
import { toastApiError } from "../../components/Toast";
import PhotoViewer, { buildPhotoGallery, usePhotoViewer } from "../../components/PhotoViewer";
import { useUser } from "../../context/UserContext";
import { usePresence } from "../../context/PresenceContext";
import { AboutCard, LanguagesCard, PhotosCard, ProfileHero } from "../Profile/features/ProfileParts";
import { describeLanguage, exchangeMatch, resolveMediaUrl, validRingColor } from "../Profile/features/profileUtils";
import { shareProfileLink } from "../Profile/features/shareProfile";

const ExchangeStrip = ({ me, profile, match }) => {
  if (!match.teachesMe && !match.learnsMine) return null;
  const theirNative = describeLanguage(profile.native_language).name;
  const myNative = describeLanguage(me.native_language).name;
  return (
    <div className="pf-exchange">
      <span className="pf-eyebrow">Your exchange</span>
      <span>
        {match.teachesMe && (
          <>
            You learn <strong>{theirNative}</strong>
          </>
        )}
        {match.reciprocal && " · "}
        {match.learnsMine && (
          <>
            {profile.username} learns <strong>{myNative}</strong>
          </>
        )}
      </span>
    </div>
  );
};

const sameUsername = (left, right) =>
  String(left || "").toLowerCase() === String(right || "").toLowerCase();

const PublicProfileView = ({ username }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: me } = useUser();
  const { onlineUserIds } = usePresence();
  // Navigation state (e.g. a People card) is only a placeholder for the same person.
  const stateProfile = sameUsername(location.state?.profile?.username, username)
    ? location.state.profile
    : undefined;

  const [profile, setProfile] = useState(stateProfile || null);
  const [loading, setLoading] = useState(!stateProfile);
  const [error, setError] = useState("");
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const isStartingConversationRef = useRef(false);
  const viewer = usePhotoViewer();

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const loadPublicProfile = async () => {
      try {
        setLoading(true);
        const data = await api.get(`/api/profile/public/${encodeURIComponent(username || "")}/`, {
          signal: controller.signal,
        });
        if (isMounted) {
          // Merge only over a placeholder for this same person, never over someone else.
          setProfile((prev) =>
            prev && sameUsername(prev.username, data?.username) ? { ...prev, ...data } : data
          );
          setError("");
        }
      } catch (err) {
        if (isMounted && !stateProfile && !isAbortError(err)) {
          setError(getErrorMessage(err, "Could not load this profile."));
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
      controller.abort();
    };
  }, [stateProfile, username]);

  const handleStartConversation = async () => {
    if (!profile?.username || isStartingConversationRef.current) return;
    isStartingConversationRef.current = true;
    setIsStartingConversation(true);
    try {
      const conv = await createOrGetConversation(profile.username);
      if (conv?.id) navigate(`/conversations/${conv.id}`);
    } catch (err) {
      // A toast keeps the profile on screen (the page-level error would replace it).
      toastApiError(err, "Couldn't start the conversation");
    } finally {
      isStartingConversationRef.current = false;
      setIsStartingConversation(false);
    }
  };

  if (loading && !profile) return <div className="pf-state">Loading profile…</div>;
  if (error) return <div className="pf-state" role="alert">{error}</div>;
  if (!profile) return <div className="pf-state">Profile not found.</div>;

  const ownerName = profile.username || "this person";
  const isOwnProfile =
    Boolean(me?.username) && me.username.toLowerCase() === String(profile.username || "").toLowerCase();
  const isOnline = !isOwnProfile && profile.user_id != null && onlineUserIds?.has?.(profile.user_id);
  const match = isOwnProfile ? { teachesMe: false, learnsMine: false, reciprocal: false } : exchangeMatch(me, profile);

  const photoSlots = [
    { key: "profile", label: "Profile photo", image: resolveMediaUrl(profile.profile_image_url) },
    { key: "complementary_1", label: "Photo 2", image: resolveMediaUrl(profile.complementary_image_1_url) },
    { key: "complementary_2", label: "Photo 3", image: resolveMediaUrl(profile.complementary_image_2_url) },
  ];
  // Only real photos are viewable (no chameleon default / empty slots).
  const gallery = buildPhotoGallery(
    photoSlots.map((slot) => ({ key: slot.key, src: slot.image, alt: `${slot.label} of ${ownerName}` }))
  );
  const galleryIndex = (key) => gallery.findIndex((photo) => photo.key === key);
  const viewLabel = (key) => `View photo ${galleryIndex(key) + 1} of ${gallery.length}`;
  const mainPhotoIndex = galleryIndex("profile");

  return (
    <div className="pf-page">
      {isOwnProfile && (
        <p className="pf-self-note">
          This is how other people see your profile.
          <Link to="/profile" className="pf-link">
            Back to your profile
          </Link>
        </p>
      )}

      <ProfileHero
        profile={profile}
        avatarUrl={resolveMediaUrl(profile.profile_image_url)}
        ringColor={validRingColor(profile.avatar_ring_color)}
        isOnline={isOnline}
        statusItems={isOnline ? [{ key: "online", dot: true, text: "Active now" }] : []}
        badge={
          match.reciprocal ? (
            <span className="pf-match-badge">
              <CheckRoundedIcon aria-hidden="true" />
              Perfect match
            </span>
          ) : null
        }
        onOpenAvatar={mainPhotoIndex >= 0 ? (event) => viewer.open(mainPhotoIndex, event) : undefined}
        avatarLabel={viewLabel("profile")}
      >
        {isOwnProfile ? (
          <Link to="/profile/edit" className="pf-btn is-primary">
            <EditOutlinedIcon aria-hidden="true" />
            Edit profile
          </Link>
        ) : (
          <button
            type="button"
            className="pf-btn is-primary"
            onClick={handleStartConversation}
            disabled={isStartingConversation}
            aria-busy={isStartingConversation || undefined}
          >
            <ChatBubbleOutlineRoundedIcon aria-hidden="true" />
            Message
          </button>
        )}
        <button type="button" className="pf-btn" onClick={() => shareProfileLink(profile.username)}>
          <IosShareRoundedIcon aria-hidden="true" />
          Share
        </button>
      </ProfileHero>

      <div className="pf-grid">
        <div className="pf-col">
          {me && !isOwnProfile && <ExchangeStrip me={me} profile={profile} match={match} />}
          <LanguagesCard profile={profile} emptyText="Not added yet." />
        </div>
        <div className="pf-col">
          <AboutCard
            profile={profile}
            emptyBio={`${ownerName} hasn't written a bio yet.`}
            emptyGoal="No learning goal shared yet."
          />
        </div>
        <div className="pf-col">
          <PhotosCard
            slots={photoSlots}
            galleryIndex={galleryIndex}
            onOpen={viewer.open}
            viewLabel={viewLabel}
          />
        </div>
      </div>

      <PhotoViewer
        photos={gallery}
        index={viewer.index}
        onClose={viewer.close}
        returnFocusRef={viewer.triggerRef}
        label={`Photos of ${ownerName}`}
      />
    </div>
  );
};

// Keyed by username so /people/a → /people/b starts from a clean state (no A while B loads).
const PublicProfilePage = () => {
  const { username } = useParams();
  return <PublicProfileView key={username} username={username} />;
};

export default PublicProfilePage;
