import { getSupabaseBrowserClient, getAccessToken } from "@/lib/supabase";

function expireSession() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("connectsphere:session-expired"));
    void getSupabaseBrowserClient().auth.signOut({ scope: "local" });
  }
}

const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

interface ApiErrorBody {
  error?: string;
  message?: string;
  errors?: Record<string, string>;
  code?: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  code: string;
  fields: Record<string, string>;
  status: number;
  // The full error body, for responses that carry more than a message
  // (e.g. a 409 EVENT_VERSION_CONFLICT includes the current event).
  details: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code = "REQUEST_FAILED",
    fields: Record<string, string> = {},
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

export const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    expireSession();
    throw new ApiError("Your session has expired. Sign in again to continue.", 401, "UNAUTHENTICATED");
  }

  let response: Response;
  try {
    response = await fetch(`${backendBaseUrl}/api${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new ApiError(
      "ConnectSphere could not reach the backend. Check that the API is running and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T;
  if (!response.ok) {
    if (response.status === 401) expireSession();
    throw new ApiError(
      body.error || body.message || "The request could not be completed.",
      response.status,
      body.code,
      body.fields ?? body.errors,
      body as Record<string, unknown>,
    );
  }

  return body as T;
};

export const getBackendBaseUrl = () => backendBaseUrl;
