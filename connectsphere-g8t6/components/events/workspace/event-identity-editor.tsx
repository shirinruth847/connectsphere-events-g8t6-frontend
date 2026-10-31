"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import {
  IDENTITY_FIELDS,
  parseEventView,
  saveEventDetails,
  type EventView,
  type IdentityChanges,
  type IdentityField,
} from "@/lib/api/event-workspace";
import { editableIdentityFields } from "@/lib/permissions/event-workspace";
import { fieldLabel } from "./event-detail-rows";
import { VersionConflictDialog } from "./version-conflict-dialog";

// Client-side limits mirror the backend validator; the backend's answer wins.
const LIMITS: Record<IdentityField, number> = { title: 200, purpose: 2000, description: 5000 };

type Values = Record<IdentityField, string>;
type Banner = { tone: "error" | "warning"; title: string; message: string } | null;

const valuesOf = (event: EventView): Values => ({
  title: event.title ?? "",
  purpose: event.purpose ?? "",
  description: event.description ?? "",
});

interface EventIdentityEditorProps {
  event: EventView;
  onSaved: (event: EventView, message: string) => void;
  // A newer version replaced the one on screen (version conflict resolution).
  onEventReplaced: (event: EventView) => void;
  // The backend refused because access changed; re-read the event's permissions.
  onAccessChanged: () => void;
  onEditingChange?: (editing: boolean) => void;
}

function validate(changes: IdentityChanges) {
  const errors: Record<string, string> = {};
  for (const field of Object.keys(changes) as IdentityField[]) {
    const value = changes[field] ?? "";
    if (!value.trim()) errors[field] = field === "title" ? "Enter a title." : `Enter a ${field}.`;
    else if (value.length > LIMITS[field]) errors[field] = `Use ${LIMITS[field].toLocaleString()} characters or fewer.`;
  }
  return errors;
}

// Section 1 of the coordinator review: title, purpose and description, editable
// in place when the backend lists them in permissions.editableFields.
export function EventIdentityEditor({ event, onSaved, onEventReplaced, onAccessChanged, onEditingChange }: EventIdentityEditorProps) {
  const editable = editableIdentityFields(event.permissions);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Values>(() => valuesOf(event));
  const [original, setOriginal] = useState<Values>(() => valuesOf(event));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<EventView | null>(null);
  // One key per distinct save; a retry of the same save reuses it so it cannot apply twice.
  const pendingKey = useRef<{ key: string; body: string } | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Return focus to the Edit button when the form closes.
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const startEditing = () => {
    setDraft(valuesOf(event));
    setOriginal(valuesOf(event));
    setFieldErrors({});
    setBanner(null);
    setEditing(true);
    onEditingChange?.(true);
  };

  const cancel = () => {
    pendingKey.current = null;
    setFieldErrors({});
    setBanner(null);
    setEditing(false);
    onEditingChange?.(false);
  };

  const changes: IdentityChanges = Object.fromEntries(
    editable.filter((field) => draft[field] !== (event[field] ?? "")).map((field) => [field, draft[field]]),
  );
  const hasChanges = Object.keys(changes).length > 0;

  const save = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (saving || !hasChanges) return;
    const errors = validate(changes);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setBanner({ tone: "error", title: "Check the highlighted fields", message: "Nothing was saved." });
      return;
    }
    const body = JSON.stringify({ changes, version: event.version });
    const attempt = pendingKey.current?.body === body ? pendingKey.current : { key: crypto.randomUUID(), body };
    pendingKey.current = attempt;

    setSaving(true);
    setBanner(null);
    try {
      const result = await saveEventDetails(event.eventId, changes, event.version, attempt.key);
      pendingKey.current = null;
      setEditing(false);
      onEditingChange?.(false);
      onSaved(result.event, result.message);
    } catch (caught) {
      handleSaveError(caught);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveError = (caught: unknown) => {
    if (!(caught instanceof ApiError)) {
      setBanner({ tone: "error", title: "Could not save", message: "Something went wrong. Your edits are still here; try again." });
      return;
    }
    switch (caught.code) {
      case "VALIDATION_FAILED":
        setFieldErrors(caught.fields);
        setBanner({ tone: "error", title: "Check the highlighted fields", message: caught.message });
        return;
      case "EVENT_VERSION_CONFLICT": {
        pendingKey.current = null;
        const latest = parseEventView(caught.details.event);
        if (latest) setConflict(latest);
        else setBanner({ tone: "error", title: "This event changed", message: caught.message });
        return;
      }
      case "FIELD_NOT_EDITABLE":
        setFieldErrors(caught.fields);
        setBanner({ tone: "error", title: "Some fields can no longer be changed", message: caught.message });
        onAccessChanged();
        return;
      case "EVENT_NOT_EDITABLE_IN_STATUS":
      case "EDIT_REQUIRES_CHANGE_REQUEST":
      case "EVENT_READ_ONLY":
        setBanner({ tone: "warning", title: "Editing is no longer available", message: `${caught.message} Your unsaved text is still shown so you can copy it.` });
        onAccessChanged();
        return;
      case "EVENT_NOT_FOUND":
        setBanner({ tone: "error", title: "Event no longer available", message: "You can no longer open this event. It may have been reassigned to another coordinator. Nothing was saved." });
        return;
      case "IDEMPOTENCY_IN_PROGRESS":
        // The first attempt is still being processed; keep the key so saving again cannot apply twice.
        setBanner({ tone: "warning", title: "Still saving", message: "Your previous save is still being processed. Wait a moment, then select Save changes again." });
        return;
      case "IDEMPOTENCY_KEY_REUSED":
        pendingKey.current = null;
        setBanner({ tone: "error", title: "Could not save", message: "This save clashed with an earlier attempt. Save again to retry." });
        return;
      case "UNAUTHENTICATED":
        setBanner({ tone: "error", title: "Your session has expired", message: "Sign in again in another tab, then save. Your edits are still here." });
        return;
      case "NETWORK_ERROR":
        setBanner({ tone: "error", title: "Could not reach ConnectSphere", message: "Your edits are still here. Save again when you are back online; a repeated save is applied only once." });
        return;
      default:
        setBanner({ tone: "error", title: "Could not save", message: caught.message });
    }
  };

  const keepMine = () => {
    if (!conflict) return;
    // Continue from the latest version: fields the user edited keep their typed
    // value, every other field takes the latest saved value so it is not reverted.
    const latest = valuesOf(conflict);
    setDraft((current) => {
      const next = { ...latest };
      for (const field of IDENTITY_FIELDS) if (current[field] !== original[field]) next[field] = current[field];
      return next;
    });
    setOriginal(latest);
    onEventReplaced(conflict);
    setConflict(null);
    setBanner({ tone: "warning", title: "Review before saving", message: "Your edits now apply to the latest version. Check them, then save again." });
  };

  const discardMine = () => {
    if (!conflict) return;
    onEventReplaced(conflict);
    setConflict(null);
    cancel();
  };

  if (!editing) {
    return (
      <div className="grid gap-4">
        <dl className="grid gap-4">
          {IDENTITY_FIELDS.map((field) => (
            <div key={field} className="rounded-control bg-surface-container-low p-3 sm:p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">{fieldLabel(field)}</dt>
              <dd className={`mt-1.5 whitespace-pre-wrap [overflow-wrap:anywhere] ${field === "title" ? "text-base font-bold text-on-surface" : "text-sm leading-relaxed text-on-surface"}`}>
                {event[field] || <span className="text-on-surface-variant">Not provided</span>}
              </dd>
            </div>
          ))}
        </dl>
        {editable.length ? (
          <div>
            <Button ref={editButton} variant="secondary" onClick={startEditing}>
              <Icon name="edit" size={16} />Edit details
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
    <form onSubmit={save} noValidate className="grid gap-4" aria-label="Edit event details">
      {banner ? <AlertBanner tone={banner.tone} title={banner.title}>{banner.message}</AlertBanner> : null}
      {IDENTITY_FIELDS.map((field) => {
        const id = `event-${event.eventId}-${field}`;
        const canChange = editable.includes(field);
        const error = fieldErrors[field];
        const describedBy = [`${id}-count`, error ? `${id}-error` : ""].filter(Boolean).join(" ");
        const shared = {
          id,
          name: field,
          value: draft[field],
          readOnly: saving || !canChange,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
          // Opening the form is a deliberate action, so focus moves to its first editable field.
          autoFocus: field === editable[0] ? true : undefined,
          onChange: (change: { target: { value: string } }) => {
            setDraft((values) => ({ ...values, [field]: change.target.value }));
            if (fieldErrors[field]) {
              setFieldErrors((errors) => {
                const next = { ...errors };
                delete next[field];
                return next;
              });
            }
          },
          className: `${fieldClasses} ${error ? "border-error" : ""} ${canChange ? "" : "bg-surface-container text-on-surface-variant"}`,
        };
        return (
          <div key={field}>
            <FormLabel htmlFor={id} required={canChange}>{fieldLabel(field)}</FormLabel>
            {field === "title" ? <input {...shared} type="text" /> : <textarea {...shared} rows={field === "purpose" ? 3 : 5} />}
            <div className="mt-1 flex justify-between gap-3 text-xs">
              <span id={`${id}-error`} className="font-semibold text-error">{error ? <><Icon name="warning" size={16} className="mr-1 inline align-[-3px]" />{error}</> : null}</span>
              <span id={`${id}-count`} className={`tabular-nums ${draft[field].length > LIMITS[field] ? "font-semibold text-error" : "text-on-surface-variant"}`}>
                {canChange ? `${draft[field].length.toLocaleString()} / ${LIMITS[field].toLocaleString()}` : "Not editable"}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || !hasChanges || editable.length === 0}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="quiet" onClick={cancel} disabled={saving}>Cancel</Button>
        {!hasChanges && !saving ? <span className="self-center text-xs text-on-surface-variant">No changes to save yet.</span> : null}
      </div>
    </form>
    {conflict ? (
      <VersionConflictDialog latest={conflict} original={original} draft={draft} onKeepMine={keepMine} onUseLatest={discardMine} />
    ) : null}
    </>
  );
}
