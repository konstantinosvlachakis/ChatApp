import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_AVATAR_URL, handleAvatarError } from "../../constants/avatar";
import { getUserLocation } from "./utils/getUserLocation";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import api, { getErrorMessage, isAbortError, isApiError } from "../../lib/api";
import { logger } from "../../lib/logger";
import { toast, toastApiError } from "../../components/Toast";
import PhotoViewer, { buildPhotoGallery, usePhotoViewer } from "../../components/PhotoViewer";
import { AboutCard, LanguagesCard, PhotosCard, ProfileCard, ProfileHero } from "./features/ProfileParts";
import {
  describeLanguage,
  formatViewedAt,
  learningLanguages,
  normalizeLanguage,
  profileStrength,
  resolveMediaUrl,
  validRingColor,
} from "./features/profileUtils";
import { shareProfileLink } from "./features/shareProfile";

const VISITORS_PREVIEW = 3;

const PracticeCard = ({ practice }) => {
  if (!practice?.stats) return null;
  const { level = 1, xp = 0, accuracy = 0, correct_answers: correct = 0 } = practice.stats;
  const levelStart = (level - 1) * 100;
  const progress = Math.min(100, Math.max(0, xp - levelStart));
  const language = practice.language ? describeLanguage(practice.language).name : "";
  return (
    <ProfileCard icon={BoltRoundedIcon} title="Practice progress">
      <div className="pf-progress">
        <div className="pf-level">
          <small>LEVEL</small>
          <strong>{level}</strong>
        </div>
        <div className="pf-progress-bar">
          <div>
            <span>{xp} XP</span>
            <span>
              {100 - progress} to level {level + 1}
            </span>
          </div>
          <div
            className="pf-meter"
            role="progressbar"
            aria-label={`Progress to level ${level + 1}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <dl className="pf-stats">
        <div>
          <dt>Accuracy</dt>
          <dd>{Math.round(accuracy)}%</dd>
        </div>
        <div>
          <dt>Correct</dt>
          <dd>{correct}</dd>
        </div>
        {practice.current_rank ? (
          <div>
            <dt>{language ? `${language} rank` : "Rank"}</dt>
            <dd>#{practice.current_rank}</dd>
          </div>
        ) : null}
      </dl>
      <Link to="/practice" className="pf-link">
        Keep practising →
      </Link>
    </ProfileCard>
  );
};

const VisitorsCard = ({ user }) => {
  const [showAll, setShowAll] = useState(false);
  const visitors = user.recent_profile_viewers || [];
  if (!visitors.length) return null;
  const learning = learningLanguages(user);
  const shown = showAll ? visitors : visitors.slice(0, VISITORS_PREVIEW);
  return (
    <ProfileCard icon={VisibilityOutlinedIcon} title="Recently viewed you">
      <ul className="pf-people">
        {shown.map((visitor) => {
          const native = visitor.native_language ? describeLanguage(visitor.native_language).name : "";
          const teachesMe = learning.includes(normalizeLanguage(visitor.native_language));
          const when = formatViewedAt(visitor.viewed_at);
          return (
            <li key={visitor.user_id || visitor.username}>
              <Link to={`/people/${encodeURIComponent(visitor.username)}`} className="pf-person">
                <img
                  src={resolveMediaUrl(visitor.profile_image_url) || DEFAULT_AVATAR_URL}
                  alt=""
                  loading="lazy"
                  onError={handleAvatarError}
                />
                <span>
                  <strong>{visitor.username}</strong>
                  <small>{[native && `Speaks ${native}`, when].filter(Boolean).join(" · ")}</small>
                </span>
                {teachesMe && <span className="pf-match-badge" style={{ marginLeft: "auto" }}>Can teach you</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      {visitors.length > VISITORS_PREVIEW && (
        <button type="button" className="pf-link" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `See all ${visitors.length} visitors →`}
        </button>
      )}
    </ProfileCard>
  );
};

const StrengthCard = ({ user, onStep }) => {
  const { percent, todo } = profileStrength(user);
  if (!todo.length) return null;
  return (
    <ProfileCard className="pf-strength">
      <h2 className="pf-card-title">
        Profile strength <strong>{percent}%</strong>
      </h2>
      <div
        className="pf-meter"
        role="progressbar"
        aria-label="Profile strength"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p>Complete profiles get more replies from partners. Quick wins left:</p>
      <ul className="pf-strength-steps">
        {todo.slice(0, 3).map((step) => (
          <li key={step.key}>
            <button type="button" className="pf-strength-step" onClick={() => onStep(step.key)}>
              <AddRoundedIcon aria-hidden="true" />
              {step.label}
            </button>
          </li>
        ))}
      </ul>
    </ProfileCard>
  );
};

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [practice, setPractice] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState("");
  const navigate = useNavigate();
  const isDetectingLocationRef = useRef(false);
  const photosRef = useRef(null);
  const viewer = usePhotoViewer();
  // Photos whose thumbnail failed to load aren't offered in the viewer.
  const [failedPhotoKeys, setFailedPhotoKeys] = useState(() => new Set());
  const markPhotoFailed = (key) =>
    setFailedPhotoKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  // ---- Fetch User ----
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await api.get("/api/profile/");
        setUser(data);
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          navigate("/login");
          return;
        }
        logger.warn("Failed to load profile:", err);
        setError(getErrorMessage(err, "Failed to load profile."));
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  // ---- Practice stats (optional card; the profile renders without them) ----
  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/api/practice/state/", { signal: controller.signal })
      .then(setPractice)
      .catch((err) => {
        if (!isAbortError(err)) logger.warn("Could not load practice stats:", err);
      });
    return () => controller.abort();
  }, []);

  // ---- Detect and Save User Location ----
  useEffect(() => {
    const detectLocation = async () => {
      if (!user) return;
      if ((user.location || "").trim()) {
        return;
      }
      if (isDetectingLocationRef.current) return;
      isDetectingLocationRef.current = true;

      try {
        const { city, country } = await getUserLocation();
        const locationString = `${city}, ${country}`;

        const payload = await api.patch("/api/profile/location/", { city, country });
        setUser((prev) =>
          prev
            ? {
                ...prev,
                location: payload.location || locationString,
                location_updated_at: payload.location_updated_at,
              }
            : prev
        );
      } catch (err) {
        logger.warn("Could not get location:", err);
      } finally {
        isDetectingLocationRef.current = false;
      }
    };

    detectLocation();
  }, [user]);

  if (loading) return <div className="pf-state">Loading profile…</div>;
  if (error) return <div className="pf-state" role="alert">{error}</div>;
  if (!user) return null;

  const uploadPhoto = async (slot, file) => {
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please select a valid image.");
      return;
    }

    try {
      setUploadingSlot(slot);
      const formData = new FormData();
      formData.append("profile_image", file);
      formData.append("slot", slot);

      const payload = await api.upload(`/api/profile/${user.user_id}/update-image/`, formData, {
        method: "PATCH",
      });
      setUser((prev) => ({
        ...prev,
        profile_image_url: payload.profile_image_url || prev.profile_image_url,
        complementary_image_1_url:
          payload.complementary_image_1_url || prev.complementary_image_1_url,
        complementary_image_2_url:
          payload.complementary_image_2_url || prev.complementary_image_2_url,
      }));
      setFailedPhotoKeys((prev) => {
        const next = new Set(prev);
        next.delete(slot);
        return next;
      });
      toast.success("Photo updated.");
    } catch (err) {
      // A toast instead of the page-level error, which would replace the whole profile.
      toastApiError(err, "Couldn't upload the photo");
    } finally {
      setUploadingSlot("");
    }
  };

  const photoSlots = [
    { key: "profile", label: "Profile photo", image: resolveMediaUrl(user.profile_image_url) },
    { key: "complementary_1", label: "Photo 2", image: resolveMediaUrl(user.complementary_image_1_url) },
    { key: "complementary_2", label: "Photo 3", image: resolveMediaUrl(user.complementary_image_2_url) },
  ].map((slot) => ({ ...slot, uploading: uploadingSlot === slot.key }));
  // Only real photos are viewable (no chameleon default / empty slots).
  const gallery = buildPhotoGallery(
    photoSlots
      .filter((slot) => !failedPhotoKeys.has(slot.key))
      .map((slot) => ({ key: slot.key, src: slot.image, alt: `Your ${slot.label.toLowerCase()}` }))
  );
  const galleryIndex = (key) => gallery.findIndex((photo) => photo.key === key);
  const viewLabel = (key) => `View photo ${galleryIndex(key) + 1} of ${gallery.length}`;
  const mainPhotoIndex = galleryIndex("profile");

  const uploadInput = (slot) => (
    <input
      type="file"
      accept="image/*"
      className="sr-only"
      disabled={slot.uploading}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) uploadPhoto(slot.key, file);
        e.target.value = "";
      }}
    />
  );

  const localTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const statusItems = [
    user.location
      ? { key: "place", icon: "place", text: user.location }
      : { key: "place", icon: "place", text: "Detecting location…" },
    { key: "time", icon: "time", text: `${localTime} local time` },
  ];

  const handleStrengthStep = (key) => {
    if (key === "photo" || key === "photos") {
      photosRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      photosRef.current?.querySelector(".pf-photo-add input:not(:disabled)")?.focus({ preventScroll: true });
      return;
    }
    navigate("/profile/edit");
  };

  return (
    <div className="pf-page">
      <ProfileHero
        profile={user}
        avatarUrl={resolveMediaUrl(user.profile_image_url)}
        ringColor={validRingColor(user.avatar_ring_color)}
        statusItems={statusItems}
        onOpenAvatar={mainPhotoIndex >= 0 ? (event) => viewer.open(mainPhotoIndex, event) : undefined}
        avatarLabel={viewLabel("profile")}
        onAvatarError={() => markPhotoFailed("profile")}
      >
        <button type="button" className="pf-btn is-primary" onClick={() => navigate("/profile/edit")}>
          <EditOutlinedIcon aria-hidden="true" />
          Edit profile
        </button>
        <button type="button" className="pf-btn" onClick={() => shareProfileLink(user.username)}>
          <IosShareRoundedIcon aria-hidden="true" />
          Share profile
        </button>
        <Link to={`/people/${encodeURIComponent(user.username)}`} className="pf-btn">
          <VisibilityOutlinedIcon aria-hidden="true" />
          View as others see it
        </Link>
      </ProfileHero>

      <div className="pf-grid">
        <div className="pf-col">
          <LanguagesCard profile={user} emptyText="Add your languages in Edit profile." />
          <AboutCard
            profile={user}
            emptyBio="Tell partners a little about yourself in Edit profile."
            emptyGoal="What do you want to achieve? Add it in Edit profile."
          />
        </div>
        <div className="pf-col">
          <PracticeCard practice={practice} />
          <VisitorsCard user={user} />
        </div>
        <div className="pf-col">
          <StrengthCard user={user} onStep={handleStrengthStep} />
          <div ref={photosRef}>
            <PhotosCard
              slots={photoSlots}
              galleryIndex={galleryIndex}
              onOpen={viewer.open}
              viewLabel={viewLabel}
              onPhotoError={markPhotoFailed}
              hint="One profile photo and two more. Click a photo to view it full size."
              renderAdd={(slot) => (
                <label className="pf-photo-add">
                  {uploadInput(slot)}
                  <AddRoundedIcon aria-hidden="true" />
                  Add<span className="sr-only"> {slot.label.toLowerCase()}</span>
                </label>
              )}
              renderChange={(slot) => (
                <label className="pf-photo-change">
                  {uploadInput(slot)}
                  Change<span className="sr-only"> {slot.label.toLowerCase()}</span>
                </label>
              )}
            />
          </div>
        </div>
      </div>

      <PhotoViewer
        photos={gallery}
        index={viewer.index}
        onClose={viewer.close}
        returnFocusRef={viewer.triggerRef}
        label="Your photos"
      />
    </div>
  );
};

export default ProfilePage;
