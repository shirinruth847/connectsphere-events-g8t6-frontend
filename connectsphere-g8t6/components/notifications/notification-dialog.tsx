"use client";

import { Dialog } from "@/components/shared/dialog";
import { KeyValuePanel, type KeyValueRow } from "@/components/shared/key-value-panel";
import { Button } from "@/components/shared/primitives";
import type { NotificationItem } from "@/lib/api/notifications";
import { formatNotificationTimestamp, notificationTargetHref, offerExpiry } from "@/lib/notifications";

// The full notification. Opening it marks it read (the page does that).
export function NotificationDialog({
  notification,
  now,
  busy,
  onClose,
  onGoToEvent,
}: {
  notification: NotificationItem | null;
  now: Date;
  busy: boolean;
  onClose: () => void;
  onGoToEvent: (notification: NotificationItem) => void;
}) {
  const expiry = notification ? offerExpiry(notification.action_expires_at, now) : null;
  const rows: KeyValueRow[] = notification
    ? [
        ...(notification.event ? [{ label: "Event", value: notification.event.title, icon: "calendar" as const }] : []),
        { label: "Received", value: formatNotificationTimestamp(notification.created_at), icon: "schedule" },
        ...(expiry ? [{ label: expiry.expired ? "Offer expired" : "Offer expires", value: formatNotificationTimestamp(notification.action_expires_at), icon: "warning" as const }] : []),
      ]
    : [];
  const href = notification ? notificationTargetHref(notification.target) : null;

  return (
    <Dialog
      open={notification !== null}
      onClose={onClose}
      title={notification?.title ?? "Notification"}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} className="max-lg:min-h-11">
            Close
          </Button>
          {notification && href ? (
            <Button type="button" disabled={busy} onClick={() => onGoToEvent(notification)} className="max-lg:min-h-11">
              Go to Event
            </Button>
          ) : null}
        </>
      }
    >
      {notification ? (
        <div className="flex flex-col gap-4">
          <p className="max-w-readable whitespace-pre-line text-sm leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
            {notification.message}
          </p>
          <KeyValuePanel rows={rows} />
        </div>
      ) : null}
    </Dialog>
  );
}
