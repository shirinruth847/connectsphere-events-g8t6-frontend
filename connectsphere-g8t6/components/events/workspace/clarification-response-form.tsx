"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SectionHeading } from "@/components/shared/section-heading";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CLARIFICATION_TEXT_LIMIT,
  parseEventView,
  resubmitEvent,
  type ClarificationRound,
  type EventView,
} from "@/lib/api/event-workspace";
import { formatTimestamp } from "@/lib/datetime";
import {
  ACCESSIBILITY_OPTIONS,
  amendedFields,
  formValuesFromEvent,
  resubmissionProblem,
  validateEventStep,
  type EventFormValues,
  type EventRequest,
} from "@/lib/events";
import { equipmentItems, RequirementList } from "./event-detail-rows";

// Same limits as the SPM-33 editor and the request form; the backend's answer wins.
const TEXT_LIMITS = { title: 200, purpose: 2000, description: 5000 } as const;

type Banner = { tone: "error" | "warning"; title: string; message: string } | null;
type RequestOptions = { venues: Array<{ venueId: number; name: string }>; layouts: string[] };

// EventView carries the same request fields as EventRequest; only the status type is wider.
const valuesOf = (event: EventView): EventFormValues => formValuesFromEvent(event as unknown as EventRequest);

const SCHEDULE_FIELDS = ["startDatetime", "endDatetime", "expectedAttendance"] as const;

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-control border border-outline-variant/60 p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold text-on-surface">{title}</legend>
      {description ? <p className="-mt-2 text-xs text-on-surface-variant">{description}</p> : null}
      {children}
    </fieldset>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-xs font-semibold text-error"><Icon name="warning" size={16} className="mr-1 inline align-[-3px]" />{message}</p>
  ) : null;
}

interface ClarificationResponseFormProps {
  event: EventView;
  question: ClarificationRound | null;
  onResubmitted: (event: EventView) => void;
  // A newer version replaced the one on screen (version conflict).
  onEventReplaced: (event: EventView) => void;
  // The backend refused because the event is no longer waiting for this owner.
  onAccessChanged: () => void;
}

// SPM-41 AC3/TC4: the owner reads the coordinator's question, amends any
// submission field and resubmits in one action. Registration settings and the
// organisation are not amendable here. A resubmission needs a written response,
// at least one changed field, or both.
export function ClarificationResponseForm({ event, question, onResubmitted, onEventReplaced, onAccessChanged }: ClarificationResponseFormProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EventFormValues>(() => valuesOf(event));
  const [original, setOriginal] = useState<EventFormValues>(() => valuesOf(event));
  const [response, setResponse] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [sending, setSending] = useState(false);
  const [options, setOptions] = useState<RequestOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const pendingKey = useRef<{ key: string; body: string } | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const id = (field: string) => `event-${event.eventId}-resubmit-${field}`;

  useEffect(() => {
    if (wasOpen.current && !open) openButton.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || options) return;
    let alive = true;
    apiRequest<RequestOptions>("/events/request-options")
      .then((result) => { if (alive) setOptions(result); })
      .catch(() => { if (alive) setOptionsError("Venue choices could not be loaded. Your current venue preferences are kept unless you change them."); });
    return () => { alive = false; };
  }, [open, options]);

  const start = () => {
    const current = valuesOf(event);
    setValues(current);
    setOriginal(current);
    setResponse("");
    setFieldErrors({});
    setBanner(null);
    setOpen(true);
  };

  const cancel = () => {
    pendingKey.current = null;
    setFieldErrors({});
    setBanner(null);
    setOpen(false);
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
  const scheduleChanged = SCHEDULE_FIELDS.some((field) => field in changes);

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    // Every submission field stays required. The 48-hour lead time is checked only
    // when the schedule itself is amended; the backend has the final say.
    const errors: Record<string, string> = {
      ...validateEventStep(values, 0, true),
      ...validateEventStep(values, 1, scheduleChanged),
      ...validateEventStep(values, 2, true),
      ...validateEventStep(values, 3, true),
    };
    const problem = resubmissionProblem(response, changes, CLARIFICATION_TEXT_LIMIT);
    if (problem) errors.response = problem;
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setBanner({ tone: "error", title: "Check the highlighted fields", message: "Nothing was resubmitted." });
      return;
    }

    const payload = {
      ...(response.trim() ? { response } : {}),
      ...(Object.keys(changes).length ? { changes } : {}),
    };
    const body = JSON.stringify({ ...payload, version: event.version });
    const attempt = pendingKey.current?.body === body ? pendingKey.current : { key: crypto.randomUUID(), body };
    pendingKey.current = attempt;

    setSending(true);
    setBanner(null);
    try {
      const result = await resubmitEvent(event.eventId, payload, event.version, attempt.key);
      pendingKey.current = null;
      setOpen(false);
      onResubmitted(result.event);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSending(false);
    }
  };

  const handleError = (caught: unknown) => {
    if (!(caught instanceof ApiError)) {
      setBanner({ tone: "error", title: "Could not resubmit", message: "Something went wrong. Your changes are still here; try again." });
      return;
    }
    switch (caught.code) {
      case "VALIDATION_FAILED":
        setFieldErrors(caught.fields);
        setBanner({ tone: "error", title: "Check the highlighted fields", message: caught.message });
        return;
      case "FIELD_NOT_EDITABLE":
        setFieldErrors(caught.fields);
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
        setBanner({ tone: "warning", title: "This event changed while you were editing", message: "Nothing was resubmitted. Your changes and response are still here; check them against the latest details, then resubmit." });
        return;
      }
      case "TRANSITION_NOT_ALLOWED":
      case "EVENT_NOT_EDITABLE_IN_STATUS":
      case "EVENT_READ_ONLY":
      case "CLARIFICATION_NOT_OPEN":
        setBanner({ tone: "warning", title: "This request is no longer waiting for your response", message: "Nothing was resubmitted. Your text is still shown so you can copy it." });
        onAccessChanged();
        return;
      case "EVENT_NOT_FOUND":
        setBanner({ tone: "error", title: "Event no longer available", message: "You can no longer open this event. Nothing was resubmitted." });
        return;
      case "IDEMPOTENCY_IN_PROGRESS":
        setBanner({ tone: "warning", title: "Still resubmitting", message: "Your previous resubmission is still being processed. Wait a moment, then select Resubmit again." });
        return;
      case "IDEMPOTENCY_KEY_REUSED":
        pendingKey.current = null;
        setBanner({ tone: "error", title: "Could not resubmit", message: "This resubmission clashed with an earlier attempt. Resubmit again to retry." });
        return;
      case "UNAUTHENTICATED":
        setBanner({ tone: "error", title: "Your session has expired", message: "Sign in again in another tab, then resubmit. Your changes are still here." });
        return;
      case "NETWORK_ERROR":
        setBanner({ tone: "error", title: "Could not reach ConnectSphere", message: "Your changes are still here. Resubmit when you are back online; a repeated resubmission is applied only once." });
        return;
      default:
        setBanner({ tone: "error", title: "Could not resubmit", message: caught.message });
    }
  };

  const errorProps = (field: string) => ({
    "aria-invalid": fieldErrors[field] ? true : undefined,
    "aria-describedby": fieldErrors[field] ? `${id(field)}-error` : undefined,
  });

  const questionQuote = question ? (
    <blockquote className="rounded-control bg-primary-fixed/60 p-3 sm:p-4">
      <p className="text-xs font-semibold text-primary">
        {question.requestedBy.name ?? "Your coordinator"} asked on <time dateTime={question.requestedAt}>{formatTimestamp(question.requestedAt)}</time>
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-on-surface [overflow-wrap:anywhere]">&ldquo;{question.message}&rdquo;</p>
    </blockquote>
  ) : null;

  return (
    <section aria-labelledby={id("heading")} className="grid gap-4 rounded-panel border-t-4 border-t-tertiary bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading
        id={id("heading")}
        title="Your coordinator needs more information"
        description="Answer the question, amend the request if needed, then resubmit it to the same coordinator."
      />
      {questionQuote}

      {!open ? (
        <div>
          <Button ref={openButton} onClick={start}><Icon name="edit" size={16} />Respond and resubmit</Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4" aria-label="Respond and resubmit">
          {banner ? <AlertBanner tone={banner.tone} title={banner.title}>{banner.message}</AlertBanner> : null}

          <div>
            <FormLabel htmlFor={id("response")}>Your response</FormLabel>
            <textarea
              id={id("response")}
              rows={4}
              autoFocus
              value={response}
              onChange={(change) => {
                setResponse(change.target.value);
                clearError("response");
              }}
              placeholder="Answer the coordinator's question."
              className={`${fieldClasses} resize-y ${fieldErrors.response ? "border-error" : ""}`}
              aria-invalid={fieldErrors.response ? true : undefined}
              aria-describedby={`${id("response")}-count ${fieldErrors.response ? `${id("response")}-error` : ""}`.trim()}
            />
            <div className="mt-1 flex justify-between gap-3 text-xs">
              <span id={`${id("response")}-error`} className="font-semibold text-error">{fieldErrors.response ?? ""}</span>
              <span id={`${id("response")}-count`} className={`tabular-nums ${response.length > CLARIFICATION_TEXT_LIMIT ? "font-semibold text-error" : "text-on-surface-variant"}`}>
                {response.length.toLocaleString()} / {CLARIFICATION_TEXT_LIMIT.toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-xs text-on-surface-variant">Optional if you change the details below.</p>
          </div>

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

          <Group title="Venue & layout" description="Preferences do not reserve or hold a venue.">
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
          </Group>

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

          <Group title="Equipment">
            <RequirementList items={equipmentItems(event)} empty="No equipment was requested." />
            <p className="text-xs text-on-surface-variant">Equipment is kept as requested. Describe any equipment change in your response.</p>
          </Group>

          <p className="text-xs text-on-surface-variant">Registration settings cannot be changed while responding to a clarification request.</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={sending}>{sending ? "Resubmitting…" : "Resubmit"}</Button>
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
