// The single browser-to-backend client (Master section 2.6). Every Express
// call goes through apiRequest so token attachment and error handling stay
// in one place.

import { getAccessToken } from "@/lib/auth/session";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "CONFIG_ERROR"
  | "SERVER_ERROR"
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// The auth provider registers this so a 401 from any business endpoint
// ends the stale browser session instead of leaving the user on a dead page.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

type RequestOptions = {
  method?: "GET" | "POST";
  // Sends the current Supabase access token as a Bearer token.
  auth?: boolean;
  // Explicit token, used straight after sign-in before the session is read back.
  accessToken?: string;
  // Suppresses the global 401 handler (used while signing in or out).
  silentUnauthorized?: boolean;
  signal?: AbortSignal;
};

const codeForStatus = (status: number): ApiErrorCode => {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 400) return "VALIDATION_FAILED";
  if (status === 429) return "RATE_LIMITED";
  return "SERVER_ERROR";
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", auth = true, accessToken, silentUnauthorized = false, signal } = options;

  if (!BACKEND_URL) {
    throw new ApiError(0, "CONFIG_ERROR", "The application is not configured to reach the server.");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) {
    const token = accessToken ?? (await getAccessToken());
    if (!token) {
      if (!silentUnauthorized) unauthorizedHandler?.();
      throw new ApiError(401, "UNAUTHENTICATED", "Please log in to continue.");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    // Private data must never come from the HTTP cache after logout.
    response = await fetch(`${BACKEND_URL}${path}`, { method, headers, cache: "no-store", signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "We couldn't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code: ApiErrorCode = body?.code ?? codeForStatus(response.status);
    const message: string =
      typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.";
    if (response.status === 401 && !silentUnauthorized) unauthorizedHandler?.();
    throw new ApiError(response.status, code, message, body?.fields);
  }

  return body as T;
}
