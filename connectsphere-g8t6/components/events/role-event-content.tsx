"use client";

import { useSessionUser } from "@/components/auth/auth-gate";
import { EventRequestDetails } from "@/components/events/event-request-details";
import { EventWorkspace } from "@/components/events/workspace/event-workspace";

export function RoleEventContent({ id }: { id: string }) {
  const user = useSessionUser();
  return user?.role === "COORDINATOR_LEAD"
    ? <EventWorkspace eventId={id} />
    : user?.role === "ORGANISER" || user?.role === "COORDINATOR"
      ? <EventWorkspace eventId={id} />
      : <EventRequestDetails />;
}
