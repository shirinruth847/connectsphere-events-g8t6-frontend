"use client";

import { useState, type ReactNode } from "react";
import styles from "./collapse.module.css";

// A panel that eases open and closed. While closing it stays mounted (inert,
// so it cannot be focused) until the closing animation ends, then unmounts.
export function Collapse({ open, id, className = "", children }: { open: boolean; id?: string; className?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  // Opening mounts at once (adjusting state during render, not in an effect).
  if (open && !mounted) setMounted(true);
  if (!open && !mounted) return null;

  return (
    <div
      id={id}
      inert={!open}
      data-state={open ? "open" : "closing"}
      className={`${styles.panel} ${open ? styles.opening : styles.closing}`}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !open) setMounted(false);
      }}
    >
      <div className={`${styles.inner} ${className}`}>{children}</div>
    </div>
  );
}
