import React, { useEffect, useRef, useState } from "react";
import { EMAIL_UNVERIFIED_EVENT } from "../../features/emailVerification";
import { useUser } from "../../context/UserContext";
import VerifyEmailForm from "./VerifyEmailForm";

export default function EmailVerificationGate() {
  const { user, setUser, refreshUserProfile } = useUser();
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    const show = () => {
      trigger.current = document.activeElement;
      setUser((current) => current ? { ...current, email_verified: false } : current);
      setOpen(true);
    };
    window.addEventListener(EMAIL_UNVERIFIED_EVENT, show);
    // Link verification on another device is also picked up on return to this tab.
    const onFocus = () => { if (user?.email_verified === false) refreshUserProfile(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(EMAIL_UNVERIFIED_EVENT, show);
      window.removeEventListener("focus", onFocus);
    };
  }, [setUser, refreshUserProfile, user?.email_verified]);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  useEffect(() => {
    if (user?.email_verified === true) {
      dialog.current?.close();
      setOpen(false);
    }
  }, [user?.email_verified]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus?.();
  };
  if (!user) return null;
  return <>
    {user.email_verified === false && <div className="ev-banner" role="status">
      <span>Verify your email to message people, make calls, and chat with Lumi.</span>
      <button type="button" onClick={() => { trigger.current = document.activeElement; setOpen(true); }}>Enter code</button>
    </div>}
    {open && <dialog ref={dialog} className="ev-dialog" aria-labelledby="verify-email-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === dialog.current) close(); }}>
      <VerifyEmailForm onVerified={close} onLater={close} />
    </dialog>}
  </>;
}
