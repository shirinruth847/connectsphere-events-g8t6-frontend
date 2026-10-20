export type UserRole = 'ORGANISER' | 'COORDINATOR' | 'COORDINATOR_LEAD' | 'VENUE_STAFF' | 'TECH_SUPPORT' | 'ATTENDEE';
export type SessionUser = { user_id: number; name: string; email: string; role: UserRole; home_path?: string; authId?: string; avatarUrl?: string };

export const ROUTES = {
<<<<<<< HEAD
  login: '/login',
  dashboard: '/dashboard',
  registrations: '/my-registrations',
  newEvent: '/events/new',
  createEvent: '/events/create',
  drafts: '/dashboard?status=DRAFT#my-drafts',
  venues: '/venues',
=======
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  registrations: "/my-registrations",
  events: "/events",
  newEvent: "/events/new",
  createEvent: "/events/create",
  drafts: "/dashboard?status=DRAFT#my-drafts",
>>>>>>> 7676b0fe4b1c5022baf5a1818505cb7c1e5b6cec
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
  if (role === 'COORDINATOR' || role === 'VENUE_STAFF') return ROUTES.venues;
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
<<<<<<< HEAD
  if (pathname === ROUTES.dashboard) return role !== 'ATTENDEE';
  if (pathname === ROUTES.registrations) return role === 'ATTENDEE';
  if (/^\/events\/(new|create|\d+)$/.test(pathname)) return role === 'ORGANISER';
  if (pathname === ROUTES.venues) return ['COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF'].includes(role);
=======
  if (pathname === ROUTES.dashboard) return role !== "ATTENDEE";
  if (pathname === ROUTES.registrations || pathname === ROUTES.events) return role === "ATTENDEE";
  if (/^\/events\/(new|create)$/.test(pathname)) return role === "ORGANISER";
  // The event workspace (SPM-33); the backend still answers "not found" for unrelated events.
  if (/^\/events\/\d+$/.test(pathname)) return role === "ORGANISER" || role === "COORDINATOR";
>>>>>>> 7676b0fe4b1c5022baf5a1818505cb7c1e5b6cec
  return false;
}

export function postLoginPath(user: SessionUser, next: string | null) {
  const path = safeNextPath(next);
  return path && canViewPath(user.role, path) ? path : homeForRole(user.role);
}

export function loginUrl(path: string) {
  return `${ROUTES.login}?next=${encodeURIComponent(path)}&reason=required`;
}
