"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { CLARIFICATION_TEXT_LIMIT, postClarificationMessage, type ClarificationRound } from "@/lib/api/event-workspace";
import { clarificationMessageProblem } from "@/lib/events";

type Banner = { tone: "error" | "warning"; title: string; message: string } | null;

interface ClarificationMessageComposerProps {
  eventId: number;
  round: number;
  placeholder: string;
  onSent: (round: ClarificationRound | null) => void;
  // The backend refused because the thread is no longer open to this viewer.
  onAccessChanged: () => void;
}

// SPM-41 v2: the owner or the assigned coordinator adds a message to the open
// thread. Messages cannot be edited once sent; the typed text survives every error.
export function ClarificationMessageComposer({ eventId, round, placeholder, onSent, onAccessChanged }: ClarificationMessageComposerProps) {
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [sending, setSending] = useState(false);
  // One key per distinct message; resending the same text reuses it so it is posted once.
  const pendingKey = useRef<{ key: string; body: string } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const fieldId = `event-${eventId}-clarification-${round}-reply`;

  const send = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const problem = clarificationMessageProblem(text, CLARIFICATION_TEXT_LIMIT);
    setFieldError(problem ?? "");
    if (problem) return;

    const attempt = pendingKey.current?.body === text ? pendingKey.current : { key: crypto.randomUUID(), body: text };
    pendingKey.current = attempt;
    setSending(true);
    setBanner(null);
    try {
      const result = await postClarificationMessage(eventId, round, text, attempt.key);
      pendingKey.current = null;
      setText("");
      onSent(result.clarification);
      // The Send button was disabled while sending, so focus returns to the box for the next message.
      field.current?.focus();
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
        setFieldError(caught.fields.body ?? caught.message);
        return;
      case "CLARIFICATION_CLOSED":
      case "CLARIFICATION_NOT_FOUND":
      case "EVENT_READ_ONLY":
      case "TRANSITION_NOT_ALLOWED":
        setBanner({ tone: "warning", title: "This clarification is no longer open", message: "Nothing was sent. Your message is still shown so you can copy it." });
        onAccessChanged();
        return;
      case "EVENT_NOT_FOUND":
        setBanner({ tone: "error", title: "Event no longer available", message: "You can no longer open this event. Nothing was sent." });
        return;
      case "IDEMPOTENCY_IN_PROGRESS":
        setBanner({ tone: "warning", title: "Still sending", message: "Your previous message is still being processed. Wait a moment, then select Send again." });
        return;
      case "IDEMPOTENCY_KEY_REUSED":
        pendingKey.current = null;
        setBanner({ tone: "error", title: "Could not send", message: "This message clashed with an earlier attempt. Send again to retry." });
        return;
      case "UNAUTHENTICATED":
        setBanner({ tone: "error", title: "Your session has expired", message: "Sign in again in another tab, then send. Your message is still here." });
        return;
      case "NETWORK_ERROR":
        setBanner({ tone: "error", title: "Could not reach ConnectSphere", message: "Your message is still here. Send again when you are back online; a repeated message is posted only once." });
        return;
      default:
        setBanner({ tone: "error", title: "Could not send", message: caught.message });
    }
  };

  return (
    <form onSubmit={send} noValidate className="grid gap-2" aria-label={`Reply to clarification request ${round}`}>
      {banner ? <AlertBanner tone={banner.tone} title={banner.title}>{banner.message}</AlertBanner> : null}
      <FormLabel htmlFor={fieldId}>Your message</FormLabel>
      <textarea
        ref={field}
        id={fieldId}
        rows={3}
        value={text}
        onChange={(change) => {
          setText(change.target.value);
          if (fieldError) setFieldError("");
        }}
        placeholder={placeholder}
        className={`${fieldClasses} resize-y ${fieldError ? "border-error" : ""}`}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={`${fieldId}-count ${fieldError ? `${fieldId}-error` : ""}`.trim()}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span id={`${fieldId}-error`} className="font-semibold text-error">
          {fieldError ? <><Icon name="warning" size={16} className="mr-1 inline align-[-3px]" />{fieldError}</> : null}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span id={`${fieldId}-count`} className={`tabular-nums ${text.length > CLARIFICATION_TEXT_LIMIT ? "font-semibold text-error" : "text-on-surface-variant"}`}>
            {text.length.toLocaleString()} / {CLARIFICATION_TEXT_LIMIT.toLocaleString()}
          </span>
          <Button type="submit" disabled={sending}><Icon name="forum" size={16} />{sending ? "Sending…" : "Send"}</Button>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant">Messages cannot be edited after they are sent.</p>
    </form>
  );
}
