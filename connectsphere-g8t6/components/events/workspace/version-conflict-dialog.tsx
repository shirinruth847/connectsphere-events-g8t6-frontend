"use client";

import { Button } from "@/components/shared/primitives";
import { Dialog } from "@/components/shared/dialog";
import { StatusChip } from "@/components/shared/status-chip";
import type { EventView, IdentityField } from "@/lib/api/event-workspace";
import { formatTimestamp } from "@/lib/datetime";
import { editableIdentityFields } from "@/lib/permissions/event-workspace";
import { fieldLabel } from "./event-detail-rows";

interface VersionConflictDialogProps {
  // The event as it is now saved (from the 409 response).
  latest: EventView;
  // The values the user started from and the values they typed.
  original: Record<IdentityField, string>;
  draft: Record<IdentityField, string>;
  onKeepMine: () => void;
  onUseLatest: () => void;
}

// Shown on 409 EVENT_VERSION_CONFLICT: nothing was saved, so the user compares
// their edits with the latest saved version and decides what to do next.
export function VersionConflictDialog({ latest, original, draft, onKeepMine, onUseLatest }: VersionConflictDialogProps) {
  const fields = (["title", "purpose", "description"] as const).filter((field) => {
    const saved = latest[field] ?? "";
    return saved !== original[field] || draft[field] !== original[field];
  });
  const stillEditable = editableIdentityFields(latest.permissions).length > 0;

  return (
    <Dialog
      open
      onClose={onKeepMine}
      title="This event changed while you were editing"
      badge={<StatusChip status={latest.status} />}
      footer={
        <>
          <Button variant="secondary" onClick={onUseLatest}>Discard my edits</Button>
          <Button onClick={onKeepMine} disabled={!stillEditable}>Keep my edits and review</Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-on-surface-variant">
        Someone saved a newer version on <strong className="text-on-surface">{formatTimestamp(latest.updatedAt)}</strong>.
        Nothing from your edit was saved. Compare the two versions below.
      </p>
      {!stillEditable ? (
        <p className="mt-3 rounded-control bg-error-container p-3 text-sm text-on-error-container" role="alert">
          You can no longer edit this event in its current status, so only the latest version can be kept.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3">
        {fields.map((field) => (
          <section key={field} className="rounded-control bg-surface-container-low p-3" aria-label={fieldLabel(field)}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">{fieldLabel(field)}</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">Latest saved</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface [overflow-wrap:anywhere]">{latest[field] || "—"}</p>
              </div>
              {draft[field] === original[field] ? (
                <div>
                  <p className="text-xs font-semibold text-on-surface-variant">Your edit</p>
                  <p className="mt-1 text-sm text-on-surface-variant">You did not change this field, so the latest saved version is kept.</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-primary">Your edit</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface [overflow-wrap:anywhere]">{draft[field] || "—"}</p>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
