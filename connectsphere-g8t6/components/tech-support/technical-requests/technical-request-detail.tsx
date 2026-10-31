"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, EmptyState, ReferenceIdTag, SectionCard, Skeleton, StatusChip } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { SectionHeading } from "@/components/shared/section-heading";
import { BookingStatusChip } from "@/components/venue-staff/booking-requests/booking-status-chip";
import { ApiError } from "@/lib/api";
import { ROLE_LABELS, ROUTES } from "@/lib/auth";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { getTechnicalRequest, type TechnicalRequestDetail } from "@/lib/api/technical-requests";
import { historyActionLabel, technicalStatusLabel } from "@/lib/technical-requests";
import { TechnicalRequestDecision, type DecisionNotice } from "./technical-request-decision";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; request: TechnicalRequestDetail }
  | { status: "missing" }
  | { status: "error"; message: string };

const backLink = (
  <Link href={ROUTES.dashboard} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
    <Icon name="arrow-back" size={16} />Technical requests
  </Link>
);

// One technical request for Technical Support (SPM-287 AC3): the event, the
// requested lines against what is free for the event's time now, its history,
// and the approve and reject actions while it is pending.
export function TechnicalRequestDetailView({ requestId }: { requestId: number | null }) {
  const [state, setState] = useState<DetailState>(requestId ? { status: "loading" } : { status: "missing" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<DecisionNotice | null>(null);

  useEffect(() => {
    if (!requestId) return;
    let alive = true;
    getTechnicalRequest(requestId)
      .then((request) => { if (alive) setState({ status: "ready", request }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.status === 404) setState({ status: "missing" });
        else setState({ status: "error", message: caught instanceof Error ? caught.message : "This technical request could not be loaded." });
      });
    return () => { alive = false; };
  }, [requestId, attempt]);

  const reload = () => setAttempt((value) => value + 1);

  if (state.status === "loading") {
    return (
      <div className="grid gap-5">
        {backLink}
        <div aria-busy="true" aria-label="Loading technical request" className="grid gap-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
      </div>
    );
  }
  if (state.status === "missing" || state.status === "error") {
    return (
      <div className="grid gap-5">
        {backLink}
        {state.status === "missing" ? (
          <EmptyState title="Technical request not found" description="It may have been removed, or the link is incorrect." />
        ) : (
          <AlertBanner tone="error" title="Could not load this technical request">
            {state.message}
            <div className="mt-3"><Button variant="secondary" onClick={() => { setState({ status: "loading" }); reload(); }}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        )}
      </div>
    );
  }

  const { request } = state;
  const decided = request.status !== "PENDING";

  return (
    <div className="grid gap-5">
      {backLink}
      <PageContent
        title={request.event.title}
        eyebrow={ROLE_LABELS.TECH_SUPPORT}
        description={`Technical request #${request.technicalRequestId} from ${request.requestedBy?.name ?? "the event coordinator"}`}
        action={<BookingStatusChip status={request.status} label={technicalStatusLabel(request.status)} />}
      >
        <div aria-live="polite" role="status">
          {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-12">
          <div className="grid min-w-0 gap-5 xl:col-span-8">
            <SectionCard className="grid gap-4" status={request.status === "APPROVED" ? "CONFIRMED" : request.status === "REJECTED" ? "REJECTED" : "SUBMITTED"}>
              <SectionHeading
                title="Requested equipment"
                description="Available is what is free for the event's time now, without this request. Approval reserves every line or none."
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <caption className="sr-only">Requested equipment and current availability</caption>
                  <thead className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
                    <tr className="border-b border-outline-variant">
                      <th scope="col" className="py-2 pr-3">Equipment</th>
                      <th scope="col" className="py-2 pr-3">Category</th>
                      <th scope="col" className="py-2 pr-3 text-right">Requested</th>
                      <th scope="col" className="py-2 text-right">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.items.map((item) => {
                      const short = !decided && item.quantity > item.availableQuantity;
                      return (
                        <tr key={item.equipmentId} className="border-b border-outline-variant/60 last:border-0">
                          <th scope="row" className="py-2 pr-3 font-semibold text-on-surface [overflow-wrap:anywhere]">{item.name}</th>
                          <td className="py-2 pr-3 text-on-surface-variant">{item.category ?? "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{item.quantity}</td>
                          <td className={`py-2 text-right tabular-nums ${short ? "font-semibold text-error" : ""}`}>
                            {decided ? "—" : item.availableQuantity}
                            {short ? <span className="sr-only"> (not enough)</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {request.status === "REJECTED" && request.rejectionReason ? (
                <p className="rounded-control bg-error-container p-3 text-sm text-on-error-container"><span className="font-semibold">Reason:</span> {request.rejectionReason}</p>
              ) : null}
              {decided ? (
                <p className="text-sm text-on-surface-variant">
                  {technicalStatusLabel(request.status)} by {request.decidedBy?.name ?? "Technical Support"}{request.decidedAt ? ` · ${formatTimestamp(request.decidedAt)}` : ""}
                </p>
              ) : (
                <TechnicalRequestDecision
                  request={request}
                  onDecided={(decision) => { setNotice(decision); reload(); }}
                />
              )}
            </SectionCard>
          </div>

          <aside className="grid min-w-0 gap-5 xl:col-span-4" aria-label="Event and history">
            <SectionCard className="grid gap-4">
              <SectionHeading title="Event" as="h3" />
              <div className="flex flex-wrap items-center gap-2">
                <ReferenceIdTag value={request.event.requestId} />
                <StatusChip status={request.event.status} />
              </div>
              <KeyValuePanel
                rows={[
                  { icon: "calendar", label: "Date & time", value: formatEventWindow(request.event.start, request.event.end) },
                  { icon: "venue", label: "Venue", value: request.event.venue ? `${request.event.venue.name}${request.event.venue.address ? `, ${request.event.venue.address}` : ""}` : "No venue booked yet" },
                  { icon: "person", label: "Requested by", value: request.requestedBy?.name ?? "Not available" },
                  { icon: "history", label: "Sent", value: formatTimestamp(request.createdAt) },
                ]}
              />
            </SectionCard>
            <SectionCard className="grid gap-3">
              <SectionHeading title="History" as="h3" />
              {request.history.length ? (
                <ol className="grid gap-3">
                  {request.history.map((entry, index) => (
                    <li key={`${entry.action}-${entry.at}-${index}`} className="grid gap-0.5 border-l-2 border-outline-variant pl-3">
                      <span className="text-sm font-semibold text-on-surface">{historyActionLabel(entry.action)}</span>
                      <span className="text-xs text-on-surface-variant">{entry.actor?.name ?? "System"} · {formatTimestamp(entry.at)}</span>
                      {entry.details ? <span className="text-xs text-on-surface [overflow-wrap:anywhere]">{entry.details}</span> : null}
                      {entry.rejectionReason ? <span className="text-xs text-on-surface"><span className="font-semibold">Reason:</span> {entry.rejectionReason}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-on-surface-variant">No history recorded.</p>
              )}
            </SectionCard>
          </aside>
        </div>
      </PageContent>
    </div>
  );
}
