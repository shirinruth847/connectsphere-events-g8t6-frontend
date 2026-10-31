"use client";

import { useState } from "react";
import { toApiError } from "@/components/attendee/discovery/use-discovery-events";
import { formatTimestamp } from "@/components/attendee/discovery/format-event-time";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button } from "@/components/shared/primitives";
import type { PlaceOffer } from "@/lib/api/my-events";
import {
  acceptOffer,
  declineOffer,
  leaveWaitlist,
  newIdempotencyKey,
  withdrawRegistration,
  type RegistrationActionResult,
} from "@/lib/api/registration-actions";
import { actionErrorPresentation, type ActionErrorPresentation, type RegistrationActionKind } from "./registration-action-rules";

const BACK_OF_QUEUE = "If you join the waitlist again later, you'll go to the back of the queue.";

// Wording for each confirmation (SPM-163 AC4, AC6, AC7; SPM-147 AC2, AC3).
const COPY: Record<RegistrationActionKind, { title: string; confirm: string; keep: string; variant: "tertiary" | "danger" }> = {
  accept: { title: "Accept this place?", confirm: "Accept Slot", keep: "Not now", variant: "tertiary" },
  decline: { title: "Decline this place?", confirm: "Decline Place", keep: "Keep Offer", variant: "danger" },
  leave: { title: "Leave the waitlist?", confirm: "Leave Waitlist", keep: "Stay on Waitlist", variant: "danger" },
  withdraw: { title: "Withdraw Registration", confirm: "Confirm Withdrawal", keep: "Keep Registration", variant: "danger" },
};

export interface ActionTarget {
  kind: RegistrationActionKind;
  eventId: number;
  title: string;
  waitlistPosition?: number | null;
  offer?: PlaceOffer | null;
}

const send = ({ kind, eventId, offer }: ActionTarget, key: string) => {
  switch (kind) {
    case "accept":
      return acceptOffer(eventId, offer!.offerId, key);
    case "decline":
      return declineOffer(eventId, offer!.offerId, key);
    case "leave":
      return leaveWaitlist(eventId, key);
    case "withdraw":
      return withdrawRegistration(eventId, key);
  }
};

function Explanation({ target }: { target: ActionTarget }) {
  const deadline = formatTimestamp(target.offer?.expiresAt);
  switch (target.kind) {
    case "accept":
      return (
        <p>
          You&apos;ll be registered for <strong>{target.title}</strong>.{deadline ? ` This offer is open until ${deadline}.` : ""}
        </p>
      );
    case "decline":
      return (
        <>
          <p>
            You&apos;ll give up this place at <strong>{target.title}</strong> and leave its waitlist.
          </p>
          <p>{BACK_OF_QUEUE}</p>
        </>
      );
    case "leave":
      return (
        <>
          <p>
            You&apos;ll lose your place{target.waitlistPosition ? ` (Position ${target.waitlistPosition})` : ""} on the waitlist for{" "}
            <strong>{target.title}</strong>.
          </p>
          <p>{BACK_OF_QUEUE}</p>
        </>
      );
    case "withdraw":
      return (
        <>
          <p className="font-semibold text-on-surface">Are you sure? This action cannot be undone.</p>
          <p>
            Your place at <strong>{target.title}</strong> will be released. If you want to attend later, you&apos;ll join at the back
            of the queue.
          </p>
        </>
      );
  }
}

// Confirms one change to the attendee's place. The place is shown as changed
// only after the backend confirms it (onDone); a refusal is explained here and
// reported through onClose(true) so the surface reloads the latest place.
// Mount it with a key per target so each intent gets its own Idempotency-Key.
export function RegistrationActionDialog({
  target,
  onDone,
  onClose,
}: {
  target: ActionTarget;
  onDone: (result: RegistrationActionResult) => void;
  onClose: (stale: boolean) => void;
}) {
  const [key] = useState(newIdempotencyKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionErrorPresentation | null>(null);
  const copy = COPY[target.kind];

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      onDone(await send(target, key));
    } catch (caught) {
      setError(actionErrorPresentation(toApiError(caught)));
      setPending(false);
    }
  };

  const stale = error !== null && !error.retryable;
  const close = () => {
    if (!pending) onClose(stale);
  };

  return (
    <Dialog
      open
      onClose={close}
      title={copy.title}
      footer={
        stale ? (
          <Button type="button" variant="secondary" onClick={close} className="max-lg:min-h-11 max-sm:w-full">
            Close
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={close} disabled={pending} className="max-lg:min-h-11 max-sm:w-full">
              {copy.keep}
            </Button>
            <Button type="button" variant={copy.variant} onClick={confirm} disabled={pending} className="max-lg:min-h-11 max-sm:w-full">
              {pending ? "Sending…" : error ? `Try again: ${copy.confirm}` : copy.confirm}
            </Button>
          </>
        )
      }
    >
      <div className="flex max-w-[70ch] flex-col gap-3 text-sm leading-relaxed text-on-surface-variant">
        <Explanation target={target} />
        {error ? (
          <AlertBanner tone="error" title={stale ? "This could not be done" : "Not sent"}>
            {error.message}
          </AlertBanner>
        ) : null}
      </div>
    </Dialog>
  );
}
