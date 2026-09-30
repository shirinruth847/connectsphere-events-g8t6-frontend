import type { AppRole } from "./auth/session";

export interface NavItem {
  label: string;
  href: string;
}

// Top-level destinations per role, drawn from the master's frontend surfaces (§3.4).
// Links to routes that are not built yet will 404 until their tickets land.
export const NAV_ITEMS: Record<AppRole, NavItem[]> = {
  ATTENDEE: [
    { label: "Event Discovery", href: "/events" },
    { label: "My Events", href: "/my-registrations" },
  ],
  ORGANISER: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "My Event Requests", href: "/events" },
    { label: "Notifications", href: "/notifications" },
  ],
  COORDINATOR: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Events", href: "/events" },
    { label: "Venues", href: "/venues" },
    { label: "Notifications", href: "/notifications" },
  ],
  VENUE_STAFF: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Venues", href: "/venues" },
    { label: "Notifications", href: "/notifications" },
  ],
  TECH_SUPPORT: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Technical Requests", href: "/technical-requests" },
    { label: "Notifications", href: "/notifications" },
  ],
};

export const ROLE_LABELS: Record<AppRole, string> = {
  ORGANISER: "Event Organiser",
  COORDINATOR: "Event Coordinator",
  VENUE_STAFF: "Venue Staff",
  TECH_SUPPORT: "Technical Support",
  ATTENDEE: "Attendee",
};
