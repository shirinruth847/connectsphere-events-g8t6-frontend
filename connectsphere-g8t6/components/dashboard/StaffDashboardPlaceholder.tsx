import { EmptyState } from "@/components/ui/EmptyState";

// Temporary content for staff dashboards whose designs and workflows belong
// to later tickets. Replace per role without touching the auth shell.
export function StaffDashboardPlaceholder({ area }: { area: string }) {
  return (
    <EmptyState title={`${area} will appear here`}>
      This workspace is still being built. You are signed in and can return here at any time.
    </EmptyState>
  );
}
