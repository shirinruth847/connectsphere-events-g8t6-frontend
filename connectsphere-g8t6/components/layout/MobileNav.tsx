"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavItem } from "@/lib/navigation";
import { buttonClasses } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { NavLinks } from "./NavLinks";

interface MobileNavProps {
  items: NavItem[];
  userName: string;
  roleLabel: string;
}

export function MobileNav({ items, userName, roleLabel }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex size-11 items-center justify-center rounded-control text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low md:hidden"
      >
        <Icon name="menu" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Menu" variant="drawer">
        {/* Closing on any click inside the nav hands focus to the new page cleanly. */}
        <nav aria-label="Main" onClick={() => setOpen(false)} className="flex flex-col gap-6">
          <NavLinks items={items} orientation="vertical" />
          <div className="flex flex-col gap-3 border-t border-outline-variant/60 pt-4">
            <p className="flex flex-col">
              <span className="text-body font-bold text-on-surface">{userName}</span>
              <span className="text-body-sm text-on-surface-variant">{roleLabel}</span>
            </p>
            <Link href="/login" className={buttonClasses({ variant: "destructive", className: "w-full" })}>
              Log Out
            </Link>
          </div>
        </nav>
      </Modal>
    </>
  );
}
