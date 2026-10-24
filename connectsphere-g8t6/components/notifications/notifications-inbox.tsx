"use client";

import { useRef, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, EmptyState, Skeleton } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";
import type { NotificationItem } from "@/lib/api/notifications";
import { NotificationDialog } from "./notification-dialog";
import { NotificationRow } from "./notification-row";
import { useNotificationList } from "./use-notification-list";

export const INBOX_PAGE_SIZE = 20;

// The durable inbox at /notifications (SPM-155 AC8), shared by every role that
// is given the route. Rows follow the notification frame (282:1173) at page
// width. Render inside DashboardWorkspace.
export function NotificationsInbox() {
  const user = useSessionUser();
  const inbox = useNotificationList({ pageSize: INBOX_PAGE_SIZE, refreshOnReturn: true });
  const [openId, setOpenId] = useState<number | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  // Relative times are computed after data loads, in the browser only.
  const now = new Date();
  const open = inbox.items.find((item) => item.notification_id === openId) ?? null;
  const sessionExpired = inbox.status === "error" && inbox.error?.status === 401;

  const view = async (notification: NotificationItem, button: HTMLButtonElement) => {
    trigger.current = button;
    setOpenId(notification.notification_id);
    if ((await inbox.markRead(notification)) === "gone") closeDialog();
  };

  // The opening card can be gone if the notification was hidden meanwhile.
  function closeDialog() {
    setOpenId(null);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else listHeading.current?.focus();
    });
  }

  const unreadText = inbox.unreadCount === 1 ? "1 unread" : `${inbox.unreadCount} unread`;

  return (
    <PageContent
      eyebrow={user ? ROLE_LABELS[user.role] : "Notifications"}
      title="Notifications"
      description="Updates about your events, newest first. Opening a notification or going to its event marks it as read."
      action={
        inbox.status === "ready" && inbox.unreadCount > 0 ? (
          <Button type="button" variant="secondary" onClick={inbox.markAllRead} disabled={inbox.markingAll} className="max-lg:min-h-11">
            {inbox.markingAll ? "Marking all as read…" : "Mark all as read"}
          </Button>
        ) : undefined
      }
    >
      <section aria-labelledby="notifications-list-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-5 w-1 rounded-pill bg-primary" />
            <h2
              id="notifications-list-heading"
              ref={listHeading}
              tabIndex={-1}
              className="text-xl font-semibold tracking-[-0.01em] text-on-surface focus:outline-none"
            >
              All notifications
            </h2>
          </div>
          {inbox.status === "ready" ? (
            <span
              aria-live="polite"
              className="rounded-pill bg-primary-fixed px-3 py-1 text-[11px] font-bold uppercase tracking-label text-primary"
            >
              {unreadText}
            </span>
          ) : null}
        </div>

        {inbox.notice ? (
          <AlertBanner tone={inbox.notice.tone}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span>{inbox.notice.text}</span>
              <button type="button" onClick={inbox.dismissNotice} className="font-semibold underline">
                Dismiss
              </button>
            </div>
          </AlertBanner>
        ) : null}

        {inbox.status === "loading" ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading notifications">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-32 w-full rounded-panel" />
            ))}
          </div>
        ) : null}

        {sessionExpired ? (
          <AlertBanner tone="info" title="Your session has ended">
            Taking you to sign in…
          </AlertBanner>
        ) : null}

        {inbox.status === "error" && inbox.error?.status === 403 ? (
          <AlertBanner tone="error" title="Notifications are not available">
            This account cannot open notifications. Sign in again, or contact support if this continues.
          </AlertBanner>
        ) : null}

        {inbox.status === "error" && !sessionExpired && inbox.error?.status !== 403 ? (
          <AlertBanner tone="error" title="Could not load notifications">
            {inbox.error?.message}
            <div className="mt-3">
              <Button variant="danger" onClick={inbox.retry} className="max-lg:min-h-11">
                Try again
              </Button>
            </div>
          </AlertBanner>
        ) : null}

        {inbox.status === "ready" && inbox.items.length === 0 && !inbox.nextCursor ? (
          <EmptyState
            title="No notifications yet"
            description="Updates about your events, such as registration confirmations, changes and reminders, will appear here."
          />
        ) : null}

        {inbox.status === "ready" ? (
          <>
            {inbox.items.length > 0 ? (
              <ul className="flex flex-col gap-3" aria-labelledby="notifications-list-heading">
                {inbox.items.map((notification) => (
                  <li key={notification.notification_id}>
                    <NotificationRow
                      variant="page"
                      notification={notification}
                      now={now}
                      busy={inbox.isBusy(notification.notification_id)}
                      onGoToEvent={inbox.goToEvent}
                      onView={view}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            {inbox.loadMoreError ? (
              <AlertBanner tone="error" title="Could not load more notifications">
                {inbox.loadMoreError.message}
                <div className="mt-3">
                  <Button variant="danger" onClick={inbox.loadMore} className="max-lg:min-h-11">
                    Try again
                  </Button>
                </div>
              </AlertBanner>
            ) : null}

            {inbox.nextCursor && !inbox.loadMoreError ? (
              <div className="flex justify-center pt-1">
                <Button
                  variant="secondary"
                  onClick={inbox.loadMore}
                  disabled={inbox.loadingMore}
                  className="w-full max-lg:min-h-11 sm:w-auto"
                >
                  {inbox.loadingMore ? "Loading more notifications…" : "Load more"}
                </Button>
              </div>
            ) : null}

            {!inbox.nextCursor && inbox.pagesLoaded > 1 ? (
              <p className="text-center text-xs text-on-surface-variant">You have reached the end of your notifications.</p>
            ) : null}
          </>
        ) : null}
      </section>

      <NotificationDialog
        notification={open}
        now={now}
        busy={open ? inbox.isBusy(open.notification_id) : false}
        onClose={closeDialog}
        onGoToEvent={inbox.goToEvent}
      />
    </PageContent>
  );
}
