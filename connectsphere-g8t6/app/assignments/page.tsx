"use client";

import { CoordinatorShell } from "@/components/layout/coordinator-shell";

export default function AssignmentsPage() {
  return (
    <CoordinatorShell userName="Coordinator Lead" userEmail="coordinator@connectsphere.test">
      <div className="content">
        <section className="page-header">
          <div>
            <span className="eyebrow">ASSIGNMENTS</span>
            <h1>Assignments</h1>
            <p>Covered in a later scope</p>
          </div>
        </section>
      </div>
    </CoordinatorShell>
  );
}
