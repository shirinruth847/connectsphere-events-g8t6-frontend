"use client";

import { useRef, useState } from "react";
import { AlertBanner, Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { completeClarification, parseEventView, type ClarificationRound, type EventView } from "@/lib/api/event-workspace";

type Banner = { tone: "error" | "warning"; title: string; message: string } | null;

interface ClarificationCompleteControlProps {
  // Referenced by the trigger's aria-controls.
  id: string;
  event: EventView;
  round: number;
  // The trigger lives elsewhere (the thread pop-up's header); this shows the confirmation.
  confirming: boolean;
  onCancel: () => void;
  onCompleted: (event: EventView, message: string, clarification: ClarificationRound | null) => void;
  // A newer version replaced the one on screen, e.g. the organiser amended the request.
  onEventReplaced: (event: EventView) => void;
  onAccessChanged: () => void;
}

// SPM-41 v2: only the assigned coordinator closes the thread, which returns the
// event to review. It is sent with the version on screen, so amendments saved
// after the coordinator loaded the page are refused (409) until they review them.
export function ClarificationCompleteControl({ id, event, round, confirming, onCancel, onCompleted, onEventReplaced, onAccessChanged }: ClarificationCompleteControlProps) {
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const pendingKey = useRef<{ key: string; version: number } | null>(null);

  const confirm = async () => {
    const attempt = pendingKey.current?.version === event.version ? pendingKey.current : { key: crypto.randomUUID(), version: event.version };
    pendingKey.current = attempt;
    setSending(true);
    setBanner(null);
    try {
      const result = await completeClarification(event.eventId, round, event.version, attempt.key);
      pendingKey.current = null;
      onCompleted(result.event, result.message, result.clarification);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSending(false);
    }
  };

  const handleError = (caught: unknown) => {
    if (!(caught instanceof ApiError)) {
      setBanner({ tone: "error", title: "Could not mark complete", message: "Something went wrong. Try again." });
      return;
    }
    switch (caught.code) {
      case "EVENT_VERSION_CONFLICT": {
        pendingKey.current = null;
        const latest = parseEventView(caught.details.event);
        if (latest) onEventReplaced(latest);
        setBanner({ tone: "warning", title: "The request changed after you loaded it", message: "The organiser may have amended it. Review the latest details, then mark the request complete again." });
        return;
      }
      case "CLARIFICATION_CLOSED":
      case "CLARIFICATION_NOT_FOUND":
      case "TRANSITION_NOT_ALLOWED":
        setBanner({ tone: "warning", title: "This clarification is no longer open", message: "Refresh to see the event's current status." });
        onAccessChanged();
        return;
      case "EVENT_NOT_FOUND":
        setBanner({ tone: "error", title: "Event no longer available", message: "You can no longer open this event. It may have been reassigned to another coordinator." });
        return;
      case "IDEMPOTENCY_IN_PROGRESS":
        setBanner({ tone: "warning", title: "Still working", message: "Your previous attempt is still being processed. Wait a moment, then try again." });
        return;
      case "NETWORK_ERROR":
        setBanner({ tone: "error", title: "Could not reach ConnectSphere", message: "Try again when you are back online; a repeated request is applied only once." });
        return;
      default:
        setBanner({ tone: "error", title: "Could not mark complete", message: caught.message });
    }
  };

  return (
    <div id={id} className="grid gap-2 empty:hidden">
      {banner ? <AlertBanner tone={banner.tone} title={banner.title}>{banner.message}</AlertBanner> : null}
      {confirming ? (
        <div className="grid gap-3 rounded-control border border-outline-variant p-3" role="group" aria-label={`Mark request ${round} complete`}>
          <p className="text-sm text-on-surface">
            Mark Request {round} complete? The event goes back under review, and no more messages can be added to this request.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void confirm()} disabled={sending}><Icon name="check" size={16} />{sending ? "Marking complete…" : "Confirm"}</Button>
            <Button variant="quiet" onClick={onCancel} disabled={sending}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
