import React from "react";

const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const AvatarBadge = ({ src, name, showPulse = false }) => (
  <div className="flex flex-col items-center gap-2">
    <div className="relative">
      {showPulse && (
        <span
          className="absolute inset-0 rounded-full bg-emerald-300/35 animate-ping"
          style={{ animationDuration: "2.4s" }}
        />
      )}
      <img
        src={src}
        alt={name}
        className="relative h-20 w-20 rounded-full border-2 border-white/30 object-cover shadow-md"
      />
    </div>
    <span className="text-sm text-slate-200">{name}</span>
  </div>
);

const CallPanel = ({
  visible,
  callState,
  callMode,
  callDurationSeconds = 0,
  otherUsername,
  otherAvatarUrl,
  remoteVideoRef,
  localVideoRef,
  isMuted,
  isCameraOn,
  errorMessage,
  onAccept,
  onDecline,
  onHangup,
  onToggleMute,
  onToggleCamera,
}) => {
  if (!visible) return null;

  const isIncoming = callState === "incoming";
  const isConnected = callState === "in_call";
  const isConnecting = callState === "calling" || callState === "connecting";
  const isRinging = callState === "incoming" || callState === "calling";
  const callLabel = callMode === "video" ? "Video" : "Audio";
  const durationLabel = formatDuration(callDurationSeconds);
  const showAvatarStage = !isConnected && (isRinging || callState === "connecting");

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-slate-950/95 text-white">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
        <p className="max-w-full truncate text-sm font-semibold">
          {callLabel} call with {otherUsername}
        </p>
        <p className="text-xs text-slate-300">
          {isIncoming && "Incoming call"}
          {isConnecting && "Connecting..."}
          {isConnected && `Connected · ${durationLabel}`}
        </p>
      </div>

      <div className="relative flex-1">
        {showAvatarStage ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <audio ref={remoteVideoRef} autoPlay playsInline />
            <AvatarBadge src={otherAvatarUrl} name={otherUsername} showPulse={isRinging} />
            <p className="text-sm text-slate-300">
              {isRinging && "Ringing..."}
              {callState === "connecting" && "Joining call..."}
            </p>
          </div>
        ) : callMode === "video" ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full bg-black object-cover"
            />
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="absolute bottom-3 right-3 h-28 w-20 rounded-lg border border-white/20 bg-black object-cover sm:h-36 sm:w-24"
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <audio ref={remoteVideoRef} autoPlay playsInline />
            <AvatarBadge src={otherAvatarUrl} name={otherUsername} showPulse={isRinging} />
            <p className="text-sm text-slate-300">
              {isConnected && `In call · ${durationLabel}`}
            </p>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="border-t border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 p-3 sm:gap-3 sm:p-4">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={onDecline}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Accept
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              className="rounded-full border border-white/25 px-3 py-2 text-sm"
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            {callMode === "video" && (
              <button
                type="button"
                onClick={onToggleCamera}
                className="rounded-full border border-white/25 px-3 py-2 text-sm"
              >
                {isCameraOn ? "Camera Off" : "Camera On"}
              </button>
            )}
            <button
              type="button"
              onClick={onHangup}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white"
            >
              End Call
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CallPanel;
