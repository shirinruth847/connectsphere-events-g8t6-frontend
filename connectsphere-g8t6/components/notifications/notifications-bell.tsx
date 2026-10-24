"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/shared/icon";
import { unreadBadgeText } from "@/lib/notifications";
import { COMPACT_LABEL } from "./notification-row";
import { NotificationsPanel } from "./notifications-panel";
import { useUnreadCount } from "./use-unread-count";

// The "Updates" button with the unread count, from the My Events frame
// (282:664). Pass it as the PageContent action; it opens the Updates panel.
export function NotificationsBell() {
  const count = useUnreadCount();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const badge = unreadBadgeText(count);

  // Escape or a click outside closes the panel; Escape returns focus to Updates.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={badge ? `Updates, ${count} unread` : "Updates"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 items-center gap-2 rounded-tag bg-surface-container px-3 text-on-surface shadow-elevation-1 transition-colors duration-150 hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-lg:min-h-11"
      >
        <Icon name="notifications" size={16} />
        <span className={COMPACT_LABEL}>Updates</span>
        {badge ? (
          // Red by request (SPM-155 manual test), not the design system's primary
          // pill: white on error is about 6.5:1. The count is also in the label.
          <span aria-hidden="true" className="rounded-pill bg-error px-1.5 text-[11px] font-bold leading-[14px] tracking-[0.04em] text-on-primary">
            {badge}
          </span>
        ) : null}
      </button>
      {open ? <NotificationsPanel id={panelId} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
