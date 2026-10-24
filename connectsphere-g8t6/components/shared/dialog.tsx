"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/shared/icon";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  // Shown beside the title, e.g. a status chip.
  badge?: ReactNode;
  // Header buttons placed before the close button, e.g. a primary action on the item shown.
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

// Modal built on the native <dialog>: showModal() traps focus, Escape closes it,
// and focus returns to whatever opened it.
export function Dialog({ open, onClose, title, badge, actions, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Keeps the browser's top-layer dialog in step with the `open` prop.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(640px,calc(100vw-32px))] max-h-[calc(100vh-48px)] rounded-panel bg-surface-container-lowest p-0 text-on-surface shadow-elevation-4 backdrop:bg-on-surface/40 backdrop:backdrop-blur-sm open:flex open:flex-col"
    >
      <header className="flex items-start justify-between gap-4 border-b border-outline-variant/60 px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id={titleId} className="text-lg font-bold leading-tight text-on-surface">{title}</h2>
          {badge}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Icon name="close" size={20} label="Close dialog" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-outline-variant/60 px-5 py-4">{footer}</footer> : null}
    </dialog>
  );
}
