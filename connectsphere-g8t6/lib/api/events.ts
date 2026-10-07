import { apiRequest } from "./client";
import type { OrganiserEventRequest, Page } from "./types";

// GET /api/events/mine (ORGANISER). The backend scopes results to the
// organiser's own requests and their organisations' submitted requests.
export function listMyEventRequests(signal?: AbortSignal) {
  return apiRequest<{ events: OrganiserEventRequest[]; page: Page }>("/api/events/mine", { signal });
}
