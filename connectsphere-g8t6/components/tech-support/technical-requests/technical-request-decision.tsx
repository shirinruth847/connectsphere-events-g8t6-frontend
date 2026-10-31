"use client";

import { useId, useRef, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { formatEventWindow } from "@/lib/datetime";
import { decideTechnicalRequest, type TechnicalRequestDetail } from "@/lib/api/technical-requests";
import { itemsSummary, MAX_REJECTION_REASON, rejectionReasonProblem } from "@/lib/technical-requests";

export type DecisionNotice = { tone: "success" | "warning"; text: string };

// Approve or reject one technical request (SPM-287 AC4-AC7). The whole request
// is approved or none of it (Master 5.5); the backend re-checks stock, and a
// decision someone else made first comes back as 409 TECHNICAL_REQUEST_ALREADY_DECIDED.
export function TechnicalRequestDecision({ request, onDecided }: {
  request: TechnicalRequestDetail;
  onDecided: (notice: DecisionNotice) => void;
}) {
  const [dialog, setDialog] = useState<"APPROVE" | "REJECT" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingKey = useRef<{ body: string; key: string } | null>(null);
  const reasonId = useId();
  const hintId = useId();
  const short = request.items.filter((item) => item.quantity > item.availableQuantity);
  const blockedId = useId();

  const close = () => {
    if (saving) return;
    setDialog(null);
    setError("");
  };

  const decide = async () => {
    if (!dialog) return;
    const text = dialog === "REJECT" ? reason.trim() : null;
    if (dialog === "REJECT") {
      const problem = rejectionReasonProblem(reason);
      if (problem) { setReasonError(problem); return; }
    }
    // A retry of the same decision reuses its key, so it is applied once.
    const body = JSON.stringify([dialog, text]);
    const attempt = pendingKey.current?.body === body ? pendingKey.current : { body, key: crypto.randomUUID() };
    pendingKey.current = attempt;
    setSaving(true);
    setError("");
    try {
      await decideTechnicalRequest(request.technicalRequestId, dialog, text, attempt.key);
      pendingKey.current = null;
      setDialog(null);
      setReason("");
      onDecided({
        tone: "success",
        text: dialog === "APPROVE"
          ? "Technical request approved. The equipment is reserved for the event's time, and the coordinator and organiser have been notified."
          : "Technical request rejected. The coordinator has been notified with your reason, and the quantities are released.",
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code !== "NETWORK_ERROR" && caught.code !== "IDEMPOTENCY_IN_PROGRESS") pendingKey.current = null;
      if (caught instanceof ApiError && caught.code === "TECHNICAL_REQUEST_ALREADY_DECIDED") {
        setDialog(null);
        onDecided({ tone: "warning", text: `${caught.message || "This request has already been decided."} The current decision is shown.` });
      } else if (caught instanceof ApiError && caught.fields.reason) {
        setReasonError(caught.fields.reason);
      } else {
        // Input is kept so the user can retry after a recoverable error.
        setError(caught instanceof Error ? caught.message : "The decision could not be saved. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (request.status !== "PENDING") return null;

  return (
    <div className="grid gap-2 border-t border-outline-variant pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          {request.event.status === "PLANNING" ? "Awaiting your decision. All lines are approved together, or the request is rejected." : "Can be decided once the event is back in planning."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => { setDialog("REJECT"); setReasonError(""); setError(""); }}>
            <Icon name="close" size={16} />Reject
          </Button>
          <Button disabled={short.length > 0} aria-describedby={short.length ? blockedId : undefined} onClick={() => { setDialog("APPROVE"); setError(""); }}>
            <Icon name="check" size={16} />Approve
          </Button>
        </div>
      </div>
      {short.length ? (
        <p id={blockedId} className="text-xs font-semibold text-error">
          Can&apos;t approve: not enough {short.map((item) => `${item.name} (${item.availableQuantity} available)`).join(", ")}. Reject with a reason, or wait for stock to free up.
        </p>
      ) : null}

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={dialog === "APPROVE" ? "Approve this technical request?" : "Reject this technical request?"}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="quiet" disabled={saving} onClick={close}>Cancel</Button>
            <Button variant={dialog === "APPROVE" ? "primary" : "danger"} disabled={saving} onClick={() => void decide()}>
              {saving ? "Saving…" : dialog === "APPROVE" ? "Approve request" : "Reject request"}
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4">
          <p className="text-sm text-on-surface">
            <span className="font-semibold">{request.event.title}</span> · <span className="font-mono">{request.event.requestId}</span>
            <br />
            <span className="text-on-surface-variant">{formatEventWindow(request.event.start, request.event.end)}</span>
            <br />
            {itemsSummary(request.items)}
          </p>
          {dialog === "APPROVE" ? (
            <p className="text-sm text-on-surface-variant">Every line is reserved for the event&apos;s time. If any item is no longer available, nothing is approved.</p>
          ) : (
            <div>
              <FormLabel htmlFor={reasonId} required>Reason</FormLabel>
              <textarea
                id={reasonId}
                className={`${fieldClasses} min-h-28`}
                value={reason}
                maxLength={MAX_REJECTION_REASON}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={`${hintId}${reasonError ? ` ${reasonId}-error` : ""}`}
                onChange={(event) => { setReason(event.target.value); setReasonError(""); }}
                disabled={saving}
              />
              <p id={hintId} className="mt-1 flex justify-between gap-3 text-xs text-on-surface-variant">
                <span>The coordinator sees this reason. You can suggest other quantities or items.</span>
                <span>{reason.length}/{MAX_REJECTION_REASON}</span>
              </p>
              {reasonError ? <p id={`${reasonId}-error`} role="alert" className="mt-1 text-xs font-semibold text-error">{reasonError}</p> : null}
            </div>
          )}
          {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
        </div>
      </Dialog>
    </div>
  );
}
