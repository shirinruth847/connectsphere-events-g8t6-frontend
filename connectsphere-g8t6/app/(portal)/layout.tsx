import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { TopNav } from "@/components/layout/TopNav";

/** Authenticated app shell shared by every role's pages. */
export default async function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  // INTEGRATION: redirect to /login when there is no verified session.
  const user = await getSessionUser();

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <TopNav user={user} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
