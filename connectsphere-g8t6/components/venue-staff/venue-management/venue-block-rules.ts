// SPM-195 block form checks, for instant feedback only: the backend's
// validation is authoritative (Master 2.6). Times are ISO instants, already
// read from the Singapore datetime-local inputs; null means incomplete.

export type BlockFieldErrors = Partial<Record<"reason" | "start" | "end" | "note", string>>;

export const BLOCK_NOTE_LIMIT = 1000;
export const LENGTHEN_MESSAGE = "Record a new block for additional time.";

export function validateBlockForm(
  values: { reason: string; start: string | null; end: string | null; note: string },
  now = new Date(),
): BlockFieldErrors {
  const errors: BlockFieldErrors = {};
  if (!values.reason) errors.reason = "Choose a reason";
  if (!values.start) errors.start = "Enter the start date and time";
  if (!values.end) errors.end = "Enter the end date and time";
  if (values.start && values.end && Date.parse(values.end) <= Date.parse(values.start)) {
    errors.end = "The end must be after the start";
  } else if (values.end && Date.parse(values.end) <= now.getTime()) {
    errors.end = "The end must be in the future";
  }
  const note = values.note.trim();
  if (!note) errors.note = "Enter a note for the coordinators and Venue Staff";
  else if (note.length > BLOCK_NOTE_LIMIT) errors.note = `Keep the note to ${BLOCK_NOTE_LIMIT} characters`;
  return errors;
}

// Shortening keeps the new times inside the current block (AC9); anything
// longer is a new block.
export function validateShortenForm(
  block: { start: string; end: string },
  values: { start: string | null; end: string | null },
): BlockFieldErrors {
  const errors: BlockFieldErrors = {};
  if (!values.start) errors.start = "Enter the start date and time";
  if (!values.end) errors.end = "Enter the end date and time";
  if (!values.start || !values.end) return errors;
  const [start, end, blockStart, blockEnd] = [values.start, values.end, block.start, block.end].map((value) => Date.parse(value));
  if (end <= start) errors.end = "The end must be after the start";
  else if (start < blockStart || end > blockEnd) errors.end = LENGTHEN_MESSAGE;
  else if (start === blockStart && end === blockEnd) errors.end = "Move the start later or the end earlier to shorten the block";
  return errors;
}
