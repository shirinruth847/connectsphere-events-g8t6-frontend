"use client";

import { PageContent } from "@/components/layout/page-content";
import { SectionCard } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";
import Link from "next/link";

export function CoordinatorLeadDashboard() {
  return <PageContent title={`${ROLE_LABELS.COORDINATOR_LEAD} dashboard`} eyebrow={ROLE_LABELS.COORDINATOR_LEAD}>
    <SectionCard>
      <h2 className="text-xl font-semibold">Your workspace</h2>
      <p>Review submitted event requests, assign coordinators, and check their availability.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/events" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">Open unassigned queue</Link>
        <Link href="/calendar" className="inline-flex min-h-11 items-center rounded-control bg-surface-container-low px-4 py-2.5 text-sm font-semibold text-primary">Coordinator calendar</Link>
        <Link href="/assignments" className="inline-flex min-h-11 items-center rounded-control bg-surface-container-low px-4 py-2.5 text-sm font-semibold text-primary">Assignments</Link>
      </div>
    </SectionCard>
  </PageContent>;
}
