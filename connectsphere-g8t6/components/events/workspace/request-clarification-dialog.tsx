"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertBanner, Button, FormLabel, StatusChip, fieldClasses } from "@/components/shared/primitives";
import { Dialog } from "@/components/shared/dialog";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { eventDisplayStatus } from "@/lib/events";
import {
  CLARIFICATION_TEXT_LIMIT,
  parseEventView,
  requestClarification,
  type EventView,
} from "@/lib/api/event-workspace";

type Banner = { tone: "error" | "warning"; title: string; message: string } | null;

interface RequestClarificationDialogProps {
  event: EventView;
  onClose: () => void;
  onRequested: (event: EventView) => void;
  // A newer version replaced the one on screen (version conflict).
  onEventReplaced: (event: EventView) => void;
  // The backend refused because the event's status or assignment changed.
  onAccessChanged: () => void;
}

// SPM-41 TC1/TC2: the assigned coordinator asks the organiser for amendments or
// clarification. The message is required and capped at 2,000 characters; the
// backend's answer wins, and the typed message survives every error.
export function RequestClarificationDialog({ event, onClose, onRequested, onEventReplaced, onAccessChanged }: RequestClarificationDialogProps) {
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [sending, setSending] = useState(false);
  // One key per distinct request; resending the same request reuses it so it cannot apply twice.
  const pendingKey = useRef<{ key: string; body: string } | null>(null);
  const fieldId = `event-${event.eventId}-clarification-message`;

  const validate = () => {
    if (!message.trim()) return "Enter a message for the organiser.";
    if (message.length > CLARIFICATION_TEXT_LIMIT) return `Use ${CLARIFICATION_TEXT_LIMIT.toLocaleString()} characters or fewer.`;
    return "";
  };

  const send = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const error = validate();
    setFieldError(error);
    if (error) {
      setBanner({ tone: "error", title: "Check your message", message: "Nothing was sent and the event status has not changed." });
      return;
    }
    const body = JSON.stringify({ message, version: event.version });
    const attempt = pendingKey.current?.body === body ? pendingKey.current : { key: crypto.randomUUID(), body };
    pendingKey.current = attempt;

    setSending(true);
    setBanner(null);
    try {
      const result = await requestClarification(event.eventId, message, event.version, attempt.key);
      pendingKey.current = null;
      onRequested(result.event);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSending(false);
    }
  };

  const handleError = (caught: unknown) => {
    if (!(caught instanceof ApiError)) {
      setBanner({ tone: "error", title: "Could not send", message: "Something went wrong. Your message is still here; try again." });
      return;
    }
    switch (caught.code) {
      case "VALIDATION_FAILED":
        setFieldError(caught.fields.message ?? "");
        setBanner({ tone: "error", title: "Check your message", message: caught.message });
        return;
      case "EVENT_VERSION_CONFLICT": {
        pendingKey.current = null;
        const latest = parseEventView(caught.details.event);
        if (latest) onEventReplaced(latest);
        setBanner({ tone: "warning", title: "This event changed while you were writing", message: "Nothing was sent. Your message is still here; check the latest details, then send again." });
        return;
      }
      case "TRANSITION_NOT_ALLOWED":
      case "EVENT_NOT_EDITABLE_IN_STATUS":
        setBanner({ tone: "warning", title: "Clarification is no longer available", message: "You can request clarification only while the event is under review. Your message is still shown so you can copy it." });
        onAccessChanged();
        return;
      case "EVENT_NOT_FOUND":
        setBanner({ tone: "error", title: "Event no longer available", message: "You can no longer open this event. It may have been reassigned to another coordinator. Nothing was sent." });
        return;
      case "IDEMPOTENCY_IN_PROGRESS":
        setBanner({ tone: "warning", title: "Still sending", message: "Your previous request is still being processed. Wait a moment, then select Send request again." });
        return;
      case "IDEMPOTENCY_KEY_REUSED":
        pendingKey.current = null;
        setBanner({ tone: "error", title: "Could not send", message: "This request clashed with an earlier attempt. Send again to retry." });
        return;
      case "UNAUTHENTICATED":
        setBanner({ tone: "error", title: "Your session has expired", message: "Sign in again in another tab, then send. Your message is still here." });
        return;
      case "NETWORK_ERROR":
        setBanner({ tone: "error", title: "Could not reach ConnectSphere", message: "Your message is still here. Send again when you are back online; a repeated request is applied only once." });
        return;
      default:
        setBanner({ tone: "error", title: "Could not send", message: caught.message });
    }
  };

  const close = () => {
    if (!sending) onClose();
  };

  return (
    <Dialog
      open
      onClose={close}
      title="Request clarification"
      badge={<StatusChip status={eventDisplayStatus(event)} />}
      footer={
        <>
          <Button type="button" variant="quiet" onClick={close} disabled={sending}>Cancel</Button>
          <Button type="submit" form={`${fieldId}-form`} disabled={sending}>
            <Icon name="help" size={16} />{sending ? "Sending…" : "Send request"}
          </Button>
        </>
      }
    >
      <form id={`${fieldId}-form`} onSubmit={send} noValidate className="grid gap-4">
        <p className="text-sm leading-relaxed text-on-surface-variant">
          The request returns to the organiser, who sees your message, can amend the event and resubmits it to you.
          It stays assigned to you while you wait.
        </p>
        {banner ? <AlertBanner tone={banner.tone} title={banner.title}>{banner.message}</AlertBanner> : null}
        <div>
          <FormLabel htmlFor={fieldId} required>Message to the organiser</FormLabel>
          <textarea
            id={fieldId}
            name="message"
            rows={6}
            autoFocus
            value={message}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={`${fieldId}-count ${fieldError ? `${fieldId}-error` : ""}`.trim()}
            onChange={(change) => {
              setMessage(change.target.value);
              if (fieldError) setFieldError("");
            }}
            placeholder="What should the organiser clarify or change?"
            className={`${fieldClasses} resize-y ${fieldError ? "border-error" : ""}`}
          />
          <div className="mt-1 flex justify-between gap-3 text-xs">
            <span id={`${fieldId}-error`} className="font-semibold text-error">
              {fieldError ? <><Icon name="warning" size={16} className="mr-1 inline align-[-3px]" />{fieldError}</> : null}
            </span>
            <span id={`${fieldId}-count`} className={`tabular-nums ${message.length > CLARIFICATION_TEXT_LIMIT ? "font-semibold text-error" : "text-on-surface-variant"}`}>
              {message.length.toLocaleString()} / {CLARIFICATION_TEXT_LIMIT.toLocaleString()}
            </span>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
