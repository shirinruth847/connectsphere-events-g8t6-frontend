"use client";

import { PageContent } from "@/components/layout/page-content";
import { EventAssignmentQueue } from "@/components/coordinator-lead/event-assignment-queue";
import { ROLE_LABELS } from "@/lib/auth";

// The queue's search, filters and sort replace the old workspace links; the
// navigation panel already has Unassigned Queue, Assignments and Calendar
// (developer request, 1 November 2026).
export function CoordinatorLeadDashboard() {
  return <PageContent
    title={`${ROLE_LABELS.COORDINATOR_LEAD} dashboard`}
    eyebrow={ROLE_LABELS.COORDINATOR_LEAD}
    description="Review submitted event requests and coordinator availability."
  >
    <EventAssignmentQueue filters />
  </PageContent>;
}
