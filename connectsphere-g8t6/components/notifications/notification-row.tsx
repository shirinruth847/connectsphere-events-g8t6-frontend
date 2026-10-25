"use client";

import { useId } from "react";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/shared/primitives";
import type { NotificationItem } from "@/lib/api/notifications";
import {
  formatNotificationTime,
  formatNotificationTimestamp,
  notificationTargetHref,
  offerExpiry,
} from "@/lib/notifications";

// "Go to Event ›" from the notification frame (282:1173): a compact tonal
// button, raised to the shared 36px (44px on touch) target size.
const goButtonClasses =
  "inline-flex min-h-9 items-center gap-2 rounded-tag bg-surface-container px-3 text-on-surface shadow-elevation-1 transition-colors duration-150 hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-55 max-lg:min-h-11";

// The global `button { font: inherit }` rule outranks text utilities on the
// button itself, so compact labels carry their type style on a span.
export const COMPACT_LABEL = "text-xs font-semibold tracking-[0.02em]";

interface NotificationRowProps {
  notification: NotificationItem;
  now: Date;
  busy: boolean;
  // The Updates panel is compact; the page shows a card with a View action.
  variant: "panel" | "page";
  onGoToEvent: (notification: NotificationItem) => void;
  onView?: (notification: NotificationItem, trigger: HTMLButtonElement) => void;
  onMarkRead?: (notification: NotificationItem) => void;
}

// One notification: title, message, event, offer expiry and time, with unread
// shown by colour, a dot and text (never colour alone).
export function NotificationRow({ notification, now, busy, variant, onGoToEvent, onView, onMarkRead }: NotificationRowProps) {
  const titleId = useId();
  const unread = !notification.is_read;
  const href = notificationTargetHref(notification.target);
  const expiry = offerExpiry(notification.action_expires_at, now);
  const page = variant === "page";

  return (
    <article
      aria-labelledby={titleId}
      data-unread={unread ? "true" : "false"}
      className={
        page
          ? `rounded-panel border-t-4 bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5 ${unread ? "border-t-primary" : "border-t-transparent"}`
          : "px-4 py-4"
      }
    >
      <div className="flex items-start gap-3">
        <span className={`pt-0.5 ${unread ? "text-primary" : "text-on-surface-variant"}`}>
          <Icon name="document" size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id={titleId} className={`flex items-start gap-2 text-sm font-semibold leading-snug ${unread ? "text-primary" : "text-on-surface"}`}>
            {unread ? <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-primary" /> : null}
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {notification.title}
              {unread ? <span className="sr-only"> (unread)</span> : null}
            </span>
          </h3>
          <p className={`text-xs leading-relaxed text-on-surface-variant [overflow-wrap:anywhere] ${page ? "line-clamp-3 max-w-readable" : "line-clamp-3"}`}>
            {notification.message}
          </p>
          {notification.event ? (
            <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <Icon name="calendar" size={16} />
              <span className="min-w-0 truncate">
                <span className="sr-only">Event: </span>
                {notification.event.title}
              </span>
            </p>
          ) : null}
          {expiry ? (
            <p
              className={`mt-1 inline-flex w-fit items-center gap-1.5 rounded-tag px-2 py-1 text-xs font-semibold ${
                expiry.expired ? "bg-surface-container-high text-on-surface-variant" : "bg-tertiary-fixed text-on-tertiary-fixed"
              }`}
            >
              <Icon name="schedule" size={16} />
              {expiry.text}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {href ? (
                <button
                  type="button"
                  className={goButtonClasses}
                  disabled={busy}
                  aria-label={notification.event ? `Go to Event: ${notification.event.title}` : undefined}
                  onClick={() => onGoToEvent(notification)}
                >
                  <span className={COMPACT_LABEL}>Go to Event</span>
                  <Icon name="chevron-right" size={16} />
                </button>
              ) : null}
              {page && onView ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-9 max-lg:min-h-11"
                  aria-label={`View ${notification.title}`}
                  onClick={(event) => onView(notification, event.currentTarget)}
                >
                  <span className={COMPACT_LABEL}>View</span>
                </Button>
              ) : null}
              {!page && !href && unread && onMarkRead ? (
                <Button
                  type="button"
                  variant="quiet"
                  className="min-h-9 max-lg:min-h-11"
                  disabled={busy}
                  aria-label={`Mark as read: ${notification.title}`}
                  onClick={() => onMarkRead(notification)}
                >
                  <span className={COMPACT_LABEL}>Mark as read</span>
                </Button>
              ) : null}
            </div>
            <time
              dateTime={notification.created_at}
              title={formatNotificationTimestamp(notification.created_at)}
              className="ml-auto text-xs text-on-surface-variant"
            >
              {formatNotificationTime(notification.created_at, now)}
            </time>
          </div>
        </div>
      </div>
    </article>
  );
}
