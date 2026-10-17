import { CoordinatorShell } from "@/components/layout/coordinator-shell";

export default function EventRequestPage() {
  return (
    <CoordinatorShell userName="Coordinator Lead" userEmail="coordinator@connectsphere.test">
      <div className="empty-state">
        <h1>Covered in later scope</h1>
        <p>Event request details are out of scope for SPM-174.</p>
      </div>
    </CoordinatorShell>
  );
}
