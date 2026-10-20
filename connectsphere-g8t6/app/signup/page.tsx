import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Sign up | ConnectSphere" };

// SPM-123: public self sign-up for attendees and event organisers.
export default function SignupPage() {
  return <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
    <section className="w-full max-w-md rounded-panel bg-surface-container-lowest p-6 shadow-elevation-1 sm:p-9">
      <div className="mb-8"><span className="text-xs font-bold uppercase tracking-label text-primary">ConnectSphere</span><h1 className="mt-3 text-3xl font-bold text-on-surface">Create your account</h1><p className="mt-2 text-sm text-on-surface-variant">Sign up as an attendee or event organiser. All fields are required.</p></div>
      <SignupForm />
    </section>
  </main>;
}
