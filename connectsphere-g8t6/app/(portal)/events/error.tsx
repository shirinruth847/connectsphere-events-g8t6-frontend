"use client";

import { useEffect } from "react";
import { AlertBanner } from "@/components/feedback/AlertBanner";
import { Button } from "@/components/shared/Button";

export default function EventsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-page px-4 pt-5 pb-12 md:px-6">
      <AlertBanner
        title="Events couldn't be loaded"
        action={
          <Button variant="destructive" onClick={retry}>
            Try again
          </Button>
        }
      >
        Something went wrong while fetching events. Please try again in a moment.
      </AlertBanner>
    </div>
  );
}
