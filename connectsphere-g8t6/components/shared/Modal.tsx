"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Sits beside the title, e.g. a status chip. */
  headerAccessory?: ReactNode;
  footer?: ReactNode;
  /** `drawer` slides in from the right edge (mobile navigation). */
  variant?: "dialog" | "drawer";
  className?: string;
}

/**
 * Built on the native <dialog>: showModal() makes the page inert, traps focus,
 * closes on Escape and restores focus to the opener when it closes.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  headerAccessory,
  footer,
  variant = "dialog",
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog element itself (not its content) is a backdrop click.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "flex-col bg-surface-container-lowest text-on-surface shadow-elevation-4 backdrop:bg-on-surface/40 backdrop:backdrop-blur-xs open:flex motion-reduce:animate-none",
        variant === "dialog" &&
          "m-auto max-h-[min(90dvh,48rem)] w-[calc(100%-2rem)] max-w-2xl animate-panel-in rounded-card",
        variant === "drawer" &&
          "my-0 mr-0 ml-auto h-dvh max-h-dvh w-80 max-w-[calc(100%-3rem)] animate-drawer-in",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-outline-variant/60 px-5 py-4">
        <div className="flex min-w-0 flex-col items-start gap-2">
          {headerAccessory}
          <h2 id={titleId} className="text-title font-bold text-on-surface">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-container-low text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high pointer-coarse:size-11"
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? (
        <footer className="border-t border-outline-variant/60 bg-surface-container-lowest px-5 py-4">
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}
