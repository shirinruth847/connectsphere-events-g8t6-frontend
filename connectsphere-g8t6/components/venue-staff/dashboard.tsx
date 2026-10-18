"use client";

import { PageContent } from "@/components/layout/page-content";
import { SectionCard } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";

export function VenueStaffDashboard() {
  return <PageContent title={`${ROLE_LABELS.VENUE_STAFF} dashboard`} eyebrow={ROLE_LABELS.VENUE_STAFF}>
    <SectionCard>
      <h2 className="text-xl font-semibold">Your workspace</h2>
      <p>Manage venue operations within your permitted venue scope.</p>
    </SectionCard>
  </PageContent>;
}
