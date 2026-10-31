"use client";

import { useRef, useState } from "react";
import { DiscoveryIcon } from "@/components/attendee/discovery/discovery-icon";
import { formatTimestamp } from "@/components/attendee/discovery/format-event-time";
import { Button } from "@/components/shared/primitives";
import type { RegistrationActionResult } from "@/lib/api/registration-actions";
import { RegistrationActionDialog, type ActionTarget } from "./registration-action-dialog";
import { openOffer, placeActions, type PlaceContext, type RegistrationActionKind } from "./registration-action-rules";

export interface RegistrationChange {
  kind: RegistrationActionKind;
  eventId: number;
  title: string;
  // The backend's result; null when it refused because the place had changed.
  result: RegistrationActionResult | null;
}

const BUTTONS: Record<RegistrationActionKind, { label: string; variant: "tertiary" | "secondary" | "danger" }> = {
  accept: { label: "Accept Slot", variant: "tertiary" },
  decline: { label: "Decline", variant: "secondary" },
  leave: { label: "Leave Waitlist", variant: "secondary" },
};

// The open offer's deadline, above its Accept Slot and Decline (SPM-163 AC5).
export function OfferCallout({ expiresAt }: { expiresAt: string }) {
  return (
    <p className="flex items-start gap-2 rounded-control bg-tertiary-fixed px-3 py-2 text-sm text-on-tertiary-fixed">
      <DiscoveryIcon name="schedule" className="mt-0.5 shrink-0 text-tertiary" />
      <span>
        <strong className="font-semibold">A place has opened up for you.</strong> Accept or decline by {formatTimestamp(expiresAt) ?? "the deadline"}.
      </span>
    </p>
  );
}

// The actions on the attendee's own place: Accept Slot and Decline for an open
// offer, or Leave Waitlist.
// Each opens a confirmation; onChange runs once the backend has answered.
export function RegistrationActions({
  eventId,
  title,
  place,
  onChange,
  className = "",
}: {
  eventId: number;
  title: string;
  place: PlaceContext;
  onChange: (change: RegistrationChange) => void;
  className?: string;
}) {
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const actions = placeActions(place);
  const offer = openOffer(place.registration);
  if (!actions.length && !target) return null;

  const close = (stale: boolean) => {
    const closed = target;
    setTarget(null);
    if (stale && closed) onChange({ kind: closed.kind, eventId, title, result: null });
    // After the modal has gone; the page behind it is inert until then.
    else requestAnimationFrame(() => opener.current?.focus());
  };

  return (
    <>
      {actions.length ? (
        <div className={`flex flex-col gap-3 ${className}`}>
          {offer ? <OfferCallout expiresAt={offer.expiresAt} /> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {actions.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant={BUTTONS[kind].variant}
                aria-label={`${BUTTONS[kind].label}: ${title}`}
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setTarget({ kind, eventId, title, waitlistPosition: place.registration.waitlistPosition, offer });
                }}
                className="max-lg:min-h-11 max-sm:w-full"
              >
                {BUTTONS[kind].label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {target ? (
        <RegistrationActionDialog
          key={`${target.kind}-${target.offer?.offerId ?? ""}`}
          target={target}
          onClose={close}
          onDone={(result) => {
            setTarget(null);
            onChange({ kind: target.kind, eventId, title, result });
          }}
        />
      ) : null}
    </>
  );
}
