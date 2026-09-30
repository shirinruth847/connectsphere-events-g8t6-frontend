import type { Metadata } from "next";
import { getAttendeeEvents } from "@/lib/api/events";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventDiscovery } from "./_components/EventDiscovery";

export const metadata: Metadata = { title: "Event Discovery" };

// Attendee scope of /events. Other roles' event lists arrive with their own tickets.
export default async function EventDiscoveryPage() {
  const events = await getAttendeeEvents();

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-5 px-4 pt-5 pb-12 md:px-6">
      <PageHeader
        eyebrow="Attendee Experience Portal"
        eyebrowTone="tertiary"
        title="Event Discovery"
        description="Browse confirmed events, check seat availability, and register or join the waiting list when places run out."
      />
      <EventDiscovery events={events} />
    </div>
  );
}
