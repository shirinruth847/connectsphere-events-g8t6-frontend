"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SectionHeading } from "@/components/shared/section-heading";
import { apiRequest, ApiError } from "@/lib/api";
import { parseEventView, saveAmendments, type EventView } from "@/lib/api/event-workspace";
import {
  ACCESSIBILITY_OPTIONS,
  amendedFields,
  formValuesFromEvent,
  localDateTimeToIso,
  validateEventStep,
  type EventFormValues,
  type EventRequest,
} from "@/lib/events";
import { layoutLabel } from "./event-detail-rows";
import { EquipmentRequirementsEditor } from "@/components/events/equipment/equipment-requirements-editor";
import { useEquipmentAvailability } from "@/components/events/equipment/use-equipment-availability";
import { equipmentAvailabilityErrors, withEquipmentNames } from "@/lib/technical-requests";

// Same limits as the SPM-33 editor and the request form; the backend's answer wins.
const TEXT_LIMITS = { title: 200, purpose: 2000, description: 5000 } as const;

type Banner = { tone: "error" | "warning"; title: string; message: string } | null;
type RequestOptions = {
  venues: Array<{ venueId: number; name: string }>;
  layouts: string[];
};

// EventView carries the same request fields as EventRequest; only the status type is wider.
const valuesOf = (event: EventView): EventFormValues => formValuesFromEvent(event as unknown as EventRequest);

const VENUE_FIELDS = ["venuePreferences", "preferredLayoutType"] as const;

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-control border border-outline-variant/60 p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold text-on-surface">{title}</legend>
      {description ? <p className="-mt-2 text-xs text-on-surface-variant">{description}</p> : null}
      {children}
    </fieldset>
  );
}

// A Group that starts collapsed behind a header button; the summary stands in for
// the fields while it is closed. The fields stay mounted, so nothing typed is lost.
function CollapsibleGroup({ id, title, summary, expanded, onToggle, children }: {
  id: string;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-control border border-outline-variant/60">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-3 text-left transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-on-surface">{title}</span>
          {expanded ? null : <span className="mt-0.5 block text-xs text-on-surface-variant [overflow-wrap:anywhere]">{summary}</span>}
        </span>
        <Icon name="chevron-down" size={20} className={`shrink-0 text-on-surface-variant transition-transform duration-150 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
      </button>
      <fieldset id={id} hidden={!expanded} className={expanded ? "grid gap-4 px-3 pb-3 sm:px-4 sm:pb-4" : "hidden"}>
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-xs font-semibold text-error"><Icon name="warning" size={16} className="mr-1 inline align-[-3px]" />{message}</p>
  ) : null;
}

interface ClarificationAmendmentFormProps {
  event: EventView;
  onSaved: (event: EventView, message: string) => void;
  // A newer version replaced the one on screen (version conflict).
  onEventReplaced: (event: EventView) => void;
  // The backend refused because the event is no longer waiting for this owner.
  onAccessChanged: () => void;
}

// SPM-41 v2 AC3/TC4: while a clarification thread is open the owner amends any
// submission field; the request stays with the coordinator, who marks the
// thread complete. Registration settings and the organisation are not
// amendable here. Saving needs at least one changed field.
export function ClarificationAmendmentForm({ event, onSaved, onEventReplaced, onAccessChanged }: ClarificationAmendmentFormProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EventFormValues>(() => valuesOf(event));
  const [original, setOriginal] = useState<EventFormValues>(() => valuesOf(event));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [sending, setSending] = useState(false);
  const [options, setOptions] = useState<RequestOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [venueExpanded, setVenueExpanded] = useState(false);
  const pendingKey = useRef<{ key: string; body: string } | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const id = (field: string) => `event-${event.eventId}-amend-${field}`;
  // SPM-286 AC3: quantities free for the amended dates, loaded while the form is open.
  const availability = useEquipmentAvailability(localDateTimeToIso(values.startDatetime), localDateTimeToIso(values.endDatetime), open);

  useEffect(() => {
    if (wasOpen.current && !open) openButton.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || options) return;
    let alive = true;
    apiRequest<RequestOptions>("/events/request-options")
      .then((result) => { if (alive) { setOptions(result); setOptionsError(""); } })
      .catch(() => { if (alive) setOptionsError("Venue choices could not be loaded. Your current venue choices are kept unless you change them."); });
    return () => { alive = false; };
  }, [open, options]);

  const start = () => {
    const current = valuesOf(event);
    setValues(current);
    setOriginal(current);
    setFieldErrors({});
    setBanner(null);
    setVenueExpanded(false);
    setOpen(true);
  };

  const cancel = () => {
    pendingKey.current = null;
    setFieldErrors({});
    setBanner(null);
    setOpen(false);
  };

  // A collapsed section opens when one of its fields needs attention.
  const showErrors = (errors: Record<string, string>) => {
    setFieldErrors(errors);
    if (VENUE_FIELDS.some((field) => errors[field])) setVenueExpanded(true);
  };

  const clearError = (field: string) => {
    if (!fieldErrors[field]) return;
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[field];
      return next;
    });
  };

  const update = <K extends keyof EventFormValues>(field: K, value: EventFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    clearError(field);
  };

  const changes = amendedFields(original, values);

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    // Submission fields stay required; only a changed start needs a new lead time.
    const errors: Record<string, string> = {
      ...validateEventStep(values, 0, true),
      ...validateEventStep(values, 1, true, undefined, "startDatetime" in changes),
      ...validateEventStep(values, 2, true),
      ...validateEventStep(values, 3, true),
      ...validateEventStep(values, 4, true),
      ...(availability.state.status === "ready" ? equipmentAvailabilityErrors(values.equipmentRequirements, availability.state.data) : {}),
    };
    showErrors(errors);
    if (Object.keys(errors).length) {
      setBanner({ tone: "error", title: "Check the highlighted fields", message: "Nothing was saved." });
      return;
    }
    if (Object.keys(changes).length === 0) {
      setBanner({ tone: "error", title: "Nothing to save", message: "Change at least one detail before saving." });
      return;
    }

    const body = JSON.stringify({ changes, version: event.version });
    const attempt = pendingKey.current?.body === body ? pendingKey.current : { key: crypto.randomUUID(), body };
    pendingKey.current = attempt;

    setSending(true);
    setBanner(null);
    try {
      const result = await saveAmendments(event.eventId, changes, event.version, attempt.key);
      pendingKey.current = null;
      setOpen(false);
      // The response leaves equipment names null; name the lines from the options chosen from.
      const options = availability.state.data?.equipment ?? [];
      onSaved({ ...result.event, equipmentRequirements: withEquipmentNames(result.event.equipmentRequirements ?? [], options, event.equipmentRequirements) }, result.message);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSending(false);
    }
  };

  const handleError = (caught: unknown) => {
    if (!(caught instanceof ApiError)) {
      setBanner({ tone: "error", title: "Could not save", message: "Something went wrong. Your changes are still here; try again." });
      return;
    }
    switch (caught.code) {
      case "VALIDATION_FAILED":
        showErrors(caught.fields);
        setBanner({ tone: "error", title: "Check the highlighted fields", message: caught.fields.changes ?? caught.message });
        return;
      case "FIELD_NOT_EDITABLE":
        showErrors(caught.fields);
        setBanner({ tone: "error", title: "Some fields can no longer be changed", message: caught.message });
        onAccessChanged();
        return;
      case "EVENT_VERSION_CONFLICT": {
        pendingKey.current = null;
        const latest = parseEventView(caught.details.event);
        if (latest) {
          // Keep what the owner typed, and compare it with the latest saved details from now on.
          setOriginal(valuesOf(latest));
          onEventReplaced(latest);
        }
        setBanner({ tone: "warning", title: "This event changed while you were editing", message: "Nothing was saved. Your changes are still here; check them against the latest details, then save again." });
        return;
      }
      case "TRANSITION_NOT_ALLOWED":
      case "EVENT_NOT_EDITABLE_IN_STATUS":
      case "EVENT_READ_ONLY":
      case "CLARIFICATION_NOT_OPEN":
        setBanner({ tone: "warning", title: "This request is no longer open for amendments", message: "Nothing was saved. Your coordinator may have marked the clarification complete. Your changes are still shown so you can copy them." });
        onAccessChanged();
        return;
      case "COORDINATOR_CONFLICT":
        setBanner({ tone: "error", title: "These dates are not available", message: caught.message });
        return;
      case "EVENT_NOT_FOUND":
        setBanner({ tone: "error", title: "Event no longer available", message: "You can no longer open this event. Nothing was saved." });
        return;
      case "IDEMPOTENCY_IN_PROGRESS":
        setBanner({ tone: "warning", title: "Still saving", message: "Your previous save is still being processed. Wait a moment, then select Save amendments again." });
        return;
      case "IDEMPOTENCY_KEY_REUSED":
        pendingKey.current = null;
        setBanner({ tone: "error", title: "Could not save", message: "This save clashed with an earlier attempt. Save again to retry." });
        return;
      case "UNAUTHENTICATED":
        setBanner({ tone: "error", title: "Your session has expired", message: "Sign in again in another tab, then save. Your changes are still here." });
        return;
      case "NETWORK_ERROR":
        setBanner({ tone: "error", title: "Could not reach ConnectSphere", message: "Your changes are still here. Save when you are back online; a repeated save is applied only once." });
        return;
      default:
        setBanner({ tone: "error", title: "Could not save", message: caught.message });
    }
  };

  const venueName = (venueId: number) => options?.venues.find((venue) => venue.venueId === venueId)?.name ?? `Venue #${venueId}`;
  const venueSummary = [
    values.venuePreferences.length
      ? values.venuePreferences.map((venueId, index) => `${index + 1}. ${venueName(venueId)}`).join(", ")
      : "No venue preference",
    `Layout: ${layoutLabel(values.preferredLayoutType)}`,
  ].join(" · ");

  const errorProps = (field: string) => ({
    "aria-invalid": fieldErrors[field] ? true : undefined,
    "aria-describedby": fieldErrors[field] ? `${id(field)}-error` : undefined,
  });

  return (
    <section aria-labelledby={id("heading")} className="grid gap-4 rounded-panel border-t-4 border-t-tertiary bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading
        id={id("heading")}
        title="Amend your request"
        description="Change any details your coordinator asked about. The request stays with your coordinator, who marks the clarification complete when they have what they need."
      />

      {!open ? (
        <div>
          <Button ref={openButton} onClick={start}><Icon name="edit" size={16} />Amend request</Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4" aria-label="Amend request">
          {banner ? <AlertBanner tone={banner.tone} title={banner.title}>{banner.message}</AlertBanner> : null}

          <Group title="Event identity & purpose">
            {(["title", "purpose", "description"] as const).map((field) => (
              <div key={field}>
                <FormLabel htmlFor={id(field)} required>{field === "title" ? "Title" : field === "purpose" ? "Purpose" : "Description"}</FormLabel>
                {field === "title" ? (
                  <input id={id(field)} type="text" value={values[field]} onChange={(change) => update(field, change.target.value)} className={`${fieldClasses} ${fieldErrors[field] ? "border-error" : ""}`} {...errorProps(field)} />
                ) : (
                  <textarea id={id(field)} rows={field === "purpose" ? 3 : 5} value={values[field]} onChange={(change) => update(field, change.target.value)} className={`${fieldClasses} resize-y ${fieldErrors[field] ? "border-error" : ""}`} {...errorProps(field)} />
                )}
                <div className="mt-1 flex justify-between gap-3 text-xs">
                  <FieldError id={`${id(field)}-error`} message={fieldErrors[field]} />
                  <span className={`ml-auto tabular-nums ${values[field].length > TEXT_LIMITS[field] ? "font-semibold text-error" : "text-on-surface-variant"}`}>
                    {values[field].length.toLocaleString()} / {TEXT_LIMITS[field].toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </Group>

          <Group title="Schedule & attendance" description="A new date must still be at least 48 hours away.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FormLabel htmlFor={id("startDatetime")} required>Start</FormLabel>
                <input id={id("startDatetime")} type="datetime-local" value={values.startDatetime} onChange={(change) => update("startDatetime", change.target.value)} className={fieldClasses} {...errorProps("startDatetime")} />
                <FieldError id={`${id("startDatetime")}-error`} message={fieldErrors.startDatetime} />
              </div>
              <div>
                <FormLabel htmlFor={id("endDatetime")} required>End</FormLabel>
                <input id={id("endDatetime")} type="datetime-local" value={values.endDatetime} onChange={(change) => update("endDatetime", change.target.value)} className={fieldClasses} {...errorProps("endDatetime")} />
                <FieldError id={`${id("endDatetime")}-error`} message={fieldErrors.endDatetime} />
              </div>
              <div>
                <FormLabel htmlFor={id("expectedAttendance")} required>Expected attendance</FormLabel>
                <input id={id("expectedAttendance")} type="number" min="1" step="1" value={values.expectedAttendance} onChange={(change) => update("expectedAttendance", change.target.value)} className={fieldClasses} {...errorProps("expectedAttendance")} />
                <FieldError id={`${id("expectedAttendance")}-error`} message={fieldErrors.expectedAttendance} />
              </div>
            </div>
          </Group>

          <CollapsibleGroup
            id={id("venue-layout")}
            title="Venue & layout"
            summary={venueSummary}
            expanded={venueExpanded}
            onToggle={() => setVenueExpanded((value) => !value)}
          >
            <p className="text-xs text-on-surface-variant">Preferences do not reserve or hold a venue.</p>
            {optionsError ? <AlertBanner tone="warning">{optionsError}</AlertBanner> : null}
            {options?.venues.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.venues.map((venue) => {
                  const rank = values.venuePreferences.indexOf(venue.venueId);
                  return (
                    <label key={venue.venueId} className="flex min-h-11 items-center gap-3 rounded-control border border-outline-variant p-3 text-sm text-on-surface">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={rank >= 0}
                        disabled={rank < 0 && values.venuePreferences.length >= 20}
                        onChange={(change) => update("venuePreferences", change.target.checked ? [...values.venuePreferences, venue.venueId] : values.venuePreferences.filter((venueId) => venueId !== venue.venueId))}
                      />
                      <span className="min-w-0 flex-1">{venue.name}</span>
                      {rank >= 0 ? <span className="text-xs font-semibold text-primary">Preference {rank + 1}</span> : null}
                    </label>
                  );
                })}
              </div>
            ) : !optionsError ? (
              <p className="text-sm text-on-surface-variant">{options ? "No venues are currently listed." : "Loading venue choices…"}</p>
            ) : null}
            <FieldError id={`${id("venuePreferences")}-error`} message={fieldErrors.venuePreferences} />
            <div>
              <FormLabel htmlFor={id("preferredLayoutType")} required>Preferred layout</FormLabel>
              <select id={id("preferredLayoutType")} value={values.preferredLayoutType} onChange={(change) => update("preferredLayoutType", change.target.value)} className={fieldClasses} {...errorProps("preferredLayoutType")}>
                {[...new Set([...(options?.layouts ?? ["NO_PREFERENCE"]), values.preferredLayoutType])].map((layout) => (
                  <option key={layout} value={layout}>{layout === "NO_PREFERENCE" ? "No preference" : layout.replaceAll("_", " ")}</option>
                ))}
              </select>
              <FieldError id={`${id("preferredLayoutType")}-error`} message={fieldErrors.preferredLayoutType} />
            </div>
          </CollapsibleGroup>

          <Group title="Accessibility">
            <div className="grid gap-2 sm:grid-cols-2">
              {ACCESSIBILITY_OPTIONS.map((option) => (
                <label key={option} className="flex min-h-11 items-start gap-3 rounded-control border border-outline-variant p-3 text-sm text-on-surface">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={values.accessibilityNeeds.includes(option)}
                    onChange={(change) => update("accessibilityNeeds", change.target.checked ? [...values.accessibilityNeeds, option] : values.accessibilityNeeds.filter((need) => need !== option))}
                  />
                  {option}
                </label>
              ))}
            </div>
            <div>
              <FormLabel htmlFor={id("accessibilityNotes")}>Other accessibility notes</FormLabel>
              <textarea id={id("accessibilityNotes")} rows={3} value={values.accessibilityNotes} onChange={(change) => update("accessibilityNotes", change.target.value)} className={`${fieldClasses} resize-y`} {...errorProps("accessibilityNotes")} />
              <FieldError id={`${id("accessibilityNotes")}-error`} message={fieldErrors.accessibilityNotes ?? fieldErrors.accessibilityNeeds} />
              <p className="mt-1 text-xs text-on-surface-variant">One note per line, up to 200 characters each.</p>
            </div>
          </Group>

          <Group title="Technical support needs">
            <FormLabel htmlFor={id("technicalSupportNeeds")}>Technical support needs</FormLabel>
            <textarea id={id("technicalSupportNeeds")} maxLength={2000} rows={4} value={values.technicalSupportNeeds} onChange={(change) => update("technicalSupportNeeds", change.target.value)} className={`${fieldClasses} resize-y`} {...errorProps("technicalSupportNeeds")} />
            <FieldError id={`${id("technicalSupportNeeds")}-error`} message={fieldErrors.technicalSupportNeeds} />
            <p className="text-xs text-on-surface-variant">Describe the support you need, up to 2,000 characters.</p>
          </Group>

          <Group title="Equipment">
            <p className="text-xs text-on-surface-variant">Amend the equipment you need. Availability is for the dates above; these choices do not reserve equipment.</p>
            <EquipmentRequirementsEditor
              idPrefix={id("equipment")}
              lines={values.equipmentRequirements}
              onChange={(lines) => update("equipmentRequirements", lines)}
              availability={availability.state}
              onRetry={availability.retry}
              error={fieldErrors.equipmentRequirements}
            />
          </Group>

          <p className="text-xs text-on-surface-variant">Registration settings cannot be changed while responding to a clarification request.</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={sending}>{sending ? "Saving…" : "Save amendments"}</Button>
            <Button type="button" variant="quiet" onClick={cancel} disabled={sending}>Cancel</Button>
            <span className="text-xs text-on-surface-variant" aria-live="polite">
              {Object.keys(changes).length ? `${Object.keys(changes).length} ${Object.keys(changes).length === 1 ? "detail" : "details"} changed` : "No details changed yet"}
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
