import type { Metadata } from "next";
import { RegistrationsView } from "@/components/registrations/RegistrationsView";

export const metadata: Metadata = {
  title: "My Registrations | ConnectSphere",
};

export default function MyRegistrationsPage() {
  return <RegistrationsView />;
}
