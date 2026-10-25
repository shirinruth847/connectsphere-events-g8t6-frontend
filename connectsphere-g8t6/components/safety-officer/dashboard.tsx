"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, buttonClasses, EmptyState, ReferenceIdTag, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { SectionHeading } from "@/components/shared/section-heading";
import { RoundStatusChip } from "@/components/events/workspace/safety-review-section";
import { ApiError } from "@/lib/api";
import {
  claimSafetyReview,
  listMySafetyReviews,
  listSafetyQueue,
  type SafetyReviewSummary,
} from "@/lib/api/safety-reviews";
import { ROLE_LABELS } from "@/lib/auth";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { describeSafetyError } from "@/lib/safety-review";

type ListState =
  | { status: "loading" }
  | { status: "ready"; reviews: SafetyReviewSummary[] }
  | { status: "error"; message: string };

type Notice = { tone: "success" | "warning" | "error"; title: string; message: string; eventId?: number };

// Loads one list; "attempt" reloads it.
function useReviewList(load: () => Promise<{ reviews: SafetyReviewSummary[] }>, attempt: number) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    load()
      .then(({ reviews }) => {
        if (alive) setState({ status: "ready", reviews });
      })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: caught instanceof ApiError ? caught.message : "The reviews could not be loaded." });
      });
    return () => {
      alive = false;
    };
  }, [load, attempt]);
  return state;
}

// "onClaim" marks a queue card; a card in My reviews continues the review.
function ReviewCard({
  review,
  claiming = false,
  claimDisabled = false,
  onClaim,
}: {
  review: SafetyReviewSummary;
  claiming?: boolean;
  claimDisabled?: boolean;
  onClaim?: () => void;
}) {
  const titleId = `review-${review.reviewId}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex h-full flex-col gap-4 rounded-panel border-t-4 border-t-primary bg-surface-container-lowest p-5 shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RoundStatusChip status="OPEN" />
        <ReferenceIdTag value={review.requestId} />
      </div>
      <div>
        <h3 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-on-surface">{review.title}</h3>
        <p className="mt-1 text-xs text-on-surface-variant">
          Round {review.roundNumber} · submitted <time dateTime={review.submittedAt}>{formatTimestamp(review.submittedAt)}</time>
        </p>
      </div>
      <KeyValuePanel
        rows={[
          { icon: "calendar", label: "Event dates", value: formatEventWindow(review.startDatetime, review.endDatetime) },
          {
            icon: "attendees",
            label: "Expected attendance",
            value: review.expectedAttendance ? `${review.expectedAttendance.toLocaleString()} people` : "Not provided",
          },
          { icon: "venue", label: "Venues", value: review.venues.length ? review.venues.join(", ") : "No active booking" },
          ...(review.claimedAt ? [{ icon: "person" as const, label: "Claimed", value: formatTimestamp(review.claimedAt) }] : []),
        ]}
      />
      <div className="mt-auto flex flex-wrap gap-2">
        {onClaim ? (
          <>
            <Button onClick={onClaim} disabled={claiming || claimDisabled} aria-describedby={titleId}>
              <Icon name="shield" size={16} />{claiming ? "Claiming…" : "Claim"}
            </Button>
            <Link href={`/events/${review.eventId}`} className={buttonClasses("secondary")} aria-describedby={titleId}>
              Open event<Icon name="arrow-forward" size={16} />
            </Link>
          </>
        ) : (
          <Link href={`/events/${review.eventId}`} className={buttonClasses("primary")} aria-describedby={titleId}>
            Continue review<Icon name="arrow-forward" size={16} />
          </Link>
        )}
      </div>
    </article>
  );
}

function ReviewList({
  id,
  title,
  description,
  state,
  emptyTitle,
  emptyDescription,
  onRetry,
  renderCard,
}: {
  id: string;
  title: string;
  description: string;
  state: ListState;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  renderCard: (review: SafetyReviewSummary) => ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <SectionHeading id={id} title={title} description={description} />
      {state.status === "loading" ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : state.status === "error" ? (
        <AlertBanner tone="error" title={`Could not load ${title.toLowerCase()}`}>
          {state.message}
          <div className="mt-3"><Button variant="secondary" onClick={onRetry}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : state.reviews.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {state.reviews.map((review) => <li key={review.reviewId} className="grid">{renderCard(review)}</li>)}
        </ul>
      )}
    </section>
  );
}

function Counter({ value, label, highlight = false }: { value: number | null; label: string; highlight?: boolean }) {
  return (
    <span className={`rounded-control px-3 py-2 text-xs ${highlight ? "bg-primary-fixed text-primary" : "bg-surface-container-low text-on-surface-variant"}`}>
      <strong className="block font-mono text-xl font-bold text-primary">{value ?? "–"}</strong>{label}
    </span>
  );
}

// SPM-243 AC3/AC4: the Safety Officer's /dashboard. "My reviews" holds the
// rounds this officer claimed; "Awaiting review" is the shared queue, oldest
// submission first. A claim is shown only after the backend confirms it.
export function SafetyOfficerDashboard() {
  const [attempt, setAttempt] = useState(0);
  const mine = useReviewList(listMySafetyReviews, attempt);
  const queue = useReviewList(listSafetyQueue, attempt);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const claim = async (review: SafetyReviewSummary) => {
    setClaiming(review.reviewId);
    setNotice(null);
    try {
      await claimSafetyReview(review.reviewId);
      setNotice({ tone: "success", title: "Review claimed", message: `“${review.title}” is now in My reviews.`, eventId: review.eventId });
    } catch (caught) {
      const refusal = describeSafetyError(caught instanceof ApiError ? caught : {});
      setNotice({ tone: refusal.tone, title: refusal.title, message: refusal.message });
    } finally {
      setClaiming(null);
      reload();
    }
  };

  const mineCount = mine.status === "ready" ? mine.reviews.length : null;
  const queueCount = queue.status === "ready" ? queue.reviews.length : null;

  return (
    <PageContent
      eyebrow={ROLE_LABELS.SAFETY_OFFICER}
      title={`${ROLE_LABELS.SAFETY_OFFICER} dashboard`}
      description="Claim an event awaiting its operational safety check, work through the six-factor checklist, then approve, request changes or reject venue bookings."
      action={
        <div className="flex flex-wrap gap-2">
          <Counter value={mineCount} label="My reviews" highlight={Boolean(mineCount)} />
          <Counter value={queueCount} label="Awaiting review" />
        </div>
      }
    >
      <div aria-live="polite" role="status">
        {notice ? (
          <AlertBanner tone={notice.tone} title={notice.title} live={false}>
            {notice.message}
            {notice.eventId ? (
              <div className="mt-3">
                <Link href={`/events/${notice.eventId}`} className={buttonClasses("primary")}>
                  Open review<Icon name="arrow-forward" size={16} />
                </Link>
              </div>
            ) : null}
          </AlertBanner>
        ) : null}
      </div>

      <div className="grid gap-8">
        <ReviewList
          id="my-reviews-heading"
          title="My reviews"
          description="Reviews you have claimed and not yet decided."
          state={mine}
          emptyTitle="No reviews claimed"
          emptyDescription="Claim a review from Awaiting review to start its safety check."
          onRetry={reload}
          renderCard={(review) => <ReviewCard review={review} />}
        />
        <ReviewList
          id="awaiting-review-heading"
          title="Awaiting review"
          description="Open reviews nobody has claimed, oldest submission first. Any Safety Officer may claim one."
          state={queue}
          emptyTitle="Nothing awaiting review"
          emptyDescription="When a coordinator submits an event for safety review, it appears here."
          onRetry={reload}
          renderCard={(review) => (
            <ReviewCard
              review={review}
              claiming={claiming === review.reviewId}
              claimDisabled={claiming !== null}
              onClaim={() => void claim(review)}
            />
          )}
        />
      </div>
    </PageContent>
  );
}
