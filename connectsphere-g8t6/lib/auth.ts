export type UserRole = "ORGANISER" | "COORDINATOR" | "COORDINATOR_LEAD" | "VENUE_STAFF" | "TECH_SUPPORT" | "ATTENDEE";
export type SessionUser = { user_id: number; name: string; email: string; role: UserRole; home_path?: string; authId?: string; avatarUrl?: string };

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  registrations: "/my-registrations",
  newEvent: "/events/new",
  createEvent: "/events/create",
  drafts: "/dashboard?status=DRAFT#my-drafts",
} as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  ORGANISER: "Event Organiser", COORDINATOR: "Event Coordinator",
  COORDINATOR_LEAD: "Event Coordinator Lead", VENUE_STAFF: "Venue Staff",
  TECH_SUPPORT: "Technical Support", ATTENDEE: "Attendee",
};

export function homeForRole(role: UserRole) {
  return role === "ATTENDEE" ? ROUTES.registrations : ROUTES.dashboard;
}

export function safeNextPath(value: string | null): string | null {
  if (!value?.startsWith("/") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const base = "https://connectsphere.invalid";
    const url = new URL(value, base);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return url.origin === base && !path.startsWith("//") ? path : null;
  } catch { return null; }
}

export function canViewPath(role: UserRole, path: string) {
  const pathname = path.split(/[?#]/)[0];
  if (pathname === ROUTES.dashboard) return role !== "ATTENDEE";
  if (pathname === ROUTES.registrations) return role === "ATTENDEE";
  if (pathname === "/events") return role === "COORDINATOR_LEAD";
  if (pathname === "/calendar" || pathname === "/assignments") return role === "COORDINATOR_LEAD";
  if (/^\/events\/(new|create|\d+)$/.test(pathname)) return role === "ORGANISER";
  return false;
}

export function postLoginPath(user: SessionUser, next: string | null) {
  const path = safeNextPath(next);
  return path && canViewPath(user.role, path) ? path : homeForRole(user.role);
}

export function loginUrl(path: string) {
  return `${ROUTES.login}?next=${encodeURIComponent(path)}&reason=required`;
}
