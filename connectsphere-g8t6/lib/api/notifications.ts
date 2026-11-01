import { apiRequest } from "@/lib/api";

// The signed-in user's in-app inbox (SPM-155). Every role has one; the backend
// returns only the reader's own notifications and hides those whose event
// relationship has ended (AC6). Field names match the backend response.

// TECHNICAL_REQUESTS: Technical Support review the request from their dashboard (SPM-287).
export type NotificationTargetPage = "MY_EVENTS" | "EVENT_WORKSPACE" | "TECHNICAL_REQUESTS" | "VENUE_BOOKING_REQUESTS";

export interface NotificationTarget {
  // Kept as string so a page the backend adds later renders without a link
  // rather than breaking the inbox.
  page: NotificationTargetPage | (string & {});
  event_id: number;
  // TECHNICAL_REQUESTS only: the request the notice is about (SPM-196).
  technical_request_id?: number;
  // VENUE_BOOKING_REQUESTS only: the booking a new booking request notice is about (SPM-286).
  booking_id?: number;
}

export interface NotificationItem {
  notification_id: number;
  type: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
  event: { event_id: number; title: string } | null;
  target: NotificationTarget | null;
  // Set for notifications that ask for an action by a deadline, e.g. a
  // waitlist offer (SPM-163).
  action_expires_at: string | null;
}

export interface NotificationPage {
  notifications: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

// The read state the backend confirms for one notification.
export interface NotificationReadState {
  notification_id: number;
  is_read: boolean;
  read_at: string | null;
}

// GET /api/notifications — newest first, keyset-paged with nextCursor.
export function listNotifications({
  limit,
  cursor,
  signal,
}: {
  limit: number;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<NotificationPage>(`/notifications?${params}`, { signal });
}

// GET /api/notifications/unread-count — the Updates badge.
export function getUnreadNotificationCount(signal?: AbortSignal) {
  return apiRequest<{ unreadCount: number }>("/notifications/unread-count", { signal });
}

// POST /api/notifications/:id/read — repeating it is harmless. 404
// NOTIFICATION_NOT_FOUND when the notification is not the reader's or is now hidden.
export function markNotificationRead(notificationId: number) {
  return apiRequest<{ notification: NotificationReadState; unreadCount: number }>(
    `/notifications/${encodeURIComponent(String(notificationId))}/read`,
    { method: "POST" },
  );
}

// POST /api/notifications/read-all — marks every notification the reader can see.
export function markAllNotificationsRead() {
  return apiRequest<{ updated: number; unreadCount: number }>("/notifications/read-all", { method: "POST" });
}
