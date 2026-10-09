"use client";

import { ApiErrorState } from "@/components/ui/ApiErrorState";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { listMyEventRequests } from "@/lib/api/events";
import type { OrganiserEventRequest } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/useApiResource";
import { formatDateRange, humanizeCode } from "@/lib/format";
import type { DashboardProps } from "./DashboardView";

// Display tone only; lifecycle meaning stays with the backend.
const statusTone = (status: string) => {
  if (status === "DRAFT") return "neutral";
  if (status === "CANCELLED" || status === "REJECTED") return "danger";
  if (status === "CONFIRMED" || status === "COMPLETED") return "success";
  return "info";
};

export function OrganiserDashboard({ user }: DashboardProps) {
  const { state, retry } = useApiResource(listMyEventRequests);

  return (
    <section aria-labelledby="event-requests-heading" className="flex flex-col gap-4">
      <h2 id="event-requests-heading" className="text-lg font-semibold text-ink">
        Event requests
      </h2>

      {state.status === "loading" && <ListSkeleton label="Loading event requests" />}
      {state.status === "error" && <ApiErrorState error={state.error} onRetry={retry} homePath={user.home_path} />}
      {state.status === "success" && state.data.events.length === 0 && (
        <EmptyState title="No event requests yet">
          Event requests you create, and submitted requests from your organisation, will appear here.
        </EmptyState>
      )}
      {state.status === "success" && state.data.events.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {state.data.events.map((event) => (
              <li key={event.event_id}>
                <EventRequestCard event={event} />
              </li>
            ))}
          </ul>
          {state.data.page.next_offset !== null && (
            <p className="text-sm text-ink-muted">Showing the {state.data.events.length} most recent requests.</p>
          )}
        </>
      )}
    </section>
  );
}

function EventRequestCard({ event }: { event: OrganiserEventRequest }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-ink">{event.title || "Untitled event request"}</h3>
        <div className="flex flex-wrap gap-2">
          {event.is_owner && <StatusChip label="Yours" />}
          <StatusChip label={humanizeCode(event.status)} tone={statusTone(event.status)} />
        </div>
      </div>
      <dl className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
        <div>
          <dt className="sr-only">When</dt>
          <dd>{formatDateRange(event.start_datetime, event.end_datetime)}</dd>
        </div>
        {event.organisation && (
          <div>
            <dt className="sr-only">Organisation</dt>
            <dd>{event.organisation.name}</dd>
          </div>
        )}
        {event.expected_attendance !== null && (
          <div>
            <dt className="sr-only">Expected attendance</dt>
            <dd>{event.expected_attendance} expected attendees</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
