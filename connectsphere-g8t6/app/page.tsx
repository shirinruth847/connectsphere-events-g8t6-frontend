"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  // Only redirect once auth state has finished loading, and only for
  // authenticated users. Unauthenticated users stay on "/" instead of being
  // bounced back and forth with /events.
  useEffect(() => {
    if (loading || !session) return;
    router.replace("/events");
  }, [session, loading, router]);

  return null;
}
