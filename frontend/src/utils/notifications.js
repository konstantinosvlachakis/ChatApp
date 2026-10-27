// Desktop (browser) notification permission, shared by layout/Layout.jsx (asks once on load)
// and the Settings page (shows the state and lets the user ask again).

/** "granted" | "denied" | "default" | "unsupported" */
export const getNotificationPermission = () => {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
};

/** Asks the browser for permission; resolves with the resulting state and never throws. */
export const requestNotificationPermission = async () => {
  if (getNotificationPermission() === "unsupported") return "unsupported";
  try {
    // Older Safari uses a callback and returns undefined, so fall back to the property.
    const result = await window.Notification.requestPermission();
    return result || window.Notification.permission;
  } catch {
    return window.Notification.permission;
  }
};
