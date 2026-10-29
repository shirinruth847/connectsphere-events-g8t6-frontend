import type { KeyValueRow } from "@/components/shared/key-value-panel";
import type { EventView } from "@/lib/api/event-workspace";
import { formatDuration, formatEventWindow } from "@/lib/datetime";

// Read-only detail rows shared by the organiser and coordinator views, so both
// describe an event the same way.

export const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  title: "Title",
  purpose: "Purpose",
  description: "Description",
  startDatetime: "Start",
  endDatetime: "End",
  expectedAttendance: "Expected attendance",
  preferredLayoutType: "Layout",
  venuePreferences: "Venue preferences",
  equipmentRequirements: "Equipment",
  accessibilityNeeds: "Accessibility needs",
  isRegistrationEnabled: "Registration",
  registrationCapacity: "Registration capacity",
  suggestedVenue: "Suggested venue",
  venueBookings: "Venue bookings",
};

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

const humanise = (code: string) => code.charAt(0) + code.slice(1).toLowerCase().replaceAll("_", " ");

export const layoutLabel = (layout: string | null) =>
  !layout || layout === "NO_PREFERENCE" ? "No preference" : humanise(layout);

// The event API returns venue and equipment IDs only; names need the venue and
// equipment catalogues, which are not in SPM-33's scope.
export const venuePreferenceLabel = (venueIds: number[]) =>
  venueIds.length ? venueIds.map((id, index) => `${index + 1}. Venue #${id}`).join(", ") : "No preference";

export function scheduleRows(event: EventView): KeyValueRow[] {
  const duration = formatDuration(event.startDatetime, event.endDatetime);
  return [
    { icon: "calendar", label: "Date & time", value: formatEventWindow(event.startDatetime, event.endDatetime) },
    ...(duration ? [{ icon: "schedule" as const, label: "Duration", value: duration }] : []),
    {
      icon: "attendees",
      label: "Expected attendance",
      value: event.expectedAttendance ? `${event.expectedAttendance.toLocaleString()} people` : "Not provided",
    },
  ];
}

export function layoutRows(event: EventView): KeyValueRow[] {
  return [{ icon: "layout", label: "Layout", value: layoutLabel(event.preferredLayoutType) }];
}

export function venueRows(event: EventView): KeyValueRow[] {
  return [
    { icon: "venue", label: "Venue preferences", value: venuePreferenceLabel(event.venuePreferences) },
    ...layoutRows(event),
  ];
}

export function registrationRows(event: EventView): KeyValueRow[] {
  const capacity = event.registrationCapacity;
  return [
    {
      icon: "registration",
      label: "Registration",
      value: event.isRegistrationEnabled
        ? `Enabled${capacity ? ` · capacity ${capacity.toLocaleString()}` : ""}`
        : "Disabled",
    },
  ];
}

export function RequirementList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-on-surface-variant">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="rounded-control bg-surface-container-low px-3 py-2 text-sm text-on-surface">
          {item}
        </li>
      ))}
    </ul>
  );
}

export const equipmentItems = (event: EventView) =>
  event.equipmentRequirements.map((item) => `Equipment #${item.equipmentId} × ${item.quantity}`);
