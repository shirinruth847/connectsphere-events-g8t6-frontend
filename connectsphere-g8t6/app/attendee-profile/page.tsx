import type { Metadata } from "next";
import { AttendeeProfilePage } from "@/components/attendee/profile/attendee-profile";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";

export const metadata: Metadata = { title: "Attendee Profile | ConnectSphere" };

// Attendees only (SPM-270 AC1). AuthGate redirects signed-out visitors to login
// with this page as the return path and denies other roles; the backend
// enforces the same rule.
export default function AttendeeProfileRoute() {
  return <DashboardWorkspace role="ATTENDEE"><AttendeeProfilePage /></DashboardWorkspace>;
}
