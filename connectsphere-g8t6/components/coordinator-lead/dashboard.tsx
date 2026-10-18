"use client";

import { PageContent } from "@/components/layout/page-content";
import { SectionCard } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";

export function CoordinatorLeadDashboard() {
  return <PageContent title={`${ROLE_LABELS.COORDINATOR_LEAD} dashboard`} eyebrow={ROLE_LABELS.COORDINATOR_LEAD}>
    <SectionCard>
      <h2 className="text-xl font-semibold">Your workspace</h2>
      <p>Coordinator assignment tools are not available in this workspace.</p>
    </SectionCard>
  </PageContent>;
}
