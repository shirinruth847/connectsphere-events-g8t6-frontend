"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { apiRequest, ApiError } from "@/lib/api";
import { getSupabaseBrowserClient, SupabaseConfigurationError } from "@/lib/supabase";
import { ATTENDEE_SIGN_IN_PATH, type AttendeeProfile } from "./attendee-event-discovery";

type SwitchState =
  | { status: "loading" }
  | { status: "attendee"; profile: AttendeeProfile }
  | { status: "other" }
  | { status: "configuration" }
  | { status: "error"; message: string };

interface AuthMeResponse {
  user: { name?: string; email?: string; role?: string; roles?: string[] };
}

// /events is role-scoped (Master section 3.4): attendees get Event Discovery,
// everyone else keeps the existing Coordinator Lead queue, which runs its own
// access check. The role only chooses what to render; the backend still
// authorises every request.
export function EventsRoleSwitch({
  lead,
  attendee,
}: {
  lead: ReactNode;
  attendee: (profile: AttendeeProfile) => ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<SwitchState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().auth.getSession();
        if (error) throw error;
        if (!data.session) {
          router.replace(ATTENDEE_SIGN_IN_PATH);
          return;
        }
        const { user } = await apiRequest<AuthMeResponse>("/auth/me");
        const roles = user.roles ?? [user.role].filter((role): role is string => Boolean(role));
        if (!alive) return;
        setState(
          roles.includes("ATTENDEE")
            ? {
                status: "attendee",
                profile: {
                  name: user.name?.trim() || data.session.user.email?.split("@")[0] || "Attendee",
                  email: user.email || data.session.user.email || "",
                },
              }
            : { status: "other" },
        );
      } catch (caught) {
        if (!alive) return;
        if (caught instanceof SupabaseConfigurationError) {
          setState({ status: "configuration" });
        } else if (caught instanceof ApiError && caught.status === 401) {
          // No active ConnectSphere profile for this session.
          await getSupabaseBrowserClient().auth.signOut();
          router.replace(ATTENDEE_SIGN_IN_PATH);
        } else {
          setState({ status: "error", message: caught instanceof Error ? caught.message : "Could not verify your account." });
        }
      }
    };
    void check();
    return () => {
      alive = false;
    };
  }, [retry, router]);

  if (state.status === "attendee") return attendee(state.profile);
  if (state.status === "other") return lead;
  if (state.status === "configuration") {
    return (
      <main className="mx-auto mt-16 w-full max-w-xl p-5">
        <AlertBanner title="Authentication setup is incomplete" tone="warning">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (or{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) to the frontend environment file, then restart Next.js.
        </AlertBanner>
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="mx-auto mt-16 w-full max-w-xl p-5">
        <AlertBanner title="Could not open events" tone="error">
          {state.message}
          <div className="mt-3">
            <Button
              variant="danger"
              className="max-lg:min-h-11"
              onClick={() => {
                setState({ status: "loading" });
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </div>
        </AlertBanner>
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-6" aria-busy="true" aria-label="Checking your session">
      <Skeleton className="h-12 w-1/2" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
