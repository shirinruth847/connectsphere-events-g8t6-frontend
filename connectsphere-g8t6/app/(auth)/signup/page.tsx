import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up | ConnectSphere",
};

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-xl font-bold tracking-tight text-brand">ConnectSphere</p>
        <SignupForm />
      </div>
    </main>
  );
}
