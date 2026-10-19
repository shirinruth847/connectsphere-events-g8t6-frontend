import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { SectionCard } from "@/components/shared/primitives";

export default function AssignmentsPage() {
  return (
    <DashboardWorkspace role="COORDINATOR_LEAD">
      <PageContent title="Assignments" eyebrow="Event Coordinator Lead">
        <SectionCard>
          <h2 className="text-xl font-semibold">Covered in later scope</h2>
          <p className="mt-2 text-on-surface-variant">Assignment oversight is out of scope for SPM-174.</p>
        </SectionCard>
      </PageContent>
    </DashboardWorkspace>
  );
}
