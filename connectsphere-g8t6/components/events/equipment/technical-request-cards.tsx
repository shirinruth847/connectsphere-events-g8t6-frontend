import type { ReactNode } from "react";
import { BOOKING_BORDERS } from "@/components/venue-staff/booking-requests/booking-status-chip";
import { formatTimestamp } from "@/lib/datetime";
import type { TechnicalArrangement } from "@/lib/api/organiser-arrangements";

// The event's technical requests, one card per request with its equipment
// listed (SPM-286/287), as GET /api/events/:id/arrangements groups them. The
// organiser and coordinator views pass their own status chip.
export function TechnicalRequestCards({ requests, status, empty }: {
  requests: TechnicalArrangement[];
  status: (request: TechnicalArrangement) => ReactNode;
  empty: string;
}) {
  if (!requests.length) return <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">{empty}</p>;
  return (
    <ul className="grid gap-3" aria-label="Technical requests">
      {requests.map((request, index) => {
        const title = request.requestId === null ? "Equipment request" : `Technical request #${request.requestId}`;
        return (
          <li key={request.requestId ?? `line-${index}`} aria-label={title} className={`grid min-w-0 gap-2 rounded-panel border-t-4 bg-surface-container-low p-4 [overflow-wrap:anywhere] ${BOOKING_BORDERS[request.status] ?? "border-t-outline-variant"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
              {status(request)}
            </div>
            {request.equipment.length ? (
              <ul className="grid gap-1 text-sm text-on-surface">
                {request.equipment.map((item) => <li key={item.equipmentId}>{item.name} × {item.quantity}</li>)}
              </ul>
            ) : <p className="text-sm text-on-surface-variant">No equipment items in this request.</p>}
            {request.supportRequired !== null ? (
              <p className="text-sm text-on-surface-variant">{request.supportRequired ? "Technical support requested" : "Technical support not requested"}</p>
            ) : null}
            {request.createdAt || request.decidedAt ? (
              <p className="text-xs text-on-surface-variant">
                {request.createdAt ? `Sent ${formatTimestamp(request.createdAt)}` : ""}
                {request.createdAt && request.decidedAt ? " · " : ""}
                {request.decidedAt ? `Decided ${formatTimestamp(request.decidedAt)}` : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
