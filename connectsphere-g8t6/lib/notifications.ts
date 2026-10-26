import type { NotificationItem, NotificationReadState, NotificationTarget } from "@/lib/api/notifications";
import type { UserRole } from "@/lib/auth";

// Display rules for the notifications inbox and Updates panel (SPM-155).
// Kept free of runtime imports so the unit tests can load it directly.

const TIME_ZONE = "Asia/Singapore";
const ZONE_LABEL = "SGT";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const clockFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const longDateFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const parse = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Where "Go to Event" leads. Attendees go to the event in My Events (AC4, AC5),
// marked as opened from a notification; other roles go to the event workspace.
// An unknown page gets no link.
export function notificationTargetHref(target: NotificationTarget | null | undefined) {
  if (!target || !Number.isSafeInteger(target.event_id) || target.event_id < 1) return null;
  if (target.page === "MY_EVENTS") return `/my-registrations?eventId=${target.event_id}&from=notification`;
  if (target.page === "EVENT_WORKSPACE") return `/events/${target.event_id}`;
  return null;
}

// Shown when the backend answers 404 NOTIFICATION_NOT_FOUND: the notification is
// removed from the list and this explains why, in the reader's terms.
export function notificationGoneText(role: UserRole | null | undefined) {
  const base = "That notification is no longer available.";
  if (role === "ATTENDEE") return `${base} It may be about an event you are no longer registered or waitlisted for.`;
  if (role === "ORGANISER") return `${base} It may be because you no longer have access to this event.`;
  return base;
}

// The empty inbox, naming the updates this role receives.
export function emptyInboxText(role: UserRole | null | undefined) {
  if (role === "ATTENDEE") return "Updates about your events, such as registration confirmations, changes and reminders, will appear here.";
  if (role === "ORGANISER") return "Updates about your event requests, such as submission, clarification requests, review outcomes, coordinator assignment, confirmation and cancellation, will appear here.";
  return "Updates about your events will appear here.";
}

// "Just now", "12 mins ago", "2 hrs ago", "Yesterday, 21:57 SGT", then
// "14 Oct 2026, 09:05 SGT". Days are Singapore calendar days.
export function formatNotificationTime(value: string | null | undefined, now: Date) {
  const date = parse(value);
  if (!date) return "Unknown time";
  const elapsed = now.getTime() - date.getTime();
  if (elapsed >= 0 && elapsed < MINUTE) return "Just now";
  if (elapsed >= 0 && elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  }
  if (elapsed >= 0 && elapsed < 24 * HOUR && dayKeyFormat.format(date) === dayKeyFormat.format(now)) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  }
  const yesterday = new Date(now.getTime() - 24 * HOUR);
  if (elapsed >= 0 && dayKeyFormat.format(date) === dayKeyFormat.format(yesterday)) {
    return `Yesterday, ${clockFormat.format(date)} ${ZONE_LABEL}`;
  }
  return `${dateFormat.format(date)}, ${clockFormat.format(date)} ${ZONE_LABEL}`;
}

// "Wed, 21 Oct 2026, 10:20 SGT" — the exact time behind a relative label.
export function formatNotificationTimestamp(value: string | null | undefined) {
  const date = parse(value);
  return date ? `${longDateFormat.format(date)}, ${clockFormat.format(date)} ${ZONE_LABEL}` : "Unknown time";
}

// The deadline of an action-required notification, such as a waitlist offer.
export function offerExpiry(expiresAt: string | null | undefined, now: Date) {
  const date = parse(expiresAt);
  if (!date) return null;
  const when = formatNotificationTimestamp(expiresAt);
  return date.getTime() > now.getTime()
    ? { expired: false, text: `Offer expires ${when}` }
    : { expired: true, text: `Offer expired ${when}` };
}

// Badge text; empty when nothing is unread.
export function unreadBadgeText(count: number | null | undefined) {
  if (!count || count < 1) return "";
  return count > 99 ? "99+" : String(count);
}

const newestFirst = (a: NotificationItem, b: NotificationItem) =>
  Date.parse(b.created_at) - Date.parse(a.created_at) || b.notification_id - a.notification_id;

// Adds the next keyset page; a notification already shown keeps its place.
export function appendNotifications(current: NotificationItem[], next: NotificationItem[]) {
  const seen = new Set(current.map((item) => item.notification_id));
  return [...current, ...next.filter((item) => !seen.has(item.notification_id))];
}

// Merges a refreshed first page into the loaded list: new notifications are
// added and refreshed ones replace their copy. Older loaded pages are kept, but
// a row inside the refreshed page's range that the backend no longer returns
// (hidden meanwhile, AC6) is dropped. `complete` means the refresh returned
// everything (no next page), so nothing else is kept.
export function mergeFirstPage(current: NotificationItem[], firstPage: NotificationItem[], complete: boolean) {
  if (complete) return [...firstPage].sort(newestFirst);
  const fresh = new Set(firstPage.map((item) => item.notification_id));
  const oldest = firstPage.reduce<NotificationItem | null>((last, item) => (!last || newestFirst(last, item) < 0 ? item : last), null);
  const older = current.filter((item) => !fresh.has(item.notification_id) && (!oldest || newestFirst(oldest, item) < 0));
  return [...firstPage, ...older].sort(newestFirst);
}

// Applies the read state the backend confirmed.
export function applyReadState(items: NotificationItem[], state: NotificationReadState) {
  return items.map((item) =>
    item.notification_id === state.notification_id ? { ...item, is_read: state.is_read, read_at: state.read_at } : item,
  );
}

// Tells the Updates badge that notifications changed. With the confirmed count
// from a read action the badge shows it at once; without one (e.g. after a
// registration that wrote a notification) the badge fetches the count again.
export const NOTIFICATIONS_CHANGED = "connectsphere:notifications-changed";

export function announceNotificationsChanged(unreadCount?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { unreadCount } }));
}
