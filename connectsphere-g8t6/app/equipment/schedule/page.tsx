import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { EquipmentScheduleView } from "@/components/tech-support/equipment/equipment-schedule";

export const metadata: Metadata = { title: "Equipment schedule | ConnectSphere" };

// The equipment schedule is for Technical Support only; the backend enforces it too.
export default function EquipmentSchedulePage() {
  return (
    <DashboardWorkspace role="TECH_SUPPORT">
      <PageContent title="Equipment schedule" eyebrow="Technical Support" description="Dates with events that have pending or approved equipment, in Singapore time.">
        <EquipmentScheduleView />
      </PageContent>
    </DashboardWorkspace>
  );
}
