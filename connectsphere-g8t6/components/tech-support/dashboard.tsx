"use client";

import Link from "next/link";
import { PageContent } from "@/components/layout/page-content";
import { SectionCard, buttonClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ROLE_LABELS, ROUTES } from "@/lib/auth";

export function TechSupportDashboard() {
  return <PageContent title={`${ROLE_LABELS.TECH_SUPPORT} dashboard`} eyebrow={ROLE_LABELS.TECH_SUPPORT}>
    <SectionCard>
      <h2 className="text-xl font-semibold">Your workspace</h2>
      <p>Review technical requirements within your assigned event scope.</p>
    </SectionCard>
    <SectionCard className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-on-surface">Equipment catalogue</h2>
        <p className="text-sm text-on-surface-variant">Add equipment, update stock and record damaged or maintenance stock.</p>
      </div>
      <Link href={ROUTES.equipment} className={buttonClasses("secondary")}>Open Equipment<Icon name="arrow-forward" size={16} /></Link>
    </SectionCard>
  </PageContent>;
}
