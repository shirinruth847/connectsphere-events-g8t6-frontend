"use client";

import { useCallback, useEffect, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { openedStorageKey, parseOpenedRecord, recordOpened, type OpenedRecord } from "./booking-filters";

const read = (key: string | null): OpenedRecord => {
  if (!key) return {};
  try {
    return parseOpenedRecord(window.localStorage.getItem(key));
  } catch {
    return {};
  }
};

// When this viewer last opened each booking, kept in this browser only (a
// per-viewer convenience for the "Last opened" sort; nothing depends on it).
export function useOpenedBookings() {
  const user = useSessionUser();
  const key = user ? openedStorageKey(user.user_id) : null;
  const [record, setRecord] = useState<OpenedRecord>({});

  useEffect(() => {
    // Storage is only readable in the browser, after the session is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecord(read(key));
  }, [key]);

  const markOpened = useCallback((bookingId: number) => {
    if (!key) return;
    const next = recordOpened(read(key), bookingId, Date.now());
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private mode or full storage: the sort simply has nothing recorded.
    }
    setRecord(next);
  }, [key]);

  return { opened: record, markOpened };
}
