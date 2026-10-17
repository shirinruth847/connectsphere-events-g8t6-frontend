import { AuthGate } from "@/components/auth/auth-gate";
import { Registrations } from "@/components/attendee/registrations";
export default function MyRegistrationsPage() { return <AuthGate role="ATTENDEE"><Registrations /></AuthGate>; }
