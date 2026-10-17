"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./client";

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; data: T };

// Minimal fetch-on-mount state for one backend resource. Components using it
// sit under the protected layout, which remounts them per signed-in user, so
// one user's data never survives into another user's session.
export function useApiResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal)
      .then((data) => setState({ status: "success", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError =
          error instanceof ApiError ? error : new ApiError(0, "SERVER_ERROR", "Something went wrong. Please try again.");
        setState({ status: "error", error: apiError });
      });

    return () => controller.abort();
  }, [load, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
