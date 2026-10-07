"use client";

import { ApiErrorState } from "@/components/ui/ApiErrorState";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { listMyRegistrations } from "@/lib/api/registrations";
import type { AttendeeEventStatus, AttendeeRegistration } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/useApiResource";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateRange, formatDateTime, humanizeCode } from "@/lib/format";

const STATUS_TONES: Record<AttendeeEventStatus, "success" | "neutral" | "danger" | "warning"> = {
  CONFIRMED: "success",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  PENDING_CONFIRMATION: "warning",
};

// Renders only the attendee-safe fields GET /api/registrations/mine returns.
export function RegistrationsView() {
  const { user } = useAuth();
  const { state, retry } = useApiResource(listMyRegistrations);
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My Registrations</h1>
        <p className="mt-1 text-sm text-ink-muted">Events you are registered for.</p>
      </div>

      {state.status === "loading" && <ListSkeleton label="Loading your registrations" />}
      {state.status === "error" && <ApiErrorState error={state.error} onRetry={retry} homePath={user.home_path} />}
      {state.status === "success" && state.data.registrations.length === 0 && (
        <EmptyState title="No registrations yet">Events you register for will appear here.</EmptyState>
      )}
      {state.status === "success" && state.data.registrations.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {state.data.registrations.map((registration) => (
              <li key={registration.registration_id}>
                <RegistrationCard registration={registration} />
              </li>
            ))}
          </ul>
          {state.data.page.next_offset !== null && (
            <p className="text-sm text-ink-muted">
              Showing your {state.data.registrations.length} most recent registrations.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RegistrationCard({ registration }: { registration: AttendeeRegistration }) {
  const { event } = registration;
  const registeredAt = formatDateTime(registration.registered_at);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-ink">{event.title}</h2>
        <StatusChip label={humanizeCode(event.attendee_status)} tone={STATUS_TONES[event.attendee_status] ?? "neutral"} />
      </div>
      <dl className="grid gap-1 text-sm text-ink-muted">
        <div>
          <dt className="sr-only">When</dt>
          <dd>{formatDateRange(event.start_datetime, event.end_datetime)}</dd>
        </div>
        <div>
          <dt className="sr-only">Venue</dt>
          <dd>
            {event.venue
              ? [event.venue.name, event.venue.address].filter(Boolean).join(", ")
              : "Venue to be confirmed"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Registration</dt>
          <dd>
            {humanizeCode(registration.registration_status)}
            {registeredAt && ` · Registered ${registeredAt}`}
          </dd>
        </div>
      </dl>
      {event.description && <p className="text-sm text-ink">{event.description}</p>}
    </Card>
  );
}
