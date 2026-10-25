"use client";

import { useEffect, useState } from "react";
import { getUnreadNotificationCount } from "@/lib/api/notifications";
import { NOTIFICATIONS_CHANGED } from "@/lib/notifications";

// The unread count for the Updates badge. Refreshed when the page regains
// focus or becomes visible, or when told notifications changed without a
// count, and set from the count the backend returns after each read action.
// A failed refresh keeps the last known count.
export function useUnreadCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let request: AbortController | null = null;
    const refresh = () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      getUnreadNotificationCount(controller.signal)
        .then((result) => { if (!controller.signal.aborted) setCount(result.unreadCount); })
        // The badge is a hint; the inbox shows any real error.
        .catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onChanged = (event: Event) => {
      const next = (event as CustomEvent<{ unreadCount?: unknown }>).detail?.unreadCount;
      if (typeof next !== "number") return refresh();
      request?.abort();
      setCount(next);
    };
    refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      request?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, []);

  return count;
}
