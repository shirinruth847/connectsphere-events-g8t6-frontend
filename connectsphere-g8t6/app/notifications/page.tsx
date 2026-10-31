import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { NOTIFICATION_ROLES } from "@/lib/auth";

// Attendees (SPM-155), organisers (SPM-192), coordinators (SPM-193) and Technical Support (SPM-287); see NOTIFICATION_ROLES.
export default function NotificationsPage() {
  return <DashboardWorkspace role={NOTIFICATION_ROLES}><NotificationsInbox /></DashboardWorkspace>;
}
