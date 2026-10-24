import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { EquipmentDetailManager } from "@/components/tech-support/equipment/equipment-detail";

export const metadata: Metadata = { title: "Manage equipment | ConnectSphere" };

const parseEquipmentId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

// Equipment maintenance (SPM-52) is for Technical Support only; the backend enforces it too.
export default async function ManageEquipmentPage({ params }: PageProps<"/equipment/[equipmentId]">) {
  const { equipmentId } = await params;
  return (
    <DashboardWorkspace role="TECH_SUPPORT">
      <EquipmentDetailManager equipmentId={parseEquipmentId(equipmentId)} />
    </DashboardWorkspace>
  );
}
