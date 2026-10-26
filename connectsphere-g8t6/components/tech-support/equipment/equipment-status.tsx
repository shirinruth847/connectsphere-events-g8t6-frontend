"use client";

import { useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, SectionCard } from "@/components/shared/primitives";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { formatEventWindow } from "@/lib/datetime";
import { changeEquipmentStatus, type Equipment, type UpcomingEquipmentRequest } from "@/lib/api/equipment";
import { EquipmentStatusChip, errorText, type Saved } from "./equipment-parts";

type Confirm = { step: "ask" } | { step: "upcoming"; count: number; events: UpcomingEquipmentRequest[] } | null;

export function StatusSection({ equipment, onSaved }: { equipment: Equipment; onSaved: Saved }) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const send = async (active: boolean, confirmUpcomingRequests: boolean) => {
    setSaving(true);
    setError("");
    try {
      const result = await changeEquipmentStatus(equipment.equipmentId, { active, version: equipment.version, confirmUpcomingRequests });
      setConfirm(null);
      onSaved(result.upcomingRequests ? `${result.message} ${result.upcomingRequests} upcoming request(s) were kept.` : result.message, result.equipment);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "EQUIPMENT_HAS_UPCOMING_REQUESTS") {
        setConfirm({
          step: "upcoming",
          count: (caught.details.upcomingCount as number) ?? 0,
          events: (caught.details.upcomingEvents as UpcomingEquipmentRequest[]) ?? [],
        });
      } else {
        setConfirm(null);
        setError(errorText(caught, "The status could not be changed."));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading
        step={3}
        title="Active status"
        description="Inactive equipment cannot be chosen for new event requests. Existing requests and history are kept."
        action={<EquipmentStatusChip status={equipment.status} label={equipment.statusLabel} />}
      />
      {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
      {equipment.status === "DETAILS_PENDING" ? (
        <AlertBanner tone="info" live={false}>The details are still being saved. The item can be chosen for event requests once they are.</AlertBanner>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {equipment.isActive ? (
          <Button variant="danger" disabled={saving} onClick={() => setConfirm({ step: "ask" })}>Deactivate equipment</Button>
        ) : (
          <Button disabled={saving} onClick={() => void send(true, false)}>{saving ? "Saving…" : "Reactivate equipment"}</Button>
        )}
      </div>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Deactivate this equipment?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setConfirm(null)}>Keep active</Button>
            <Button variant="danger" disabled={saving} onClick={() => void send(false, confirm?.step === "upcoming")}>{saving ? "Saving…" : "Deactivate"}</Button>
          </div>
        }
      >
        {confirm?.step === "upcoming" ? (
          <AlertBanner tone="warning" title={`Requested by ${confirm.count} upcoming event${confirm.count === 1 ? "" : "s"}`}>
            <ul className="mt-1 grid gap-1">
              {confirm.events.map((event) => (
                <li key={event.eventId}><span className="font-mono text-xs">{event.requestId}</span> {event.title} · {formatEventWindow(event.startDatetime)}</li>
              ))}
            </ul>
            {confirm.count > confirm.events.length ? <p className="mt-1">and {confirm.count - confirm.events.length} more.</p> : null}
            <p className="mt-2">Their requests are kept, but the equipment cannot be added to new requests.</p>
          </AlertBanner>
        ) : (
          <p className="text-sm text-on-surface">The equipment will not be available for new event requests. It stays in existing requests and history and can be reactivated later.</p>
        )}
      </Dialog>
    </SectionCard>
  );
}
