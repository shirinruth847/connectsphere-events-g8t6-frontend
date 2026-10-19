"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { type CalendarCoordinator } from "@/components/calendar/calendar-view";
import { CoordinatorAvailabilityCalendar } from "@/components/calendar/coordinator-availability-calendar";
import { CoordinatorShell } from "@/components/layout/coordinator-shell";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner } from "@/components/shared/primitives";
import { getCurrentUser, getCoordinatorAvailability } from "@/lib/api/events";
import { useAuth } from "@/components/auth/auth-provider";

type AuthState = "loading" | "ready" | "forbidden" | "error";

export default function CalendarPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [coordinators, setCoordinators] = useState<CalendarCoordinator[]>([]);
  const [userName, setUserName] = useState("Loading…");
  const [userEmail, setUserEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      // Redirect decisions come from the single source of truth (AuthProvider)
      // and only run once auth state has finished loading.
      if (loading) return;
      const token = session?.access_token ?? null;
      if (!token) {
        router.replace("/login");
        return;
      }
      try {
        const result = await getCurrentUser(token);
        if (result.user.role !== "COORDINATOR_LEAD") {
          setAuthState("forbidden");
          return;
        }
        setUserName(result.user.name);
        setUserEmail(result.user.email);
        const availability = await getCoordinatorAvailability(token);
        if (!mounted) return;
        setCoordinators(
          availability.coordinators.map((c) => ({
            coordinatorId: c.coordinatorId,
            name: c.name,
            events: c.events.map((e) => ({
              eventId: e.eventId,
              title: e.title,
              startDatetime: e.startDatetime,
              endDatetime: e.endDatetime,
              coordinatorId: c.coordinatorId,
              coordinatorName: c.name,
              isRequested: false,
              status: e.status,
              requestId: e.requestId,
              expectedAttendance: e.expectedAttendance,
              organisation: e.organisation?.name ?? null,
              createdAt: e.createdAt,
            })),
          }))
        );
        setAuthState("ready");
      } catch (loadError) {
        if (!mounted) return;
        setError((loadError as Error).message);
        setAuthState("error");
      }
    };
    void run();
    return () => { mounted = false; };
  }, [session, loading, router]);

  if (authState === "loading") {
    return (
      <CoordinatorShell userName={userName} userEmail={userEmail}>
        <div className="empty-state">
          <h2>Loading calendar…</h2>
        </div>
      </CoordinatorShell>
    );
  }

  if (authState === "forbidden") {
    return (
      <CoordinatorShell userName={userName} userEmail={userEmail}>
        <div className="access-denied">
          <div className="access-card">
            <span className="eyebrow">ACCESS DENIED</span>
            <h1>Lead access required</h1>
            <p>This calendar is restricted to Event Coordinator Leads.</p>
          </div>
        </div>
      </CoordinatorShell>
    );
  }

  if (authState === "error") {
    return (
      <CoordinatorShell userName={userName} userEmail={userEmail}>
        <PageContent eyebrow="COORDINATOR LEAD" title="Coordinator calendar" description="Review each coordinator’s scheduled events and availability.">
          <AlertBanner tone="error" title="Unable to load calendar">{error}</AlertBanner>
        </PageContent>
      </CoordinatorShell>
    );
  }

  return (
    <CoordinatorShell userName={userName} userEmail={userEmail}>
      <PageContent eyebrow="COORDINATOR LEAD" title="Coordinator calendar" description="Review each coordinator’s scheduled events and availability.">
        <CoordinatorAvailabilityCalendar coordinators={coordinators} />
      </PageContent>
    </CoordinatorShell>
  );
}
