import React, { useEffect, useRef, useState } from "react";

/**
 * Google Identity Services ("Sign in with Google") without an npm package.
 *
 * The GIS script is only loaded when a GoogleSignInButton mounts and
 * REACT_APP_GOOGLE_CLIENT_ID is set (one <script> tag, promise-cached). Without the
 * env var nothing renders, so local dev and tests stay free of third-party scripts.
 * The button returns a Google ID token (`credential`), which the caller posts to
 * POST /api/auth/google/ (lib/authApi.ts).
 */

// hl=en: the button text follows this, not the browser language (renderButton's
// locale alone is ignored once the button is personalised). CSP ignores the query.
export const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client?hl=en";

type CredentialResponse = { credential?: string; select_by?: string };

type GoogleButtonOptions = {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
  locale?: string;
};

export type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    itp_support?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
  cancel?: () => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

/** The OAuth web client id (public), or "" when Google sign-in is not configured. */
export const getGoogleClientId = (): string => (process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();

export const isGoogleSignInEnabled = (): boolean => Boolean(getGoogleClientId());

let scriptPromise: Promise<GoogleAccountsId> | null = null;

const readGoogleId = (): GoogleAccountsId | undefined =>
  typeof window === "undefined" ? undefined : window.google?.accounts?.id;

/** Loads the GIS client once; a failed load can be retried by the next caller. */
export const loadGoogleIdentity = (): Promise<GoogleAccountsId> => {
  const ready = readGoogleId();
  if (ready) return Promise.resolve(ready);
  if (scriptPromise) return scriptPromise;
  if (typeof document === "undefined") return Promise.reject(new Error("No document"));

  const script = document.createElement("script");
  const promise = new Promise<GoogleAccountsId>((resolve, reject) => {
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const id = readGoogleId();
      if (id) resolve(id);
      else reject(new Error("Google Identity Services did not initialise"));
    };
    script.onerror = () => reject(new Error("Google Identity Services failed to load"));
  });
  scriptPromise = promise;
  promise.catch(() => {
    scriptPromise = null;
    script.remove();
  });
  document.head.appendChild(script);
  return promise;
};

/** Test helper: forget the cached script promise. */
export const resetGoogleIdentityForTests = () => {
  scriptPromise = null;
};

const MIN_BUTTON_WIDTH = 200;
const MAX_BUTTON_WIDTH = 400; // GIS maximum
const FALLBACK_BUTTON_WIDTH = 320;

type GoogleSignInButtonProps = {
  onCredential: (credential: string) => void;
  /** "continue_with" on sign-up, "signin_with" on log in. */
  text?: "continue_with" | "signin_with";
  className?: string;
};

/**
 * Google's own button (rendered by GIS inside an iframe). Renders nothing when
 * REACT_APP_GOOGLE_CLIENT_ID is unset; shows a short note if the script can't load.
 */
export const GoogleSignInButton = ({ onCredential, text = "continue_with", className = "" }: GoogleSignInButtonProps) => {
  const clientId = getGoogleClientId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    setStatus("loading");
    loadGoogleIdentity().then(
      (googleId) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        googleId.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) onCredentialRef.current(response.credential);
          },
          ux_mode: "popup",
          auto_select: false,
          itp_support: true,
        });
        const measured = Math.floor(container.clientWidth || 0);
        const width = measured
          ? Math.max(MIN_BUTTON_WIDTH, Math.min(MAX_BUTTON_WIDTH, measured))
          : FALLBACK_BUTTON_WIDTH;
        container.replaceChildren();
        googleId.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "pill",
          logo_alignment: "left",
          // English like the rest of the app (Google otherwise follows the browser language).
          locale: "en",
          width,
        });
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("failed");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (!clientId) return null;

  return (
    <div className={`flex w-full flex-col items-center ${className}`}>
      {/* GIS draws its iframe in here; the min-height avoids a jump while it loads. */}
      <div
        ref={containerRef}
        data-testid="google-signin-button"
        className="flex min-h-[44px] w-full max-w-[400px] justify-center"
        aria-busy={status === "loading" ? "true" : undefined}
      />
      {status === "failed" && (
        <p role="status" className="mt-1 text-center text-xs text-[var(--lv-muted-ink)]">
          Google sign-in couldn&apos;t load. Check your connection, or use your email below.
        </p>
      )}
    </div>
  );
};

export default GoogleSignInButton;
