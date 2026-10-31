"use client";

import Link from "next/link";
import { PageContent } from "@/components/layout/page-content";
import { SectionCard, buttonClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { ROLE_LABELS, ROUTES } from "@/lib/auth";
import { TechnicalRequestList } from "./technical-requests/technical-request-list";

// /dashboard for Technical Support: the way into the equipment catalogue (SPM-52)
// and schedule, then the technical requests to review (SPM-287).
export function TechSupportDashboard() {
  return <PageContent
    title={`${ROLE_LABELS.TECH_SUPPORT} dashboard`}
    eyebrow={ROLE_LABELS.TECH_SUPPORT}
    description="Review technical requests from event coordinators and keep the equipment catalogue up to date."
    // The Updates button and panel shared with the other inbox roles (SPM-287).
    action={<NotificationsBell />}
  >
    {/* The catalogue and schedule come first, above the requests to review. */}
    <SectionCard className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-on-surface">Equipment catalogue</h2>
        <p className="text-sm text-on-surface-variant">Add equipment, update stock and record damaged or maintenance stock, or see which dates have equipment booked.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={ROUTES.equipmentSchedule} className={buttonClasses("quiet")}><Icon name="calendar" size={16} />Equipment schedule</Link>
        <Link href={ROUTES.equipment} className={buttonClasses("secondary")}>Open Equipment<Icon name="arrow-forward" size={16} /></Link>
      </div>
    </SectionCard>
    <TechnicalRequestList />
  </PageContent>;
}
