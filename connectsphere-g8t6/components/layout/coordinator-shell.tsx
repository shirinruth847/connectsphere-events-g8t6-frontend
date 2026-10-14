"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type NavIconName = "dashboard" | "event" | "assignments" | "calendar" | "logout" | "menu" | "close" | "settings";

function NavIcon({ name, className = "" }: { name: NavIconName; className?: string }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<NavIconName, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    event: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m9 15 2 2 4-4" /></>,
    assignments: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.7a7 7 0 0 1-1.7 1l-.3 1.9h-2.8l-.3-1.9a7 7 0 0 1-1.7-1l-1.8.7-1.4-2.4 1.5-1.2a7 7 0 0 1 0-2l-1.5-1.2 1.4-2.4 1.8.7a7 7 0 0 1 1.7-1l.3-1.9h2.8l.3 1.9a7 7 0 0 1 1.7 1l1.8-.7 1.4 2.4-1.5 1.2a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)" /></>,
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

const groups: Array<{ title: string; items: Array<{ title: string; icon: NavIconName; href?: string }> }> = [
  { title: "Main Navigation", items: [
    { title: "Unassigned Queue", icon: "event", href: "/events" },
    { title: "Assignments", icon: "assignments", href: "/assignments" },
    { title: "Calendar", icon: "calendar", href: "/calendar" },
  ] },
  { title: "Account", items: [
    { title: "Settings", icon: "settings", href: "/settings" },
  ] },
];

export function CoordinatorShell({ children, userName, userEmail }: { children: ReactNode; userName: string; userEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ "Main Navigation": true, Account: true });
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    try { await getSupabaseBrowserClient().auth.signOut(); } finally { router.replace("/"); }
  };
  const closeMenu = () => setOpen(false);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const sidebar = (
    <aside className="sidebar sidebar--sticky" aria-label="Main navigation">
      <Link href="/events" className="sidebar-brand" onClick={closeMenu} aria-label="ConnectSphere home">
        <span className="sidebar-logo" aria-hidden="true">
          <span className="text-[22px] font-extrabold text-[#4f46e5]">C</span>
        </span>
        <span className="sidebar-title">ConnectSphere</span>
      </Link>

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
              return item.href ? (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    onClick={closeMenu}
                    className={`sidebar-link${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <NavIcon name={item.icon} className="sidebar-link-icon" />
                    {item.title}
                  </Link>
                </li>
              ) : (
                <li key={item.title}>
                  <span className="sidebar-link" aria-disabled="true">
                    <NavIcon name={item.icon} className="sidebar-link-icon" />
                    {item.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <div
            className="sidebar-avatar"
            aria-label={`${userName} profile picture`}
            role="img"
          >
            {userName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}
          </div>
          <div className="sidebar-user-details">
            <span className="sidebar-user-name">{userName}</span>
            <span className="sidebar-user-role">{userEmail || "Event Coordinator Lead"}</span>
          </div>
        </div>
        <button onClick={logout} className="sidebar-signout" type="button">
          <NavIcon name="logout" className="sidebar-link-icon" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f7f8fc] lg:flex">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[#4f46e5] px-4 text-white shadow-sm lg:hidden">
        <Link className="font-extrabold tracking-tight" href="/events">ConnectSphere</Link>
        <button aria-label={open ? "Close menu" : "Open menu"} className="rounded-lg p-2 hover:bg-white/10" onClick={() => setOpen(!open)}>
          <NavIcon name={open ? "close" : "menu"} />
        </button>
      </header>
      {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={closeMenu} />}
      <div className="lg:hidden">{open && sidebar}</div>
      <aside className={`hidden lg:block ${open ? "translate-x-0" : ""}`}>
        {sidebar}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-7 lg:px-8">
        <div className="mx-auto w-full max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}