import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
    <section className="w-full max-w-md rounded-panel bg-surface-container-lowest p-6 shadow-elevation-1 sm:p-9">
      <div className="mb-8"><span className="text-xs font-bold uppercase tracking-label text-primary">ConnectSphere</span><h1 className="mt-3 text-3xl font-bold text-on-surface">Welcome back</h1><p className="mt-2 text-sm text-on-surface-variant">Sign in with your event organiser account.</p></div>
      <Suspense fallback={<p className="text-sm text-on-surface-variant">Loading sign in…</p>}><LoginForm /></Suspense>
    </section>
  </main>;
}
