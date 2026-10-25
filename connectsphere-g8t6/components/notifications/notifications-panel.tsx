"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/shared/icon";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { ROUTES } from "@/lib/auth";
import { NotificationRow } from "./notification-row";
import { useNotificationList } from "./use-notification-list";

export const PANEL_PAGE_SIZE = 5;

// The Updates dropdown from the notification frame (282:1173): header with the
// new count, the latest notifications in a scrolling list, and a footer with
// Mark all as read and See more (the full /notifications inbox).
export function NotificationsPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const panel = useNotificationList({ pageSize: PANEL_PAGE_SIZE, refreshOnReturn: false });
  const heading = useRef<HTMLHeadingElement>(null);
  const now = new Date();

  useEffect(() => { heading.current?.focus(); }, []);

  const goToEvent = async (notification: Parameters<typeof panel.goToEvent>[0]) => {
    if (await panel.goToEvent(notification)) onClose();
  };

  return (
    <div
      id={id}
      role="dialog"
      aria-labelledby={`${id}-heading`}
      className="z-30 flex w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-chip border border-outline-variant/60 bg-surface-container-lowest text-left shadow-elevation-4 max-sm:fixed max-sm:inset-x-4 max-sm:top-16 max-sm:w-auto sm:absolute sm:right-0 sm:top-full sm:mt-2"
    >
      <header className="flex items-center justify-between gap-3 border-b border-outline-variant/40 bg-surface px-4 py-2.5">
        <h2
          id={`${id}-heading`}
          ref={heading}
          tabIndex={-1}
          className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant focus:outline-none"
        >
          <Icon name="notifications" size={16} />
          Notifications
        </h2>
        {panel.status === "ready" && panel.unreadCount > 0 ? (
          <span className="rounded-pill bg-primary-fixed px-2 py-0.5 text-[11px] font-semibold text-primary">
            {panel.unreadCount} New
          </span>
        ) : null}
      </header>

      <div className="max-h-[360px] overflow-y-auto">
        {panel.notice ? (
          <div className="px-4 pt-3">
            <AlertBanner tone={panel.notice.tone}>{panel.notice.text}</AlertBanner>
          </div>
        ) : null}

        {panel.status === "loading" ? (
          <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading notifications">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}
          </div>
        ) : null}

        {panel.status === "error" ? (
          <div className="p-4">
            <AlertBanner tone="error" title="Could not load notifications">
              {panel.error?.message}
              <div className="mt-3">
                <Button variant="danger" onClick={panel.retry} className="max-lg:min-h-11">Try again</Button>
              </div>
            </AlertBanner>
          </div>
        ) : null}

        {panel.status === "ready" && panel.items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-semibold text-on-surface">No notifications yet</p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">Updates about your events will appear here.</p>
          </div>
        ) : null}

        {panel.status === "ready" && panel.items.length > 0 ? (
          <ul aria-labelledby={`${id}-heading`} className="divide-y divide-outline-variant/40">
            {panel.items.map((notification) => (
              <li key={notification.notification_id}>
                <NotificationRow
                  variant="panel"
                  notification={notification}
                  now={now}
                  busy={panel.isBusy(notification.notification_id)}
                  onGoToEvent={goToEvent}
                  onMarkRead={panel.markRead}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-outline-variant/40 bg-surface px-2.5 py-2">
        <Button
          type="button"
          variant="quiet"
          className="min-h-9 px-2 max-lg:min-h-11"
          onClick={panel.markAllRead}
          disabled={panel.status !== "ready" || panel.unreadCount === 0 || panel.markingAll}
        >
          <span className="text-xs font-medium">{panel.markingAll ? "Marking all as read…" : "Mark all as read"}</span>
        </Button>
        <Link
          href={ROUTES.notifications}
          onClick={onClose}
          className="inline-flex min-h-9 items-center gap-1 rounded-tag px-2 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-lg:min-h-11"
        >
          See more
          <Icon name="chevron-right" size={16} />
        </Link>
      </footer>
    </div>
  );
}
