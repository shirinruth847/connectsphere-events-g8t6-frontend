"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertBanner, Button, buttonClasses, EmptyState, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SectionHeading } from "@/components/shared/section-heading";
import { BookingStatusChip, BOOKING_BORDERS } from "@/components/venue-staff/booking-requests/booking-status-chip";
import { useDebouncedValue } from "@/components/venues/use-debounced-value";
import { ROUTES } from "@/lib/auth";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { listTechnicalRequests, type TechnicalRequestListItem } from "@/lib/api/technical-requests";
import {
  itemsSummary,
  MAX_TECHNICAL_SEARCH_LENGTH,
  TECHNICAL_REQUEST_STATUSES,
  technicalStatusLabel,
} from "@/lib/technical-requests";

type ListState =
  | { status: "loading" }
  | { status: "ready"; requests: TechnicalRequestListItem[]; total: number; nextOffset: number | null }
  | { status: "error"; message: string; fields?: Record<string, string> };

// Compact controls: the select is as wide as its longest option.
const compactField = fieldClasses.replace("w-full", "");

export const technicalRequestHref = (requestId: number) => `${ROUTES.technicalRequests}/${requestId}`;

function TechnicalRequestCard({ request }: { request: TechnicalRequestListItem }) {
  const titleId = `technical-request-${request.technicalRequestId}-title`;
  return (
    <article
      aria-labelledby={titleId}
      data-technical-request-id={request.technicalRequestId}
      className={`flex flex-col gap-3 rounded-panel border-t-4 ${BOOKING_BORDERS[request.status] ?? "border-t-slate-400"} bg-surface-container-lowest p-4 shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-on-surface">{request.event.title}</h3>
        <BookingStatusChip status={request.status} label={technicalStatusLabel(request.status)} />
      </div>
      <p className="-mt-2 text-xs text-on-surface-variant">
        <span className="font-mono">{request.event.requestId}</span>
        {request.event.venue ? ` · ${request.event.venue.name}` : " · No venue booked yet"}
      </p>
      <ul className="grid gap-1 text-sm text-on-surface">
        <li className="flex items-center gap-2"><Icon name="calendar" size={16} />{formatEventWindow(request.event.start, request.event.end)}</li>
        <li className="flex items-start gap-2"><Icon name="equipment" size={16} className="mt-0.5 shrink-0" /><span className="[overflow-wrap:anywhere]">{itemsSummary(request.items)}</span></li>
        <li className="flex items-center gap-2"><Icon name="person" size={16} />{request.requestedBy?.name ?? "Coordinator"}</li>
      </ul>
      <div className="mt-auto flex items-end justify-between gap-3">
        <Link href={technicalRequestHref(request.technicalRequestId)} className={buttonClasses(request.status === "PENDING" ? "primary" : "secondary")} aria-describedby={titleId}>
          {request.status === "PENDING" ? "Review" : "View"}<Icon name="arrow-forward" size={16} />
        </Link>
        <span className="text-xs text-on-surface-variant">
          {request.decidedAt ? `Decided ${formatTimestamp(request.decidedAt)}` : `Sent ${formatTimestamp(request.createdAt)}`}
        </span>
      </div>
    </article>
  );
}

// Technical requests from coordinators (SPM-287 AC1, AC2): pending first and
// oldest first, then decided ones, latest first, as the backend orders them;
// filtered by status and searched by event title as you type.
export function TechnicalRequestList() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const settled = useDebouncedValue(search.trim());
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const filters = useMemo(() => ({ status, search: settled }), [status, settled]);
  const filtered = Boolean(status || settled);

  // `alive` drops a slower response for a search or filter that has since changed.
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    setMoreError("");
    listTechnicalRequests(filters)
      .then((result) => { if (alive) setState({ status: "ready", requests: result.technicalRequests, total: result.total, nextOffset: result.nextOffset }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        const fields = (caught as { fields?: Record<string, string> }).fields;
        setState({ status: "error", message: caught instanceof Error ? caught.message : "Technical requests could not be loaded.", fields });
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [filters, attempt]);

  const retry = useCallback(() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }, []);
  const clearAll = () => { setStatus(""); setSearch(""); };

  const loadMore = async () => {
    if (state.status !== "ready" || state.nextOffset === null) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const result = await listTechnicalRequests(filters, state.nextOffset);
      setState((current) => current.status === "ready" ? {
        status: "ready",
        requests: [...current.requests, ...result.technicalRequests.filter((item) => !current.requests.some((seen) => seen.technicalRequestId === item.technicalRequestId))],
        total: result.total,
        nextOffset: result.nextOffset,
      } : current);
    } catch (caught) {
      setMoreError(caught instanceof Error ? caught.message : "More requests could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const pending = state.status === "ready" && !filtered ? state.requests.filter((request) => request.status === "PENDING").length : null;

  return (
    <section aria-labelledby="technical-requests-heading" className="grid gap-4">
      <SectionHeading
        id="technical-requests-heading"
        title="Technical requests"
        description="Equipment requests sent by event coordinators. Open one to check stock for the event's time, then approve or reject the whole request."
      />

      <div role="search" aria-label="Search and filter technical requests" className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-panel bg-surface-container-lowest p-3 shadow-elevation-1">
        <div className="grid min-w-[14rem] flex-1 gap-1">
          <label htmlFor="technical-request-search" className="text-xs font-semibold text-on-surface-variant">Search</label>
          <input
            id="technical-request-search"
            type="search"
            className={fieldClasses}
            placeholder="Event title"
            maxLength={MAX_TECHNICAL_SEARCH_LENGTH}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby="technical-request-search-hint"
          />
          <span id="technical-request-search-hint" className="sr-only">Results update as you type.</span>
        </div>
        <div className="grid gap-1">
          <label htmlFor="technical-request-status" className="text-xs font-semibold text-on-surface-variant">Status</label>
          <select id="technical-request-status" className={`${compactField} w-[9.5rem]`} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {TECHNICAL_REQUEST_STATUSES.map((value) => <option key={value} value={value}>{technicalStatusLabel(value)}</option>)}
          </select>
        </div>
        <Button variant="quiet" className="px-3" disabled={!filtered && !search} onClick={clearAll}>Clear</Button>
      </div>

      <div aria-live="polite">
        {state.status === "ready" ? (
          <p className="text-sm font-semibold text-on-surface">
            {filtered
              ? `${state.total} matching ${state.total === 1 ? "request" : "requests"}`
              : pending
                ? `${pending}${state.nextOffset !== null ? "+" : ""} pending ${pending === 1 ? "request" : "requests"} awaiting review`
                : "No pending technical requests."}
          </p>
        ) : null}
        {busy && state.status === "ready" ? <p className="text-xs text-on-surface-variant">Updating…</p> : null}
      </div>

      {state.status === "loading" ? (
        <div className="grid gap-4 md:grid-cols-2 min-[66rem]:grid-cols-3" aria-busy="true" aria-label="Loading technical requests">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-48 w-full" />)}
        </div>
      ) : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Could not load technical requests">
          {state.fields && Object.keys(state.fields).length ? Object.values(state.fields).join(" ") : state.message}
          <div className="mt-3"><Button variant="secondary" onClick={retry}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" && state.requests.length === 0 ? (
        <EmptyState
          title={filtered ? "No matching technical requests" : "No technical requests yet"}
          description={filtered ? "No request matches this search or status. Clear them to see more." : "Requests that event coordinators send appear here."}
          action={filtered ? <Button variant="secondary" onClick={clearAll}>Clear search and filters</Button> : undefined}
        />
      ) : null}

      {state.status === "ready" && state.requests.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 min-[66rem]:grid-cols-3" aria-busy={busy}>
            {state.requests.map((request) => <TechnicalRequestCard key={request.technicalRequestId} request={request} />)}
          </div>
          {state.nextOffset !== null ? (
            <div className="grid justify-items-start gap-2">
              <p className="text-sm text-on-surface-variant">Showing {state.requests.length} of {state.total} requests.</p>
              <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more"}</Button>
              {moreError ? <p role="alert" className="text-xs font-semibold text-error">{moreError}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
