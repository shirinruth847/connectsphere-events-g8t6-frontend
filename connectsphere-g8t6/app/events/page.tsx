import { AttendeeEventDiscovery } from "@/components/attendee/discovery/attendee-event-discovery";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";

// Event Discovery (SPM-34). Attendee-only; other roles get the standard
// access-denied message.
export default function EventsPage() {
  return <DashboardWorkspace role="ATTENDEE"><AttendeeEventDiscovery /></DashboardWorkspace>;
}
