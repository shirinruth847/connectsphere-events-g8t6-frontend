"use client";

import { useId } from "react";
import type { AttendeeEvent } from "@/lib/api/types";
import { formatDate, formatLongDate, formatTimeRange } from "@/lib/format";
import { Button } from "@/components/shared/Button";
import { KeyValuePanel, type KeyValueItem } from "@/components/shared/KeyValuePanel";
import { MediaThumbnail } from "@/components/shared/MediaThumbnail";
import { Modal } from "@/components/shared/Modal";
import { StatusChip } from "@/components/shared/StatusChip";
import { RegistrationButton, RegistrationCapacity, RegistrationNote } from "./RegistrationParts";
import { getRegistrationAction } from "./registration-copy";

interface EventDetailsModalProps {
  event: AttendeeEvent | null;
  open: boolean;
  onClose: () => void;
}

/** Full attendee-facing details for one event (SPM-34 AC2). Shows only attendee-safe fields. */
export function EventDetailsModal({ event, open, onClose }: EventDetailsModalProps) {
  const noticeId = useId();
  if (!event) return null;

  const { registration, venue } = event;
  const hasAction = getRegistrationAction(registration) !== null;

  const details: KeyValueItem[] = [
    { icon: "calendar-today", label: "Date", value: formatLongDate(event.start_datetime) },
    { icon: "schedule", label: "Time", value: formatTimeRange(event.start_datetime, event.end_datetime) },
  ];
  if (venue) {
    details.push({
      icon: "location-on",
      label: "Venue",
      value: (
        <>
          {venue.name}
          <span className="block text-body-sm font-normal text-on-surface-variant">{venue.address}</span>
        </>
      ),
    });
  }
  if (registration.is_registration_enabled && registration.registration_open_at) {
    details.push({ icon: "calendar-month", label: "Registration opens", value: formatDate(registration.registration_open_at) });
  }
  if (registration.is_registration_enabled && registration.registration_close_at) {
    details.push({ icon: "lock", label: "Registration closes", value: formatDate(registration.registration_close_at) });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event.title}
      headerAccessory={<StatusChip domain="registrationAvailability" status={registration.availability} />}
      footer={
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <RegistrationNote registration={registration} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
              {/* INTEGRATION (registration ticket): enable once the backend can commit the
                  registration or waitlist entry. Never show a place as reserved before it commits. */}
              <RegistrationButton
                registration={registration}
                eventTitle={event.title}
                disabled
                aria-describedby={noticeId}
              />
            </div>
          </div>
          {hasAction ? (
            <p id={noticeId} className="text-body-sm text-on-surface-variant">
              Online registration isn&apos;t available yet, so no place has been reserved.
            </p>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <MediaThumbnail
          src={event.image_url}
          label={venue?.name ?? event.title}
          sizes="(min-width: 672px) 632px, 100vw"
          className="aspect-3/1 w-full"
        />
        <p className="max-w-[70ch] text-body text-on-surface-variant">{event.description}</p>
        <KeyValuePanel items={details} />
        <RegistrationCapacity registration={registration} />
      </div>
    </Modal>
  );
}
