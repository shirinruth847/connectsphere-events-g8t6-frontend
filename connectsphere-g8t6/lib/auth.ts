export type UserRole = 'ORGANISER' | 'COORDINATOR' | 'COORDINATOR_LEAD' | 'VENUE_STAFF' | 'TECH_SUPPORT' | 'ATTENDEE';
export type SessionUser = { user_id: number; name: string; email: string; role: UserRole; home_path?: string; authId?: string; avatarUrl?: string };

export const ROUTES = {
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  registrations: "/my-registrations",
  events: "/events",
  assignments: "/assignments",
  calendar: "/calendar",
  newEvent: "/events/new",
  createEvent: "/events/create",
  drafts: "/dashboard?status=DRAFT#my-drafts",
  venues: "/venues",
} as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  ORGANISER: 'Event Organiser',
  COORDINATOR: 'Event Coordinator',
  COORDINATOR_LEAD: 'Event Coordinator Lead',
  VENUE_STAFF: 'Venue Staff',
  TECH_SUPPORT: 'Technical Support',
  ATTENDEE: 'Attendee',
};

export function homeForRole(role: UserRole) {
  if (role === 'ATTENDEE') return ROUTES.registrations;
  return ROUTES.dashboard;
}

export function safeNextPath(value: string | null): string | null {
  if (!value?.startsWith('/') || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const base = 'https://connectsphere.invalid';
    const url = new URL(value, base);
    const path = `${url.pathname}${url.search}`;
    return url.origin === base && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

export function canViewPath(role: UserRole, path: string) {
  const pathname = path.split(/[?#]/)[0];
  if (pathname === ROUTES.dashboard) return role !== "ATTENDEE";
  if (pathname === ROUTES.registrations) return role === "ATTENDEE";
  if (pathname === "/events") return role === "COORDINATOR_LEAD" || role === "ATTENDEE";
  if (pathname === "/calendar" || pathname === "/assignments") return role === "COORDINATOR_LEAD";
  if (/^\/events\/(new|create)$/.test(pathname)) return role === "ORGANISER";
  // The event workspace (SPM-33); the backend still answers "not found" for unrelated events.
  // Venue Staff open an event through its venue bookings (SPM-181).
  if (/^\/events\/\d+$/.test(pathname)) return role === "ORGANISER" || role === "COORDINATOR" || role === "VENUE_STAFF";
  if (pathname === ROUTES.venues) return ["COORDINATOR", "COORDINATOR_LEAD", "VENUE_STAFF"].includes(role);
  // Venue maintenance (SPM-73).
  if (/^\/venues\/\d+$/.test(pathname)) return role === "VENUE_STAFF";
  return false;
}

export function postLoginPath(user: SessionUser, next: string | null) {
  const path = safeNextPath(next);
  if (path && canViewPath(user.role, path)) return path;
  // Keep the SPM-174 lead workflow's queue as its landing page. Coordinators
  // and other staff use main's role-aware dashboard; attendees go to registrations.
  return user.role === "COORDINATOR_LEAD" ? "/events" : homeForRole(user.role);
}

export function loginUrl(path: string) {
  return `${ROUTES.login}?next=${encodeURIComponent(path)}&reason=required`;
}
