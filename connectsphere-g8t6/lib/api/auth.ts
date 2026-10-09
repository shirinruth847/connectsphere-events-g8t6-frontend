import { apiRequest } from "./client";
import type { AuthenticatedUser, SignupRequest, SignupResponse } from "./types";

// POST /api/auth/signup: public, so no bearer token. The body is rebuilt
// field by field so nothing beyond the four accepted fields is ever sent.
export function signUp({ accountType, name, email, password }: SignupRequest) {
  return apiRequest<SignupResponse>("/api/auth/signup", {
    method: "POST",
    auth: false,
    body: { accountType, name, email, password },
  });
}

// GET /api/auth/me: the backend's verdict on whether the session is valid,
// plus the trusted role and home_path.
export function fetchCurrentUser(options: { accessToken?: string; silentUnauthorized?: boolean } = {}) {
  return apiRequest<{ user: AuthenticatedUser }>("/api/auth/me", options).then((body) => body.user);
}

// POST /api/auth/logout: revokes this device's session only. Idempotent.
export function revokeCurrentSession(accessToken: string) {
  return apiRequest<void>("/api/auth/logout", { method: "POST", accessToken, silentUnauthorized: true });
}
