import { AuthGate } from "@/components/auth/auth-gate";
import { Registrations } from "@/components/auth/registrations";
export default function MyRegistrationsPage() { return <AuthGate role="ATTENDEE"><Registrations /></AuthGate>; }
