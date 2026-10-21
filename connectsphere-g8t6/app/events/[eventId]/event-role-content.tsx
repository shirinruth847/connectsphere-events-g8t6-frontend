"use client";

import { AttendeeEventPage } from "@/components/attendee/event-details/attendee-event-page";
import { useSessionUser } from "@/components/auth/auth-gate";
import { EventWorkspace } from "@/components/events/workspace/event-workspace";

// Role-aware /events/<id>, as /events is: attendees get the event details page
// (SPM-155); every other role keeps the SPM-33 event workspace unchanged.
export function EventRoleContent({ eventId }: { eventId: string }) {
  const user = useSessionUser();
  if (!user) return null;
  if (user.role === "ATTENDEE") return <AttendeeEventPage eventId={eventId} />;
  return <EventWorkspace eventId={eventId} />;
}
