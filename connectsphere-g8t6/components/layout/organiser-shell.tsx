"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOrganiserProfile } from "@/components/auth/organiser-gate";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type NavIconName = "dashboard" | "event" | "registrations" | "notifications" | "support" | "settings" | "logout" | "plus" | "menu" | "close";

function NavIcon({ name, className = "" }: { name: NavIconName; className?: string }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<NavIconName, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    event: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m9 15 2 2 4-4" /></>,
    registrations: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h1M16 14l2 2 3.5-4" /><path d="M14 8h6M17 5v6" /></>,
    notifications: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    support: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.7c-1 .9-1.9 1.3-1.9 2.8M12 17h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.7a7 7 0 0 1-1.7 1l-.3 1.9h-2.8l-.3-1.9a7 7 0 0 1-1.7-1l-1.8.7-1.4-2.4 1.5-1.2a7 7 0 0 1 0-2l-1.5-1.2 1.4-2.4 1.8.7a7 7 0 0 1 1.7-1l.3-1.9h2.8l.3 1.9a7 7 0 0 1 1.7 1l1.8-.7 1.4 2.4-1.5 1.2a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const groups: Array<{ title: string; items: Array<{ title: string; icon: NavIconName; href?: string }> }> = [
  { title: "Main Navigation", items: [
    { title: "Dashboard", icon: "dashboard", href: "/dashboard" },
    { title: "My Requests", icon: "event", href: "/dashboard" },
    { title: "Registrations", icon: "registrations" },
    { title: "Notifications", icon: "notifications" },
  ] },
  { title: "Support And Settings", items: [{ title: "Contact Support", icon: "support" }] },
  { title: "Account Management", items: [{ title: "Settings", icon: "settings" }] },
];

export function OrganiserShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const profile = useOrganiserProfile();
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    try { await getSupabaseBrowserClient().auth.signOut(); } finally { router.replace("/login"); }
  };
  const closeMenu = () => setOpen(false);
  const sidebar = <div className="flex min-h-full flex-col">
    <Link href="/dashboard" onClick={closeMenu} className="mb-8 flex items-center gap-3 px-2 pt-2 text-white">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/30 bg-white/10"><span className="h-3.5 w-3.5 rounded-full border-[3px] border-white" /></span>
      <span className="text-[21px] font-extrabold tracking-tight">ConnectSphere</span>
    </Link>
    <Link href="/events/new" onClick={closeMenu} className="mb-7 flex min-h-[76px] items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-3.5 transition hover:bg-white/15">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15"><NavIcon name="plus" /></span>
      <span><span className="block text-sm font-semibold">Add Quick Event</span><span className="mt-0.5 block text-xs text-white/70">Events</span></span>
    </Link>
    {groups.map((group) => <section key={group.title} className="mb-5 border-b border-white/15 pb-4 last:border-0">
      <h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">{group.title}</h2>
      <nav aria-label={group.title} className="space-y-1">
        {group.items.map((item) => {
          const active = item.title === "My Requests" && pathname === "/dashboard";
          const className = `flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition ${active ? "bg-[#6366f1] text-white shadow-sm" : item.href ? "text-white/80 hover:bg-white/10 hover:text-white" : "cursor-default text-white/55"}`;
          return item.href
            ? <Link key={item.title} href={item.href} onClick={closeMenu} aria-current={active ? "page" : undefined} className={className}><NavIcon name={item.icon} />{item.title}</Link>
            : <span key={item.title} aria-disabled="true" title="This section is not available yet" className={className}><NavIcon name={item.icon} />{item.title}</span>;
        })}
      </nav>
    </section>)}
    <button onClick={logout} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white"><NavIcon name="logout" />Logout</button>
    <div className="mt-auto border-t border-white/20 pt-5">
      <div className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2" title={profile.email || profile.name}>
        <div
          aria-label={`${profile.name} profile picture`}
          className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white/70 bg-[#c7d2fe] text-sm font-bold uppercase text-[#3730a3]"
          role="img"
          style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
        >{profile.avatarUrl ? null : profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
          <p className="truncate text-xs text-white/65">{profile.email || "Event organiser"}</p>
        </div>
      </div>
    </div>
  </div>;

  return <div className="min-h-screen bg-[#f7f8fc] lg:flex">
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[#4f46e5] px-4 text-white shadow-sm lg:hidden">
      <Link className="font-extrabold tracking-tight" href="/dashboard">ConnectSphere</Link>
      <button aria-label={open ? "Close menu" : "Open menu"} className="rounded-lg p-2 hover:bg-white/10" onClick={() => setOpen(!open)}><NavIcon name={open ? "close" : "menu"} /></button>
    </header>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={closeMenu} />}
    <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 w-[225px] overflow-y-auto bg-[#4f46e5] px-4 py-5 text-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-[225px] lg:shrink-0 lg:translate-x-0 lg:px-4 lg:py-5`}>
      {sidebar}
    </aside>
    <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-7 lg:px-8"><div className="mx-auto w-full max-w-[1280px]">{children}</div></main>
  </div>;
}
