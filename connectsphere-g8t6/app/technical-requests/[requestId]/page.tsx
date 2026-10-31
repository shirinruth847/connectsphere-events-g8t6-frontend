import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { TechnicalRequestDetailView } from "@/components/tech-support/technical-requests/technical-request-detail";

export const metadata: Metadata = { title: "Technical request | ConnectSphere" };

const parseRequestId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

// A technical request (SPM-287) is reviewed by Technical Support only; the backend enforces it too.
export default async function TechnicalRequestPage({ params }: PageProps<"/technical-requests/[requestId]">) {
  const { requestId } = await params;
  return (
    <DashboardWorkspace role="TECH_SUPPORT">
      <TechnicalRequestDetailView requestId={parseRequestId(requestId)} />
    </DashboardWorkspace>
  );
}
