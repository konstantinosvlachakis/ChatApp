import React from "react";

const CallPanel = ({
  visible,
  callState,
  callMode,
  otherUsername,
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
  const callLabel = callMode === "video" ? "Video" : "Audio";

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-slate-950/95 text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold">
          {callLabel} call with {otherUsername}
        </p>
        <p className="text-xs text-slate-300">
          {isIncoming && "Incoming call"}
          {isConnecting && "Connecting..."}
          {isConnected && "Connected"}
        </p>
      </div>

      <div className="relative flex-1">
        {callMode === "video" ? (
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
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <audio ref={remoteVideoRef} autoPlay playsInline />
            <div className="h-24 w-24 rounded-full bg-white/10" />
            <p className="text-lg font-semibold">{otherUsername}</p>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="border-t border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 border-t border-white/10 p-4">
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
