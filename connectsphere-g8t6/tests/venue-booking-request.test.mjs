import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_MESSAGES,
  bookingRequestFailure,
  draftsChanged,
  firstVenueId,
  needsPrimaryChoice,
  newDraft,
  periodCheckInputs,
  sectionErrors,
  sgtInputToIso,
  shiftErrorsAfterRemoval,
  suitabilityWarnings,
  toRequestItems,
  toSgtInput,
  validateDrafts,
} from '../components/venues/event-venue-options/venue-booking-form-model.ts';

// E1 runs 09:00–17:00 SGT on 10 March 2030 (01:00–09:00 UTC).
const EVENT = {
  startDatetime: '2030-03-10T01:00:00.000Z',
  endDatetime: '2030-03-10T09:00:00.000Z',
  expectedAttendance: 150,
  preferredLayoutType: 'THEATRE',
  accessibilityNeeds: ['Wheelchair access'],
};
const NOW = Date.parse('2030-01-01T00:00:00Z');

const venue = (venueId, overrides = {}) => ({
  venueId,
  name: `Venue ${venueId}`,
  address: 'Somewhere',
  maxCapacity: 200,
  operatingHours: null,
  accessibilityFeatures: ['Wheelchair access'],
  setupMinutes: 30,
  turnaroundMinutes: 45,
  rooms: [{ roomId: venueId, layoutType: 'Theatre', capacity: 200 }],
  detailStatus: 'CURRENT',
  description: null,
  facilities: ['Projector'],
  supportedLayouts: ['Theatre', 'Classroom'],
  emergencyAccess: null,
  knownRestrictions: null,
  coverPhotoId: null,
  availability: { status: 'AVAILABLE', label: 'Available', occupiedStart: null, occupiedEnd: null, conflicts: [], operatingHoursWarning: null },
  requirements: [],
  unmetCount: 0,
  allRequirementsMet: true,
  ...overrides,
});
const VENUES = [venue(1), venue(2), venue(3, { maxCapacity: 80 })];

let counter = 0;
const draft = (overrides = {}) => ({ ...newDraft(`k${++counter}`, EVENT, VENUES[0]), ...overrides });
const check = (drafts, overrides = {}) =>
  validateDrafts(drafts, { event: EVENT, venues: VENUES, bookedVenueIds: new Set(), eventHasPrimary: false, now: NOW, ...overrides });

test('[SPM-179] Singapore times convert both ways', () => {
  assert.equal(toSgtInput('2030-03-10T01:00:00Z'), '2030-03-10T09:00');
  assert.equal(toSgtInput('2030-03-10T16:30:00Z'), '2030-03-11T00:30');
  assert.equal(toSgtInput(null), '');
  assert.equal(sgtInputToIso('2030-03-10T09:00'), '2030-03-10T01:00:00.000Z');
  assert.equal(sgtInputToIso('2030-03-10'), null);
  assert.equal(sgtInputToIso(''), null);
});

test('[SPM-179 AC8] the availability check covers every day of the period', () => {
  assert.deepEqual(periodCheckInputs('2030-03-10T09:00', '2030-03-10T12:00'), {
    date: '2030-03-10', days: 1, check: { date: '2030-03-10', startTime: '09:00', endDate: '2030-03-10', endTime: '12:00' },
  });
  assert.equal(periodCheckInputs('2030-03-10T09:00', '2030-03-12T10:00').days, 3);
  assert.equal(periodCheckInputs('2030-03-10T12:00', '2030-03-10T12:00'), null);
  assert.equal(periodCheckInputs('2030-03-10T12:00', ''), null);
});

test('[SPM-179 AC2][AC3] a section starts from the event and the chosen venue', () => {
  const first = newDraft('a', EVENT, VENUES[1]);
  assert.equal(first.venueId, 2);
  assert.equal(first.label, 'Venue 2');
  assert.equal(first.labelEdited, false);
  assert.equal(first.start, '2030-03-10T09:00');
  assert.equal(first.end, '2030-03-10T17:00');
  assert.equal(first.expectedAttendance, '150');
  assert.equal(first.layout, 'Theatre');
  assert.deepEqual(first.accessibilityNeeds, ['Wheelchair access']);
  const empty = newDraft('b', { ...EVENT, preferredLayoutType: 'NO_PREFERENCE', expectedAttendance: null });
  assert.equal(empty.venueId, null);
  assert.equal(empty.label, '');
  assert.equal(empty.layout, '');
  assert.equal(empty.expectedAttendance, '');
});

test('[SPM-179 AC2][AC4][AC9] the first section takes the suggestion, else the first preference, skipping booked or unlisted venues', () => {
  assert.equal(firstVenueId([2, 1], VENUES, new Set()), 2);
  assert.equal(firstVenueId([null, 1, 2], VENUES, new Set()), 1);
  assert.equal(firstVenueId([2, 1], VENUES, new Set([2])), 1);
  assert.equal(firstVenueId([99, 3], VENUES, new Set()), 3);
  assert.equal(firstVenueId([99], VENUES, new Set()), null);
  // TC-14: a venue without setup/turnaround times cannot take bookings, so it is skipped.
  const noMinutes = [venue(2, { setupMinutes: null }), venue(1)];
  assert.equal(firstVenueId([2, 1], noMinutes, new Set()), 1);
  assert.equal(firstVenueId([2], [venue(2, { setupMinutes: null, detailStatus: 'NOT_CHECKED' })], new Set()), 2);
});

test('[SPM-179 TC-01] a complete section passes', () => {
  assert.deepEqual(check([draft()]), {});
});

test('[SPM-179 TC-03] missing fields are reported inline in their own section', () => {
  const errors = check([draft(), draft({ venueId: null, label: '', start: '', expectedAttendance: '', layout: '' })]);
  assert.deepEqual(errors, {
    'bookings.1.venueId': BOOKING_MESSAGES.venueRequired,
    'bookings.1.label': BOOKING_MESSAGES.labelRequired,
    'bookings.1.start': BOOKING_MESSAGES.startRequired,
    'bookings.1.expectedAttendance': BOOKING_MESSAGES.attendanceRequired,
    'bookings.1.layout': BOOKING_MESSAGES.layoutRequired,
    'bookings.primary': BOOKING_MESSAGES.onePrimary,
  });
  assert.deepEqual(sectionErrors(errors, 1).venueId, BOOKING_MESSAGES.venueRequired);
  assert.deepEqual(sectionErrors(errors, 0), {});
});

test('[SPM-179 TC-04] the booking window must lie within the event', () => {
  assert.equal(check([draft({ start: '2030-03-10T08:30', end: '2030-03-10T10:00' })])['bookings.0.start'], BOOKING_MESSAGES.outsideEvent);
  assert.equal(check([draft({ start: '2030-03-10T16:00', end: '2030-03-10T17:30' })])['bookings.0.start'], BOOKING_MESSAGES.outsideEvent);
  assert.deepEqual(check([draft({ start: '2030-03-10T09:00', end: '2030-03-10T17:00' })]), {});
});

test('[SPM-179 TC-05] the end must follow the start, and the start must be in the future', () => {
  assert.equal(check([draft({ start: '2030-03-10T10:00', end: '2030-03-10T10:00' })])['bookings.0.end'], BOOKING_MESSAGES.endBeforeStart);
  assert.equal(check([draft()], { now: Date.parse('2030-03-10T02:00:00Z') })['bookings.0.start'], BOOKING_MESSAGES.startInPast);
});

test('[SPM-179 TC-06] attendance must be a whole number of 1 or more', () => {
  for (const value of ['0', '-5', '1.5', 'ten']) {
    assert.equal(check([draft({ expectedAttendance: value })])['bookings.0.expectedAttendance'], BOOKING_MESSAGES.attendanceInvalid, value);
  }
  assert.deepEqual(check([draft({ expectedAttendance: '1' })]), {});
});

test('[SPM-179 TC-07] capacity is checked against that venue only', () => {
  const errors = check([draft({ venueId: 3, label: 'Small', expectedAttendance: '81', isPrimary: true }), draft({ venueId: 2, label: 'Other' })]);
  assert.deepEqual(errors, { 'bookings.0.expectedAttendance': "Expected attendance (81) exceeds this venue's capacity (80)." });
});

test('[SPM-179 TC-08] a venue cannot appear twice or be booked again for the event', () => {
  const twice = check([draft({ isPrimary: true }), draft()]);
  assert.equal(twice['bookings.1.venueId'], BOOKING_MESSAGES.venueTwice);
  const booked = check([draft()], { bookedVenueIds: new Set([1]) });
  assert.equal(booked['bookings.0.venueId'], BOOKING_MESSAGES.venueBooked);
});

test('[SPM-179 TC-14] unlisted venues and venues without setup and turnaround times are refused', () => {
  assert.equal(check([draft({ venueId: 99 })])['bookings.0.venueId'], BOOKING_MESSAGES.venueNotBookable);
  const noMinutes = [venue(1, { setupMinutes: null })];
  assert.equal(check([draft()], { venues: noMinutes })['bookings.0.venueId'], BOOKING_MESSAGES.buffersNotSet);
  // When the detail service could not be read, the backend decides.
  const notChecked = [venue(1, { setupMinutes: null, turnaroundMinutes: null, detailStatus: 'NOT_CHECKED' })];
  assert.deepEqual(check([draft()], { venues: notChecked }), {});
});

test('[SPM-179 AC10][TC-15][TC-16] primary venue rules', () => {
  assert.equal(needsPrimaryChoice(1, false), false);
  assert.equal(needsPrimaryChoice(2, false), true);
  assert.equal(needsPrimaryChoice(2, true), false);
  const two = [draft(), draft({ venueId: 2, label: 'B' })];
  assert.equal(check(two)['bookings.primary'], BOOKING_MESSAGES.onePrimary);
  assert.equal(check(two.map((item) => ({ ...item, isPrimary: true })))['bookings.primary'], BOOKING_MESSAGES.onePrimary);
  assert.deepEqual(check([{ ...two[0], isPrimary: true }, two[1]]), {});
  assert.deepEqual(check(two, { eventHasPrimary: true }), {});

  // A single venue is not marked: the backend makes it primary when the event
  // has none, and an event that has one (even unflagged) keeps it.
  assert.equal(toRequestItems([draft()], false)[0].isPrimary, false);
  assert.deepEqual(toRequestItems([{ ...two[0], isPrimary: true }, two[1]], false).map((item) => item.isPrimary), [true, false]);
  assert.deepEqual(toRequestItems(two.map((item) => ({ ...item, isPrimary: true })), true).map((item) => item.isPrimary), [false, false]);
});

test('[SPM-179] the request body uses the backend field names, ISO times and clean lists', () => {
  const [item] = toRequestItems([draft({
    label: '  Main hall ',
    expectedAttendance: ' 150 ',
    requiredFacilities: ['Projector', ' projector ', ''],
    specialRequirements: '   ',
  })], false);
  assert.deepEqual(item, {
    venueId: 1,
    label: 'Main hall',
    start: '2030-03-10T01:00:00.000Z',
    end: '2030-03-10T09:00:00.000Z',
    expectedAttendance: 150,
    layout: 'Theatre',
    requiredFacilities: ['Projector'],
    accessibilityNeeds: ['Wheelchair access'],
    specialRequirements: null,
    isPrimary: false,
  });
});

test('[SPM-179 AC8] unsupported layout, facilities and accessibility needs are warnings', () => {
  const messages = suitabilityWarnings(draft({ layout: 'Banquet', requiredFacilities: ['Projector', 'Stage'], accessibilityNeeds: ['Hearing loop'] }), VENUES[0]);
  assert.deepEqual(messages, [
    'Venue 1 does not list the Banquet layout.',
    'Venue 1 does not list the facility "Stage".',
    'Venue 1 does not list the accessibility feature "Hearing loop".',
  ]);
  assert.deepEqual(suitabilityWarnings(draft(), VENUES[0]), []);
  // Unread or unrecorded detail is not checked, so it gives no warning.
  assert.deepEqual(suitabilityWarnings(draft({ layout: 'Banquet' }), venue(1, { detailStatus: 'NOT_CHECKED' })), []);
});

test('[SPM-179 AC16][TC-22] a refusal is pinned to its section and keeps the form', () => {
  const conflict = bookingRequestFailure({
    code: 'BOOKING_CONFLICT',
    message: 'This venue is unavailable from 10 Mar, 10:30 to 10 Mar, 13:45 (another booking), including setup and turnaround time.',
    fields: { 'bookings.1.start': 'This venue is unavailable from 10 Mar, 10:30 to 10 Mar, 13:45 (another booking), including setup and turnaround time.' },
    details: { bookingIndex: 1 },
  });
  assert.equal(conflict.sectionIndex, 1);
  assert.equal(conflict.stale, false);
  assert.match(conflict.banner, /Nothing was saved/);

  const down = bookingRequestFailure({ code: 'AVAILABILITY_UNAVAILABLE', message: 'Availability could not be checked. Try again later.' });
  assert.deepEqual(down, { fields: {}, banner: 'Availability could not be checked. Try again later.', sectionIndex: null, stale: false, refreshBookings: false });

  assert.equal(bookingRequestFailure({ code: 'EVENT_NOT_IN_PLANNING', message: 'x' }).stale, true);
  assert.equal(bookingRequestFailure({ code: 'PRIMARY_VENUE_ALREADY_SET', message: 'x' }).refreshBookings, true);
  assert.equal(bookingRequestFailure({ code: 'VALIDATION_FAILED', message: 'x', fields: { 'bookings.2.label': 'Label is required.' } }).sectionIndex, 2);
});

test('[SPM-179 AC4] removing a section moves the later errors up and drops its own', () => {
  assert.deepEqual(shiftErrorsAfterRemoval({
    'bookings.0.label': 'a', 'bookings.1.start': 'b', 'bookings.2.venueId': 'c', 'bookings.primary': 'p',
  }, 1), { 'bookings.0.label': 'a', 'bookings.1.venueId': 'c', 'bookings.primary': 'p' });
});

test('[SPM-179] closing asks first only when the form changed', () => {
  const initial = [newDraft('x', EVENT, VENUES[0])];
  assert.equal(draftsChanged([{ ...initial[0], key: 'other' }], initial), false);
  assert.equal(draftsChanged([{ ...initial[0], label: 'Edited' }], initial), true);
  assert.equal(draftsChanged([...initial, newDraft('y', EVENT)], initial), true);
});
