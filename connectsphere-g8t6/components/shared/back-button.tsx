"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/shared/icon";

// Goes back to the page the user came from; a page opened directly (a new tab
// or a pasted link) has nothing to go back to, so it opens the fallback
// instead (developer request, 1 November 2026: Venue Staff pages below the
// main dashboards).
export function BackButton({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon name="arrow-back" size={16} />{label}
    </button>
  );
}
