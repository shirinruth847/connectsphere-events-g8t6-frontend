// Links between the event details dialog and the full attendee event page
// (SPM-155). Kept free of runtime imports so the unit tests can load it.

export type EventDetailsOrigin = "discovery" | "my-events";

const BACK_LINKS: Record<EventDetailsOrigin, { href: string; label: string }> = {
  discovery: { href: "/events", label: "Back to Event Discovery" },
  "my-events": { href: "/my-registrations", label: "Back to My Events" },
};

// The full page for one event, remembering where the dialog was opened.
export function eventDetailsHref(eventId: number, from: EventDetailsOrigin) {
  return `/events/${eventId}?from=${from}`;
}

// Only the two known origins are accepted, so the link can never lead
// elsewhere; a direct visit or login return goes back to My Events.
export function eventBackLink(from: string | null | undefined) {
  return from === "discovery" || from === "my-events" ? BACK_LINKS[from] : BACK_LINKS["my-events"];
}
