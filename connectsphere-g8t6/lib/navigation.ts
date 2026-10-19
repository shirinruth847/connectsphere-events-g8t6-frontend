import { ROUTES, type UserRole } from "@/lib/auth";

export type NavigationIcon = "dashboard" | "event" | "registrations" | "notifications" | "support" | "settings";
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
  COORDINATOR: [
    { id: "home", title: "Assigned Events", icon: "event", href: ROUTES.dashboard },
    { id: "venues", title: "Venue Catalogue", icon: "dashboard", href: ROUTES.venues },
  ],
  COORDINATOR_LEAD: [
    { id: "home", title: "Dashboard", icon: "dashboard", href: ROUTES.dashboard },
    { id: "venues", title: "Venue Catalogue", icon: "dashboard", href: ROUTES.venues },
  ],
  VENUE_STAFF: [{ id: "venues", title: "Venue Catalogue", icon: "dashboard", href: ROUTES.venues }],
  TECH_SUPPORT: [{ id: "home", title: "Dashboard", icon: "dashboard", href: ROUTES.dashboard }],
  ATTENDEE: [{ id: "home", title: "My Registrations", icon: "registrations", href: ROUTES.registrations }],
};

export function navigationForRole(role: UserRole): NavigationGroup[] {
  return [
    { title: "Main Navigation", items: mainItems[role] },
    { title: "Support And Settings", items: [{ id: "support", title: "Contact Support", icon: "support" }] },
    { title: "Account Management", items: [{ id: "settings", title: "Settings", icon: "settings" }] },
  ];
}

export function activeNavigationId(role: UserRole, pathname: string, status: string | null) {
  if (role !== "ORGANISER") return pathname === ROUTES.venues ? "venues" : "home";
  if (pathname === ROUTES.dashboard && status === "DRAFT") return "drafts";
  return "requests";
}
