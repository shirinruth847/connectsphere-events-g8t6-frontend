import { getAccessToken } from "@/lib/supabase";

const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);

interface ApiErrorBody {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  code: string;
  fields: Record<string, string>;
  status: number;

  constructor(message: string, status: number, code = "REQUEST_FAILED", fields = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const accessToken = await getAccessToken();
  if (!accessToken) {
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
    throw new ApiError(
      body.error || "The request could not be completed.",
      response.status,
      body.code,
      body.fields,
    );
  }

  return body as T;
};

export const getBackendBaseUrl = () => backendBaseUrl;
