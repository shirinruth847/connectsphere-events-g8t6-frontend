"use client";

import { useEffect, useEffectEvent } from "react";

// Re-reads when the viewer comes back to an already open tab or window.
// Switching tabs usually fires both focus and visibilitychange, so a return
// signal is ignored while the previous refresh is still running.
export function useRefreshOnReturn(refresh: () => Promise<unknown> | void, enabled = true) {
  const onReturn = useEffectEvent(refresh);

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const handleReturn = () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      Promise.resolve()
        .then(() => onReturn())
        .catch(() => {})
        .finally(() => { running = false; });
    };
    window.addEventListener("focus", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);
    return () => {
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  }, [enabled]);
}
