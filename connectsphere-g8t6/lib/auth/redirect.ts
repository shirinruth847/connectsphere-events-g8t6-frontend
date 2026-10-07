// next= handling for redirect-back after login. Only same-origin relative
// paths survive, so a crafted link cannot turn login into an open redirect.

import { canViewPath, type Role } from "@/lib/permissions/roles";

const PLACEHOLDER_ORIGIN = "http://connectsphere.invalid";
const LOGIN_PATH = "/login";

export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048) return null;
  // Rejects absolute and protocol-relative URLs ("//evil", "/\evil") and control characters.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (/[\u0000-\u001F\u007F\\]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  // Returning to /login after logging in would loop.
  if (url.pathname === LOGIN_PATH || url.pathname.startsWith(`${LOGIN_PATH}/`)) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginUrlFor(requestedPath?: string | null): string {
  const next = sanitizeNextPath(requestedPath);
  return next ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}` : LOGIN_PATH;
}

// A valid next= wins when the role can view it; otherwise the backend's home_path.
export function resolvePostLoginPath(next: string | null | undefined, user: { role: Role; home_path: string }): string {
  const safeNext = sanitizeNextPath(next);
  if (safeNext) {
    const pathname = new URL(safeNext, PLACEHOLDER_ORIGIN).pathname;
    if (canViewPath(user.role, pathname)) return safeNext;
  }
  return sanitizeNextPath(user.home_path) ?? "/";
}
