"use client";

import { BookingRequestList } from "./booking-requests/booking-request-list";

// /dashboard for Venue Staff is also the "My Requests" tab (SPM-181).
export function VenueStaffDashboard() {
  return <BookingRequestList />;
}
