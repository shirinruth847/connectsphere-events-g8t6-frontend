"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const GuardContext = createContext({ setBlocked: (value: boolean) => { void value; }, allowNavigation: () => {}, navigate: (action: () => void) => action() });
export const useNavigationGuard = () => useContext(GuardContext);

export function NavigationGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const blocked = useRef(false); const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null); const leaveButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const setBlocked = useCallback((value: boolean) => { blocked.current = value; }, []);
  const allowNavigation = useCallback(() => { blocked.current = false; }, []);
  const navigate = useCallback((action: () => void) => {
    if (!blocked.current) { action(); return; }
    previousFocus.current = document.activeElement as HTMLElement | null;
    pending.current = action; setOpen(true);
  }, []);

  useEffect(() => {
    if (open) cancelButton.current?.focus();
    else previousFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (blocked.current) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      if (!blocked.current || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || url.href === location.href) return;
      event.preventDefault(); event.stopImmediatePropagation();
      navigate(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    };
    // Track app history entries so Back and Forward can be restored before the
    // router unmounts the dirty editor. Preserve Next's own history state.
    let index = history.state?.connectsphereIndex ?? 0;
    let restoring = false;
    const push = history.pushState.bind(history); const replace = history.replaceState.bind(history);
    replace({ ...history.state, connectsphereIndex: index }, "");
    const trackedPush: History["pushState"] = (state, unused, url) => { index += 1; push({ ...state, connectsphereIndex: index }, unused, url); };
    const trackedReplace: History["replaceState"] = (state, unused, url) => replace({ ...state, connectsphereIndex: index }, unused, url);
    history.pushState = trackedPush; history.replaceState = trackedReplace;
    const pop = (event: PopStateEvent) => {
      const target = event.state?.connectsphereIndex ?? index - 1;
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      if (!blocked.current) { index = target; return; }
      const delta = target - index;
      if (!delta) return;
      event.stopImmediatePropagation(); restoring = true; history.go(-delta);
      navigate(() => history.go(delta));
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", warn); document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
      if (history.pushState === trackedPush) history.pushState = push;
      if (history.replaceState === trackedReplace) history.replaceState = replace;
    };
  }, [navigate, router]);

  const cancel = () => { pending.current = null; setOpen(false); };
  return <GuardContext.Provider value={{ setBlocked, allowNavigation, navigate }}>{children}{open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="unsaved-heading" className="w-full max-w-lg rounded-panel bg-white p-6 shadow-elevation-1" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); cancel(); }
      if (event.key === "Tab") {
        if (event.shiftKey && document.activeElement === cancelButton.current) { event.preventDefault(); leaveButton.current?.focus(); }
        else if (!event.shiftKey && document.activeElement === leaveButton.current) { event.preventDefault(); cancelButton.current?.focus(); }
      }
    }}>
      <h2 id="unsaved-heading" className="text-lg font-semibold">You have unsaved event changes. Are you sure you want to leave?</h2>
      <div className="mt-6 flex justify-end gap-3"><button ref={cancelButton} type="button" className="rounded-control border px-4 py-2" onClick={cancel}>Keep editing</button><button ref={leaveButton} type="button" className="rounded-control bg-primary px-4 py-2 text-on-primary" onClick={() => { blocked.current = false; const action = pending.current; pending.current = null; setOpen(false); action?.(); }}>Leave page</button></div>
    </section>
  </div>}</GuardContext.Provider>;
}
