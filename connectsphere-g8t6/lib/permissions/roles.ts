// Presentation-only role helpers. They decide what to render from the role
// the backend returned; they are never the enforcement layer (Master 2.6).

export const ROLES = {
  ORGANISER: "ORGANISER",
  COORDINATOR: "COORDINATOR",
  VENUE_STAFF: "VENUE_STAFF",
  TECH_SUPPORT: "TECH_SUPPORT",
  ATTENDEE: "ATTENDEE",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  ORGANISER: "Event Organiser",
  COORDINATOR: "Event Coordinator",
  VENUE_STAFF: "Venue Staff",
  TECH_SUPPORT: "Technical Support",
  ATTENDEE: "Attendee",
};

const DASHBOARD_ROLES: readonly Role[] = [ROLES.ORGANISER, ROLES.COORDINATOR, ROLES.VENUE_STAFF, ROLES.TECH_SUPPORT];

// Pages that only make sense for some roles. Paths not listed are left to the
// backend to allow or refuse.
const ROLE_SCOPED_PATHS: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/dashboard", roles: DASHBOARD_ROLES },
  { prefix: "/my-registrations", roles: [ROLES.ATTENDEE] },
];

const matchesPrefix = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function canViewPath(role: Role, pathname: string): boolean {
  const scoped = ROLE_SCOPED_PATHS.find(({ prefix }) => matchesPrefix(pathname, prefix));
  return scoped ? scoped.roles.includes(role) : true;
}

export function navigationFor(role: Role): { href: string; label: string }[] {
  if (role === ROLES.ATTENDEE) return [{ href: "/my-registrations", label: "My Registrations" }];
  return [{ href: "/dashboard", label: "Dashboard" }];
}
