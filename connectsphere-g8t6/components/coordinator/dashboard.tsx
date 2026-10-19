"use client";

import { AssignedEventsList } from "@/components/coordinator/assigned-events-list";

// The coordinator's /dashboard: the events a Lead has assigned to them (SPM-33).
export function CoordinatorDashboard() {
  return <AssignedEventsList />;
}
