"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { ATTENDEE_SIGN_IN_PATH, type AttendeeProfile } from "./attendee-session";

// Attendee sidebar that mirrors CoordinatorShell (components/layout/
// coordinator-shell.tsx): same structure and global .sidebar classes, so both
// roles look alike. Kept separate because PRs #2/#3 edit CoordinatorShell; the
// two should later share one sidebar component and be reconciled with PR #4's
// attendee shell.

type NavIconName = "event" | "registrations" | "logout" | "menu" | "close";

// Same outline paths as the coordinator and organiser shells.
function NavIcon({ name, className = "" }: { name: NavIconName; className?: string }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<NavIconName, ReactNode> = {
    event: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m9 15 2 2 4-4" /></>,
    registrations: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h1M16 14l2 2 3.5-4" /><path d="M14 8h6M17 5v6" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function ChevronIcon() {
  return (
    <svg className="sidebar-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

// Only routes that attendees use. /my-registrations is added by PR #4
// (SPM-123) and is not on main yet; there is no attendee settings page.
const groups: Array<{ title: string; items: Array<{ title: string; icon: NavIconName; href: string }> }> = [
  { title: "Main Navigation", items: [
    { title: "Event Discovery", icon: "event", href: "/events" },
    { title: "My Events", icon: "registrations", href: "/my-registrations" },
  ] },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("");

export function AttendeeShell({ children, profile }: { children: ReactNode; profile: AttendeeProfile }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ "Main Navigation": true });
  const pathname = usePathname();
  const router = useRouter();
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  const closeMenu = () => setOpen(false);
  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };
  const logout = async () => {
    setSigningOut(true);
    try { await getSupabaseBrowserClient().auth.signOut(); } finally { router.replace(ATTENDEE_SIGN_IN_PATH); }
  };

  // Drawer focus: move into it on open; Escape closes it and returns focus to
  // the menu button.
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const sidebar = (
    <aside className="sidebar sidebar--sticky" aria-label="Attendee sidebar">
      <Link href="/events" className="sidebar-brand" onClick={closeMenu} aria-label="ConnectSphere home">
        <span className="sidebar-logo" aria-hidden="true">
          <span className="text-[22px] font-extrabold text-primary-container">C</span>
        </span>
        <span className="sidebar-title">ConnectSphere</span>
      </Link>

      {/* A div with the navigation role: globals.css gives every <nav> `order: 3`
          below 760px, which would push the links under the user card. */}
      <div role="navigation" aria-label="Main navigation">
        {groups.map((group) => (
          <section key={group.title} className="sidebar-section">
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection(group.title)}
              aria-expanded={expandedSections[group.title]}
              type="button"
            >
              {group.title}
              <ChevronIcon />
            </button>
            <ul className="sidebar-links" hidden={!expandedSections[group.title]}>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.title}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      onClick={closeMenu}
                      className={`sidebar-link${active ? " active" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <NavIcon name={item.icon} className="sidebar-link-icon" />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <div className="sidebar-avatar" aria-label={`${profile.name} profile picture`} role="img">
            {initials(profile.name)}
          </div>
          <div className="sidebar-user-details">
            <span className="sidebar-user-name">{profile.name}</span>
            <span className="sidebar-user-role" title={profile.email || undefined}>{profile.email || "Attendee"}</span>
          </div>
        </div>
        <button onClick={logout} disabled={signingOut} className="sidebar-signout" type="button">
          <NavIcon name="logout" className="sidebar-link-icon" />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen w-full bg-surface lg:flex">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-primary-container px-4 text-on-primary shadow-sm lg:hidden">
        <Link className="font-extrabold tracking-tight" href="/events">ConnectSphere</Link>
        <button
          ref={menuButton}
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="attendee-drawer"
          className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => setOpen(!open)}
        >
          <NavIcon name={open ? "close" : "menu"} />
        </button>
      </header>
      {open && <button type="button" tabIndex={-1} aria-label="Close navigation" className="fixed inset-0 z-30 bg-on-surface/30 lg:hidden" onClick={closeMenu} />}
      {/* Unlike CoordinatorShell, the open menu sits above its overlay as a
          left drawer, so its links stay clickable on small screens. */}
      {open && (
        <div id="attendee-drawer" ref={drawer} className="fixed inset-y-0 left-0 z-40 flex w-[244px] max-w-[85vw] overflow-y-auto p-3 lg:hidden">
          {sidebar}
        </div>
      )}
      <div className="hidden shrink-0 lg:block">{sidebar}</div>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-7 lg:px-8">
        <div className="mx-auto w-full max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
