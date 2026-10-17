import { CoordinatorShell } from "@/components/layout/coordinator-shell";

export default function AssignmentsPage() {
  return (
    <CoordinatorShell userName="Coordinator Lead" userEmail="coordinator@connectsphere.test">
      <div className="empty-state">
        <h1>Covered in later scope</h1>
        <p>Assignment oversight is out of scope for SPM-174.</p>
      </div>
    </CoordinatorShell>
  );
}
