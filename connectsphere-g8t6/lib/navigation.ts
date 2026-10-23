import { ROUTES, type UserRole } from "@/lib/auth";

export type NavigationIcon = "dashboard" | "event" | "registrations" | "notifications" | "support" | "settings" | "assignments" | "calendar";
type NavigationItem = { id: string; title: string; icon: NavigationIcon; href?: string };
type NavigationGroup = { title: string; items: NavigationItem[] };

// An absent href renders an unavailable item, never a link to an unfinished page.
const organiserItems: NavigationItem[] = [
  { id: "home", title: "Dashboard", icon: "dashboard", href: ROUTES.dashboard },
  { id: "requests", title: "My Requests", icon: "event", href: ROUTES.dashboard },
  { id: "drafts", title: "My Drafts", icon: "event", href: ROUTES.drafts },
  { id: "registrations-unavailable", title: "Registrations", icon: "registrations" },
  { id: "notifications", title: "Notifications", icon: "notifications" },
];

const mainItems: Record<UserRole, NavigationItem[]> = {
  ORGANISER: organiserItems,
  COORDINATOR: [{ id: "home", title: "Assigned Events", icon: "event", href: ROUTES.dashboard }],
  COORDINATOR_LEAD: [
    { id: "home", title: "Dashboard", icon: "dashboard", href: ROUTES.dashboard },
    { id: "unassigned", title: "Unassigned Queue", icon: "event", href: "/events" },
    { id: "assignments", title: "Assignments", icon: "assignments", href: ROUTES.assignments },
    { id: "calendar", title: "Calendar", icon: "calendar", href: ROUTES.calendar },
  ],
  VENUE_STAFF: [{ id: "home", title: "Dashboard", icon: "dashboard", href: ROUTES.dashboard }],
  TECH_SUPPORT: [{ id: "home", title: "Dashboard", icon: "dashboard", href: ROUTES.dashboard }],
  ATTENDEE: [
    { id: "discovery", title: "Event Discovery", icon: "event", href: ROUTES.events },
    { id: "home", title: "My Events", icon: "registrations", href: ROUTES.registrations },
    // The full inbox, read and unread (SPM-155); the Updates panel's See more leads here too.
    { id: "notifications", title: "Notifications", icon: "notifications", href: ROUTES.notifications },
  ],
};

export function navigationForRole(role: UserRole): NavigationGroup[] {
  return [
    { title: "Main Navigation", items: mainItems[role] },
    { title: "Support And Settings", items: [{ id: "support", title: "Contact Support", icon: "support" }] },
    { title: "Account Management", items: [{ id: "settings", title: "Settings", icon: "settings" }] },
  ];
}

export function activeNavigationId(role: UserRole, pathname: string, status: string | null) {
  if (role === "COORDINATOR_LEAD") {
    if (pathname === "/events") return "unassigned";
    if (pathname === "/assignments") return "assignments";
    if (pathname === "/calendar") return "calendar";
    return "home";
  }
  if (role === "ATTENDEE") {
    if (pathname === ROUTES.events) return "discovery";
    if (pathname === ROUTES.notifications) return "notifications";
    return "home";
  }
  if (role !== "ORGANISER") return "home";
  if (pathname === ROUTES.dashboard && status === "DRAFT") return "drafts";
  return "requests";
}
