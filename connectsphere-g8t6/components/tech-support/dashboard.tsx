"use client";

import { PageContent } from "@/components/layout/page-content";
import { SectionCard } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";

export function TechSupportDashboard() {
  return <PageContent title={`${ROLE_LABELS.TECH_SUPPORT} dashboard`} eyebrow={ROLE_LABELS.TECH_SUPPORT}>
    <SectionCard>
      <h2 className="text-xl font-semibold">Your workspace</h2>
      <p>Review technical requirements within your assigned event scope.</p>
    </SectionCard>
  </PageContent>;
}
