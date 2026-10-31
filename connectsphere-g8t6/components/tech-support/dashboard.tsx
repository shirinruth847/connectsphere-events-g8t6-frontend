"use client";

import Link from "next/link";
import { PageContent } from "@/components/layout/page-content";
import { SectionCard, buttonClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { ROLE_LABELS, ROUTES } from "@/lib/auth";
import { TechnicalRequestList } from "./technical-requests/technical-request-list";

// /dashboard for Technical Support: technical requests to review (SPM-287) and
// the way into the equipment catalogue (SPM-52).
export function TechSupportDashboard() {
  return <PageContent
    title={`${ROLE_LABELS.TECH_SUPPORT} dashboard`}
    eyebrow={ROLE_LABELS.TECH_SUPPORT}
    description="Review technical requests from event coordinators and keep the equipment catalogue up to date."
    // The Updates button and panel shared with the other inbox roles (SPM-287).
    action={<NotificationsBell />}
  >
    <TechnicalRequestList />
    <SectionCard className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-on-surface">Equipment catalogue</h2>
        <p className="text-sm text-on-surface-variant">Add equipment, update stock and record damaged or maintenance stock.</p>
      </div>
      <Link href={ROUTES.equipment} className={buttonClasses("secondary")}>Open Equipment<Icon name="arrow-forward" size={16} /></Link>
    </SectionCard>
  </PageContent>;
}
