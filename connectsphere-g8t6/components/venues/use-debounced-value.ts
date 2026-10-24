"use client";

import { useEffect, useState } from "react";

// Search as you type: the value settles after `delay` ms without typing, so a
// request is not sent on every key press.
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
