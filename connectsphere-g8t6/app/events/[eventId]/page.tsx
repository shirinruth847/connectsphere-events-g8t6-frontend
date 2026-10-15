import type { Metadata } from "next";
import { EventWorkspace } from "@/components/events/workspace/event-workspace";

export const metadata: Metadata = { title: "Event workspace | ConnectSphere" };

export default async function EventWorkspacePage({ params }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  return <EventWorkspace eventId={eventId} />;
}
