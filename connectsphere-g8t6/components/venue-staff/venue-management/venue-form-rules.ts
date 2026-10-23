// Client-side checks for the venue form (SPM-73). They mirror the backend's
// validators/venueValidator.js wording so the message is the same either way;
// the backend stays authoritative. Pure, so they are unit tested.

export const MAX_VENUE_CAPACITY = 100000;
export const MAX_BUFFER_MINUTES = 1440;

export interface VenueFormValues {
  name: string;
  address: string;
  maxCapacity: string;
  contactPerson: string;
  contactEmail: string;
  contactNumber: string;
  status: string;
  statusReason: string;
  setupMinutes: string;
  turnaroundMinutes: string;
}

export const EMPTY_VENUE_FORM: VenueFormValues = {
  name: "",
  address: "",
  maxCapacity: "",
  contactPerson: "",
  contactEmail: "",
  contactNumber: "",
  status: "ACTIVE",
  statusReason: "",
  setupMinutes: "",
  turnaroundMinutes: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTACT_NUMBER = /^\+?[0-9(][0-9 ()-]*$/;

export function validateVenueForm(values: VenueFormValues, { includeStatus = true } = {}) {
  const errors: Partial<Record<keyof VenueFormValues, string>> = {};
  if (!values.name.trim()) errors.name = "Venue name is required";
  else if (values.name.trim().length > 150) errors.name = "Venue name must be 150 characters or fewer";
  if (!values.address.trim()) errors.address = "Address is required";
  if (!values.maxCapacity.trim()) errors.maxCapacity = "Capacity is required";
  else if (!/^\d+$/.test(values.maxCapacity.trim()) || Number(values.maxCapacity) < 1) errors.maxCapacity = "Capacity must be a positive whole number";
  else if (Number(values.maxCapacity) > MAX_VENUE_CAPACITY) errors.maxCapacity = `Capacity must be ${MAX_VENUE_CAPACITY.toLocaleString("en-US")} or fewer`;
  if (!values.contactPerson.trim()) errors.contactPerson = "Contact person is required";
  const email = values.contactEmail.trim();
  const number = values.contactNumber.trim();
  if (email && !EMAIL.test(email)) errors.contactEmail = "Enter a valid email address, for example name@example.com";
  const digits = number.replace(/\D/g, "").length;
  if (number && (!CONTACT_NUMBER.test(number) || digits < 7 || digits > 15)) errors.contactNumber = "Enter a valid contact number, for example +65 6123 4567";
  if (!email && !number) errors.contactNumber = "Enter a contact number or email";
  if (includeStatus && values.status === "UNDER_MAINTENANCE" && !values.statusReason.trim()) {
    errors.statusReason = "Enter a reason for putting the venue under maintenance";
  }
  for (const key of ["setupMinutes", "turnaroundMinutes"] as const) {
    const text = values[key].trim();
    if (text && (!/^\d+$/.test(text) || Number(text) > MAX_BUFFER_MINUTES)) errors[key] = `Enter whole minutes from 0 to ${MAX_BUFFER_MINUTES}`;
  }
  return errors;
}

// "Projector, Stage\nPA" → ["Projector", "Stage", "PA"]
export const parseList = (text: string) =>
  text.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

export const formatList = (items: string[] | null | undefined) => (items ?? []).join(", ");
