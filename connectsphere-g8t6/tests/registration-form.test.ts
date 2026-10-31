import { describe, expect, it } from "vitest";
import {
  REGISTRATION_RECOVERY_MAX_AGE_MS,
  attemptFor,
  parseRegistrationRecovery,
  registrationOutcome,
  registrationRecoveryKey,
  toRegistrationAnswers,
  validateRegistrationValues,
} from "@/components/attendee/registration/registration-form";
import { getRegistrationState } from "@/components/attendee/discovery/registration-availability";

const place = { status: "REGISTERED", registeredAt: "2026-10-29T02:00:00.000Z", waitlistPosition: null, offer: null };

describe("[SPM-134] registration answers", () => {
  it("should_send_both_answers_with_blank_as_null_when_building_the_request", () => {
    expect(toRegistrationAnswers({ dietaryRestrictions: "", accessibilityRequirements: "  \n" })).toEqual({ dietaryRestrictions: null, accessibilityRequirements: null });
  });

  it("should_send_unicode_unchanged_when_building_the_request", () => {
    const text = "Gluten-free 🌾, 素食, café";
    expect(toRegistrationAnswers({ dietaryRestrictions: text, accessibilityRequirements: "Ramp" })).toEqual({ dietaryRestrictions: text, accessibilityRequirements: "Ramp" });
  });

  it("should_report_only_the_invalid_field_when_one_answer_is_too_long", () => {
    const errors = validateRegistrationValues({ dietaryRestrictions: "a".repeat(1001), accessibilityRequirements: "Step-free access" });
    expect(Object.keys(errors)).toEqual(["dietaryRestrictions"]);
  });

  it("should_accept_blank_answers_when_validating", () => {
    expect(validateRegistrationValues({ dietaryRestrictions: "", accessibilityRequirements: "" })).toEqual({});
  });
});

describe("[SPM-134 AC1/AC12/AC13/AC15] registration area state", () => {
  it("should_offer_register_now_only_when_open_and_the_attendee_holds_no_place", () => {
    expect(getRegistrationState("OPEN", null, true)).toEqual({ kind: "register", label: "Register Now" });
    expect(getRegistrationState("OPEN", place, true)).toEqual({ kind: "place", label: "Registered" });
  });

  it.each([
    ["NOT_YET_OPEN", "Registration Not Yet Open"],
    ["FULL_WAITLIST", "Registration Full"],
    ["CLOSED", "Registration Closed"],
    ["UNAVAILABLE", "Registration Unavailable"],
  ])("should_show_a_disabled_state_and_no_register_now_when_availability_is_%s", (availability, label) => {
    expect(getRegistrationState(availability, null, true)).toEqual({ kind: "unavailable", label });
    expect(getRegistrationState(availability, null, false)).toEqual({ kind: "unavailable", label });
  });

  it("should_never_label_an_unavailable_event_as_full_or_closed", () => {
    expect(getRegistrationState("UNAVAILABLE", null, true)?.label).not.toMatch(/full|closed/i);
  });

  it.each(["NOT_ENABLED", "SOMETHING_NEW", ""])("should_show_an_unknown_availability_%s_as_unavailable_rather_than_open", (availability) => {
    expect(getRegistrationState(availability, null, true)).toEqual({ kind: "unavailable", label: "Registration Unavailable" });
  });

  it.each(["NOT_YET_OPEN", "OPEN", "FULL_WAITLIST", "CLOSED", "UNAVAILABLE"])(
    "should_show_the_held_place_instead_of_availability_%s",
    (availability) => {
      expect(getRegistrationState(availability, place, true)).toEqual({ kind: "place", label: "Registered" });
      expect(getRegistrationState(availability, { ...place, status: "WAITLISTED" }, true)).toEqual({ kind: "place", label: "On the waitlist" });
    },
  );

  it("should_not_offer_register_now_while_the_attendee_places_are_unknown", () => {
    expect(getRegistrationState("OPEN", null, false)).toBeNull();
  });
});

describe("[SPM-134] idempotency key per logical submission", () => {
  const answers = { dietaryRestrictions: "Vegan", accessibilityRequirements: null };
  let n = 0;
  const newKey = () => `key-${++n}`;

  it("should_reuse_the_key_when_the_same_answers_are_retried", () => {
    const first = attemptFor(null, answers, newKey);
    expect(attemptFor(first, { ...answers }, newKey).key).toBe(first.key);
  });

  it("should_use_a_new_key_when_the_answers_change", () => {
    const first = attemptFor(null, answers, newKey);
    expect(attemptFor(first, { ...answers, dietaryRestrictions: "Vegan, no nuts" }, newKey).key).not.toBe(first.key);
  });
});

describe("[SPM-134 AC16/AC17] outcomes of a refused or failed registration", () => {
  const conflict = (code: string) => registrationOutcome({ status: 409, code, message: "raw backend text" });

  it.each(["REGISTRATION_NOT_YET_OPEN", "REGISTRATION_FULL", "REGISTRATION_CLOSED", "REGISTRATION_UNAVAILABLE", "ALREADY_REGISTERED", "ALREADY_WAITLISTED"])(
    "should_refresh_and_stop_resubmitting_when_the_backend_returns_%s",
    (code) => {
      const outcome = conflict(code);
      expect(outcome.refresh).toBe(true);
      expect(outcome.canRetry).toBe(false);
      expect(outcome.message).not.toContain("raw backend text");
    },
  );

  it("should_name_the_full_and_already_registered_cases_specifically", () => {
    expect(conflict("REGISTRATION_FULL").title).toBe("This event is now full");
    expect(conflict("ALREADY_REGISTERED").title).toBe("You're already registered");
    expect(conflict("REGISTRATION_NOT_YET_OPEN").title).toBe("Registration hasn't opened yet");
  });

  it("should_say_unavailable_without_calling_the_event_full_or_closed_or_naming_its_setup", () => {
    const outcome = conflict("REGISTRATION_UNAVAILABLE");
    expect(outcome.title).toBe("Registration is currently unavailable");
    expect(`${outcome.title} ${outcome.message}`).not.toMatch(/full|closed|venue|capacity|configur/i);
  });

  it("should_allow_an_explicit_retry_with_the_same_key_when_the_request_is_in_progress", () => {
    expect(conflict("IDEMPOTENCY_IN_PROGRESS")).toMatchObject({ canRetry: true, refresh: false });
    expect(conflict("IDEMPOTENCY_IN_PROGRESS").newKey).toBeUndefined();
  });

  it("should_use_a_new_key_when_the_backend_reports_the_key_reused", () => {
    expect(conflict("IDEMPOTENCY_KEY_REUSED")).toMatchObject({ canRetry: true, newKey: true });
  });

  it("should_treat_a_404_as_the_event_no_longer_available", () => {
    expect(registrationOutcome({ status: 404, code: "EVENT_NOT_FOUND", message: "x" })).toMatchObject({ title: "This event is no longer available", refresh: true, canRetry: false });
  });

  it("should_keep_answers_and_allow_retry_with_safe_wording_when_the_server_fails", () => {
    const outcome = registrationOutcome({ status: 500, code: "INTERNAL_ERROR", message: "Internal Server Error" });
    expect(outcome).toMatchObject({ canRetry: true, refresh: false, tone: "error", title: "We couldn't confirm your registration" });
    expect(outcome.message).toContain("may have been received");
    expect(outcome.title).not.toContain("not submitted");
    expect(outcome.message).not.toContain("Internal Server Error");
  });

  it("should_keep_a_lost_network_response_uncertain_and_allow_the_original_request_to_be_retried", () => {
    const outcome = registrationOutcome({ status: 0, code: "NETWORK_ERROR", message: "Connection interrupted." });
    expect(outcome).toMatchObject({ title: "We couldn't confirm your registration", canRetry: true, refresh: false });
    expect(outcome.newKey).toBeUndefined();
    expect(outcome.message).toContain("Connection interrupted.");
    expect(outcome.message).toContain("may have been received");
  });

  it("should_show_safe_generic_wording_when_a_409_code_is_unknown", () => {
    expect(registrationOutcome({ status: 409, code: "NEW_CODE", message: "raw" }).canRetry).toBe(true);
  });
});

describe("[SPM-134] registration answers kept across a session expiry", () => {
  const now = 1_800_000_000_000;
  const event = { eventId: 7, title: "Open Day", startDatetime: "2026-11-01T01:00:00.000Z", endDatetime: null };
  const values = { dietaryRestrictions: "Vegan 🌱", accessibilityRequirements: "" };

  it("should_restore_recent_well_formed_answers", () => {
    expect(parseRegistrationRecovery(JSON.stringify({ event, values, at: now - 1000 }), now)).toEqual({ event, values, at: now - 1000 });
  });

  it("should_ignore_expired_future_or_malformed_recovery", () => {
    expect(parseRegistrationRecovery(null, now)).toBeNull();
    expect(parseRegistrationRecovery("{", now)).toBeNull();
    expect(parseRegistrationRecovery(JSON.stringify({ event, values, at: now - REGISTRATION_RECOVERY_MAX_AGE_MS - 1 }), now)).toBeNull();
    expect(parseRegistrationRecovery(JSON.stringify({ event, values, at: now + 1 }), now)).toBeNull();
    expect(parseRegistrationRecovery(JSON.stringify({ event: { ...event, eventId: "7" }, values, at: now }), now)).toBeNull();
    expect(parseRegistrationRecovery(JSON.stringify({ event, values: { dietaryRestrictions: "x" }, at: now }), now)).toBeNull();
  });

  it("should_scope_recovery_to_the_signed_in_user", () => {
    expect(registrationRecoveryKey("a")).not.toBe(registrationRecoveryKey("b"));
  });
});
