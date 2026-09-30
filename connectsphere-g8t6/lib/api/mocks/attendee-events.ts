import type { AttendeeEvent } from "../types";

/**
 * MOCK DATA — SPM-34 UI only. The backend has no discovery route yet.
 * Replace with the live response in lib/api/events.ts and delete this file.
 * Covers every registration availability state so the UI can be checked end to end.
 */
export const MOCK_ATTENDEE_EVENTS: AttendeeEvent[] = [
  {
    event_id: "mock-0001",
    title: "Fintech Leadership Symposium 2026",
    description:
      "Global decentralization, sovereign digital assets, AI algorithmic clearing, and high-frequency risk architectures for enterprise banking officers.",
    start_datetime: "2026-11-28T08:30:00+08:00",
    end_datetime: "2026-11-28T17:00:00+08:00",
    venue: {
      venue_id: "mock-venue-01",
      name: "Grand Hall Alpha",
      address: "Keynote Auditorium, Level 1",
    },
    image_url: "/mock/events/fintech-leadership-symposium.jpg",
    registration: {
      is_registration_enabled: true,
      availability: "OPEN",
      registration_capacity: 450,
      allocated_count: 380,
      waitlist_count: 0,
      registration_open_at: "2026-09-15T09:00:00+08:00",
      registration_close_at: "2026-11-20T23:59:00+08:00",
    },
  },
  {
    event_id: "mock-0002",
    title: "Global Clean Energy Summit",
    description:
      "Grid modernization, fusion prototypes, next-gen lithium sulfur infrastructure, and multilateral carbon audit protocols for multinational consortiums.",
    start_datetime: "2026-12-12T09:00:00+08:00",
    end_datetime: "2026-12-12T18:30:00+08:00",
    venue: {
      venue_id: "mock-venue-02",
      name: "Main Stage",
      address: "Grand Arena Pavilion",
    },
    image_url: "/mock/events/global-clean-energy-summit.jpg",
    registration: {
      is_registration_enabled: true,
      availability: "FULL",
      registration_capacity: 500,
      allocated_count: 500,
      waitlist_count: 42,
      registration_open_at: "2026-09-01T09:00:00+08:00",
      registration_close_at: "2026-12-05T23:59:00+08:00",
    },
  },
  {
    event_id: "mock-0003",
    title: "Quantum Computing Consortium 2027",
    description:
      "Practical quantum error mitigation, topological qubits, and post-quantum cryptography transition models for defense and financial networks.",
    start_datetime: "2027-01-18T10:00:00+08:00",
    end_datetime: "2027-01-18T16:30:00+08:00",
    venue: {
      venue_id: "mock-venue-03",
      name: "Tech Loft 4",
      address: "Innovation Wing, Level 4",
    },
    image_url: "/mock/events/quantum-computing-consortium.jpg",
    registration: {
      is_registration_enabled: true,
      availability: "OPEN",
      registration_capacity: 250,
      allocated_count: 120,
      waitlist_count: 0,
      registration_open_at: "2026-09-20T09:00:00+08:00",
      registration_close_at: "2027-01-10T23:59:00+08:00",
    },
  },
  {
    event_id: "mock-0004",
    title: "Community Design Lab",
    description:
      "A practical morning for turning community ideas into useful, human-centred service prototypes with local designers.",
    start_datetime: "2026-11-07T10:00:00+08:00",
    end_datetime: "2026-11-07T13:00:00+08:00",
    venue: {
      venue_id: "mock-venue-04",
      name: "Innovation Hall",
      address: "East Wing, Level 2",
    },
    image_url: null,
    registration: {
      is_registration_enabled: true,
      availability: "NOT_YET_OPEN",
      registration_capacity: 80,
      allocated_count: 0,
      waitlist_count: 0,
      registration_open_at: "2026-10-15T09:00:00+08:00",
      registration_close_at: "2026-11-01T23:59:00+08:00",
    },
  },
  {
    event_id: "mock-0005",
    title: "Open Data Showcase",
    description:
      "Public exhibition of civic data projects. Attendee registration is not offered for this event; details are shared for information only.",
    start_datetime: "2026-10-24T14:00:00+08:00",
    end_datetime: "2026-10-24T18:00:00+08:00",
    venue: {
      venue_id: "mock-venue-05",
      name: "Atrium Gallery",
      address: "Central Concourse, Level 1",
    },
    image_url: null,
    registration: {
      is_registration_enabled: false,
      availability: "NOT_ENABLED",
      registration_capacity: null,
      allocated_count: null,
      waitlist_count: null,
      registration_open_at: null,
      registration_close_at: null,
    },
  },
  {
    event_id: "mock-0006",
    title: "Makers Open House",
    description:
      "Hands-on demonstrations of creative technology from student and community maker groups.",
    start_datetime: "2026-10-10T11:00:00+08:00",
    end_datetime: "2026-10-10T16:00:00+08:00",
    venue: {
      venue_id: "mock-venue-06",
      name: "Harbourfront Studio",
      address: "West Wing, Level 3",
    },
    image_url: null,
    registration: {
      is_registration_enabled: true,
      availability: "CLOSED",
      registration_capacity: 200,
      allocated_count: 164,
      waitlist_count: 0,
      registration_open_at: "2026-08-20T09:00:00+08:00",
      registration_close_at: "2026-09-28T23:59:00+08:00",
    },
  },
];
