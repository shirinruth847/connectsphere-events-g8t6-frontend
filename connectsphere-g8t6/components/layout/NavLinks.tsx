"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation";

interface NavLinksProps {
  items: NavItem[];
  orientation?: "horizontal" | "vertical";
}

export function NavLinks({ items, orientation = "horizontal" }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <ul className={cn("flex", orientation === "horizontal" ? "items-center gap-5" : "flex-col gap-1")}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-body transition-colors duration-150 ease-out",
                active ? "font-bold text-primary" : "font-semibold text-on-surface-variant hover:text-on-surface",
                orientation === "horizontal" &&
                  "relative flex h-16 items-center after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150",
                orientation === "horizontal" && (active ? "after:bg-primary" : "after:bg-transparent"),
                orientation === "vertical" &&
                  cn("flex min-h-11 items-center rounded-control px-3", active ? "bg-primary-fixed" : "hover:bg-surface-container-low"),
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
