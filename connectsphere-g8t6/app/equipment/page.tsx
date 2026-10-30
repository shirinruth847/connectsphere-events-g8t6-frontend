import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { EquipmentList } from "@/components/tech-support/equipment/equipment-list";

export const metadata: Metadata = { title: "Equipment | ConnectSphere" };

// Equipment catalogue (SPM-52) is for Technical Support only; the backend enforces it too.
export default function EquipmentPage() {
  return (
    <DashboardWorkspace role="TECH_SUPPORT">
      <PageContent title="Equipment" eyebrow="Technical Support" description="The equipment catalogue: stock, details, unavailable stock and active status.">
        <EquipmentList />
      </PageContent>
    </DashboardWorkspace>
  );
}
