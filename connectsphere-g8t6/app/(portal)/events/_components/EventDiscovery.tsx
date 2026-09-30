"use client";

import { useState } from "react";
import type { AttendeeEvent, RegistrationAvailability } from "@/lib/api/types";
import { toDisplayDay } from "@/lib/format";
import { getStatusPresentation } from "@/lib/status";
import { DateRangeField, type DateRange } from "@/components/forms/DateRangeField";
import { FilterPills, type FilterPillOption } from "@/components/forms/FilterPills";
import { SearchField } from "@/components/forms/SearchField";
import { SelectField } from "@/components/forms/SelectField";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/shared/Button";
import { DiscoveryEventCard } from "./DiscoveryEventCard";
import { EventDetailsModal } from "./EventDetailsModal";

type AvailabilityFilter = "ALL" | RegistrationAvailability;

const AVAILABILITY_FILTERS: Array<{ value: RegistrationAvailability; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "FULL", label: "Waitlist" },
  { value: "NOT_YET_OPEN", label: "Opening Soon" },
  { value: "CLOSED", label: "Closed" },
  { value: "NOT_ENABLED", label: "View Only" },
];

const ALL_VENUES = "all";
const NO_DATES: DateRange = { from: "", to: "" };

/**
 * Filters narrow the list the backend already scoped to confirmed, published events.
 * They are presentation only; nothing here decides what an attendee may see.
 */
export function EventDiscovery({ events }: { events: AttendeeEvent[] }) {
  const [query, setQuery] = useState("");
  const [dates, setDates] = useState<DateRange>(NO_DATES);
  const [venueId, setVenueId] = useState(ALL_VENUES);
  const [availability, setAvailability] = useState<AvailabilityFilter>("ALL");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const venueOptions = [
    { value: ALL_VENUES, label: "All Venues" },
    ...Array.from(
      new Map(
        events.flatMap((event) => (event.venue ? [[event.venue.venue_id, event.venue.name] as const] : [])),
      ),
      ([value, label]) => ({ value, label }),
    ).sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const search = query.trim().toLowerCase();
  const matchingFilters = events.filter((event) => {
    const day = toDisplayDay(event.start_datetime);
    return (
      (!search ||
        [event.title, event.description, event.venue?.name, event.venue?.address].some((text) =>
          text?.toLowerCase().includes(search),
        )) &&
      (venueId === ALL_VENUES || event.venue?.venue_id === venueId) &&
      (!dates.from || day >= dates.from) &&
      (!dates.to || day <= dates.to)
    );
  });
  const visibleEvents =
    availability === "ALL"
      ? matchingFilters
      : matchingFilters.filter((event) => event.registration.availability === availability);

  const pillOptions: FilterPillOption<AvailabilityFilter>[] = [
    { value: "ALL", label: "All Events", count: matchingFilters.length },
    ...AVAILABILITY_FILTERS.map((option) => ({
      ...option,
      tone: getStatusPresentation("registrationAvailability", option.value).tone,
      count: matchingFilters.filter((event) => event.registration.availability === option.value).length,
    })),
  ];

  const clearFilters = () => {
    setQuery("");
    setDates(NO_DATES);
    setVenueId(ALL_VENUES);
    setAvailability("ALL");
  };

  const openDetails = (eventId: string) => {
    setDetailsId(eventId);
    setDetailsOpen(true);
  };
  // Keep the last event mounted while closed so the dialog can restore focus to its opener.
  const detailsEvent = events.find((event) => event.event_id === detailsId) ?? null;

  if (events.length === 0) {
    return (
      <EmptyState
        icon="calendar-today"
        title="No events to discover yet"
        description="Events appear here once they are confirmed and published. Check back soon."
      />
    );
  }

  return (
    <>
      <section
        aria-label="Search and filter events"
        className="flex flex-col gap-3 rounded-card bg-surface-container-lowest p-3 shadow-elevation-1"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
          <SearchField
            label="Search events"
            hideLabel
            placeholder="Search by event, topic or venue"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="md:col-span-2 lg:col-span-6"
          />
          <DateRangeField
            label="Event dates"
            hideLabel
            value={dates}
            onChange={setDates}
            className="lg:col-span-4"
          />
          <SelectField
            label="Venue"
            hideLabel
            options={venueOptions}
            value={venueId}
            onChange={(event) => setVenueId(event.target.value)}
            className="lg:col-span-2"
          />
        </div>
        <div className="flex flex-col gap-2 pt-1 lg:flex-row lg:items-center lg:justify-between">
          <FilterPills
            label="Registration"
            options={pillOptions}
            value={availability}
            onChange={setAvailability}
          />
          <p aria-live="polite" className="text-label font-bold text-on-surface-variant">
            Showing {visibleEvents.length} of {events.length} events
          </p>
        </div>
      </section>

      {visibleEvents.length > 0 ? (
        <div className="flex flex-col gap-5 pt-3">
          {visibleEvents.map((event, index) => (
            <DiscoveryEventCard
              key={event.event_id}
              event={event}
              onOpenDetails={openDetails}
              preloadImage={index < 2}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-3"
          title="No events match your filters"
          description="Try a different search term, widen the date range or choose another venue."
          action={
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear all filters
            </Button>
          }
        />
      )}

      <EventDetailsModal event={detailsEvent} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </>
  );
}
