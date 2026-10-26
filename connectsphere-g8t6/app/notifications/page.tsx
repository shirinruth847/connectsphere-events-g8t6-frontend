import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { NOTIFICATION_ROLES } from "@/lib/auth";

// Attendees (SPM-155) and organisers (SPM-192); SPM-193 adds coordinators in lib/auth.ts.
export default function NotificationsPage() {
  return <DashboardWorkspace role={NOTIFICATION_ROLES}><NotificationsInbox /></DashboardWorkspace>;
}
