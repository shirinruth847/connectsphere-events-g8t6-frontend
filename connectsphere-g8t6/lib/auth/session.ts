/**
 * MOCK SESSION — Supabase Auth is not wired into the frontend yet.
 * Replace with the verified session and trusted roles from the backend (master §4.1).
 * The active role only changes presentation; the backend enforces permissions.
 */
export type AppRole =
  | "ORGANISER"
  | "COORDINATOR"
  | "VENUE_STAFF"
  | "TECH_SUPPORT"
  | "ATTENDEE";

export interface SessionUser {
  name: string;
  roles: AppRole[];
  activeRole: AppRole;
}

export async function getSessionUser(): Promise<SessionUser> {
  return { name: "Tan Wei", roles: ["ATTENDEE"], activeRole: "ATTENDEE" };
}
