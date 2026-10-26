import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";

// Attendees only for now; SPM-192/193 widen the role here and in lib/auth.ts.
export default function NotificationsPage() {
  return <DashboardWorkspace role="ATTENDEE"><NotificationsInbox /></DashboardWorkspace>;
}
