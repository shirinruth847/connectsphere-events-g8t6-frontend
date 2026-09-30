import Image from "next/image";
import Link from "next/link";
import { NAV_ITEMS, ROLE_LABELS } from "@/lib/navigation";
import type { SessionUser } from "@/lib/auth/session";
import { buttonClasses } from "@/components/shared/Button";
import { MobileNav } from "./MobileNav";
import { NavLinks } from "./NavLinks";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Sticky role-scoped top navigation. Only the active role's destinations are shown. */
export function TopNav({ user }: { user: SessionUser }) {
  const items = NAV_ITEMS[user.activeRole];
  const roleLabel = ROLE_LABELS[user.activeRole];

  return (
    <header className="sticky top-0 z-30 bg-surface-container-lowest/90 shadow-elevation-2 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-5">
          <Link href="/events" className="flex items-center gap-2 rounded-chip">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8" />
            <span className="text-title-sm font-bold tracking-tight text-on-surface">
              ConnectSphere
            </span>
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <NavLinks items={items} />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* INTEGRATION: sign out through Supabase Auth once lib/auth exists.
              Hidden via a wrapper: buttonClasses already sets a display value. */}
          <div className="hidden md:block">
            <Link href="/login" className={buttonClasses({ variant: "destructive", size: "sm" })}>
              Log Out
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-right lg:flex lg:flex-col">
              <span className="text-body-sm font-bold text-on-surface">{user.name}</span>
              <span className="text-label text-on-surface-variant">{roleLabel}</span>
            </span>
            <span
              role="img"
              aria-label={`${user.name}, ${roleLabel}`}
              className="flex size-8 items-center justify-center rounded-card bg-primary-fixed text-label font-bold text-on-primary-fixed"
            >
              {initials(user.name)}
            </span>
          </div>
          <MobileNav items={items} userName={user.name} roleLabel={roleLabel} />
        </div>
      </div>
    </header>
  );
}
