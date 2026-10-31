"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertBanner, Button, FormLabel, SectionCard, fieldClasses } from "@/components/shared/primitives";
import { apiRequest, ApiError } from "@/lib/api";
import { useSessionUser } from "@/components/auth/auth-gate";
import { useNavigationGuard } from "@/components/shared/navigation-guard";
import { SESSION_EXPIRED } from "@/lib/session";
import { ACCESSIBILITY_OPTIONS, validateEventStep, fieldStep, EMPTY_EVENT_FORM, EventFormValues, EventRequest, formValuesFromEvent, formatSavedTime, eventStatusLabel, isDraftEvent, localDateTimeToIso, toPayload } from "@/lib/events";
import { equipmentAvailabilityErrors } from "@/lib/technical-requests";
import { EquipmentRequirementsEditor } from "@/components/events/equipment/equipment-requirements-editor";
import { useEquipmentAvailability, type AvailabilityState } from "@/components/events/equipment/use-equipment-availability";

const steps = [
  "Event Identity & Core Purpose",
  "Scheduling & Attendance Estimates",
  "Venue & Layout Requirements",
  "Accessibility & Special Needs",
  "Technical & Equipment Requirements",
  "Registration & Ticketing Needs",
];
const stepDescriptions = [
  "General event details for your event team’s evaluation.",
  "Propose a date, event duration, and expected in-person attendance.",
  "Share venue and room layout preferences with the coordinator.",
  "Tell the team about access needs and accommodations.",
  "Choose equipment and note technical support needs for event planning.",
  "Set up the supported event registration options.",
];
const guidance = [
  { title: "Event identity & purpose", body: "A clear title and concise event scope help your coordinator understand the request. The title is the only field required to save a draft." },
  { title: "Attendance & scheduling", body: "Submit at least 48 hours before the proposed start. Your end time must follow the start time; attendance is used during coordinator review." },
  { title: "Venue coordination", body: "Choose venue preferences and a supported layout. Preferences do not reserve or hold a venue." },
  { title: "Accessibility planning", body: "Share the access arrangements your attendees need. The event team can follow up if more detail is required." },
  { title: "Equipment planning", body: "Availability is shown for your event's date and time; without dates it shows the total stock. Choosing equipment does not reserve it. Your coordinator sends the request to Technical Support." },
  { title: "Registration", body: "You can enable registration and set a capacity. Access controls and waitlists are not supported by this request API." },
];
type SaveResponse = { event?: EventRequest; savedAt?: string };

export function EventRequestWizard() {
  const router = useRouter(); const params = useSearchParams();
  const user = useSessionUser();
  const { setBlocked, allowNavigation } = useNavigationGuard();
  const draftId = params.get("draft");
  const initialId = draftId && /^\d+$/.test(draftId) && Number(draftId) > 0 && Number(draftId) <= 2147483647 ? Number(draftId) : null;
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [step, setStep] = useState(0); const [loading, setLoading] = useState(Boolean(draftId));
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false); const [locked, setLocked] = useState(false);
  const [uncertainSubmission, setUncertainSubmission] = useState(false);
  const [savedAt, setSavedAt] = useState(""); const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [options, setOptions] = useState<{ venues: Array<{venueId: number; name: string}>; layouts: string[] }>({ venues: [], layouts: ["NO_PREFERENCE"] });
  const [optionsError, setOptionsError] = useState("");
  const valuesRef = useRef(values); const idRef = useRef<number | null>(initialId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changedRef = useRef(false); const revision = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const createAttempt = useRef<{ key: string; payload: ReturnType<typeof toPayload>; revision: number } | null>(null);
  const submitAttempt = useRef<{ key: string; payload: ReturnType<typeof toPayload>; eventId?: number } | null>(null);
  const submissionInFlight = useRef(false);
  const recoveryKey = `connectsphere:recovery:${user?.authId ?? user?.user_id}:${draftId ?? "new"}`;
  const replaceValues = useCallback((next: EventFormValues) => { valuesRef.current = next; setValues(next); }, []);
  // SPM-286: quantities free for the entered dates; read by the save and submit checks.
  const availability = useEquipmentAvailability(localDateTimeToIso(values.startDatetime), localDateTimeToIso(values.endDatetime));
  const availabilityRef = useRef<AvailabilityState>(availability.state);
  useEffect(() => { availabilityRef.current = availability.state; }, [availability.state]);
  const equipmentProblems = useCallback(() => {
    const current = availabilityRef.current;
    return current.status === "ready" ? equipmentAvailabilityErrors(valuesRef.current.equipmentRequirements, current.data) : {};
  }, []);

  useEffect(() => { setBlocked(dirty); return () => setBlocked(false); }, [dirty, setBlocked]);
  useEffect(() => {
    let alive = true;
    const restore = () => {
      try {
        const raw = sessionStorage.getItem(recoveryKey);
        if (!raw) return;
        const recovery = JSON.parse(raw);
        // Form recovery expires, but an unresolved command must retain its identity.
        if ((!recovery.submitAttempt && Date.now() - recovery.at > 30 * 60 * 1000) || typeof recovery.values?.title !== "string") return;
        if (!recovery.submitAttempt) sessionStorage.removeItem(recoveryKey);
        replaceValues({ ...EMPTY_EVENT_FORM, ...recovery.values });
        if (recovery.eventId) idRef.current = recovery.eventId;
        if (recovery.submitAttempt) {
          submitAttempt.current = recovery.submitAttempt;
          setUncertainSubmission(true); setStep(steps.length - 1);
        }
        revision.current += 1; changedRef.current = true; setDirty(true);
        setNotice(recovery.submitAttempt
          ? "Your previous submission needs confirmation. Retry submission to check the same request."
          : "Your unsaved changes were restored. Please review and save them.");
      } catch { sessionStorage.removeItem(recoveryKey); }
    };
    const load = async () => {
      if (draftId) {
        if (!initialId) { setLocked(true); setError("This draft could not be found."); return; }
        const result = await apiRequest<{ event: EventRequest }>(`/events/${initialId}`);
        if (!alive) return;
        if (!isDraftEvent(result.event) || result.event.isOwner === false) {
          setLocked(true); setError("This request is not an editable draft. Open its event details instead."); return;
        }
        replaceValues(formValuesFromEvent(result.event));
        idRef.current = result.event.eventId;
      }
      restore();
    };
    void load().catch(caught => { if (alive) { setLocked(true); setError(caught.message || "Could not load this draft."); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [draftId, initialId, recoveryKey, replaceValues]);

  useEffect(() => {
    let alive = true;
    void apiRequest<typeof options>("/events/request-options").then(result => { if (alive) setOptions(result); }).catch(() => { if (alive) setOptionsError("Venue choices could not be loaded. You can retry by reloading, or save your draft and return later."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const preserve = () => {
      if (changedRef.current) {
        sessionStorage.setItem(recoveryKey, JSON.stringify({ values: valuesRef.current, eventId: idRef.current, submitAttempt: submitAttempt.current, at: Date.now() }));
      }
      allowNavigation();
    };
    window.addEventListener(SESSION_EXPIRED, preserve);
    return () => window.removeEventListener(SESSION_EXPIRED, preserve);
  }, [allowNavigation, recoveryKey]);

  const showFailure = useCallback((caught: unknown) => {
    if (caught instanceof ApiError) {
      setError(caught.message); setFieldErrors(caught.fields);
      const field = Object.keys(caught.fields)[0];
      if (field) setStep(fieldStep(field));
      if ([403, 404, 409].includes(caught.status)) setLocked(true);
    } else setError(caught instanceof Error ? caught.message : "Could not save your request.");
  }, []);

  const saveDraft = useCallback(async (auto = false) => {
    if (inFlight.current) {
      await inFlight.current;
      if (auto) return;
    }
    const snapshot = valuesRef.current;
    if (!snapshot.title.trim() || locked || submissionInFlight.current || uncertainSubmission) return;
    const invalid = Object.assign({}, ...steps.map((_, i) => validateEventStep(snapshot, i, false)), equipmentProblems());
    if (Object.keys(invalid).length) { setFieldErrors(invalid); setStep(fieldStep(Object.keys(invalid)[0])); return; }
    if (timer.current) clearTimeout(timer.current);
    const operation = async () => {
      const atStart = revision.current;
      setSaving(true); setError(""); setFieldErrors({});
      try {
        let result: SaveResponse;
        let savedRevision = atStart;
        if (idRef.current) {
          result = await apiRequest(`/events/${idRef.current}/draft`, { method: "PUT", body: JSON.stringify({ ...toPayload(snapshot), isAutoSave: auto }) });
        } else {
          createAttempt.current ??= { key: crypto.randomUUID(), payload: toPayload(snapshot), revision: atStart };
          const attempt = createAttempt.current;
          result = await apiRequest("/events/drafts", { method: "POST", headers: { "Idempotency-Key": attempt.key }, body: JSON.stringify(attempt.payload) });
          savedRevision = attempt.revision;
          if (!result.event?.eventId) throw new Error("The save response did not include a draft ID.");
          idRef.current = result.event.eventId; createAttempt.current = null;
          // A retry of an uncertain POST uses its original payload/key, then
          // persists the current edits with PUT instead of creating another row.
          if (savedRevision !== atStart) {
            result = await apiRequest(`/events/${idRef.current}/draft`, { method: "PUT", body: JSON.stringify({ ...toPayload(snapshot), isAutoSave: auto }) });
            savedRevision = atStart;
          }
        }
        if (result.savedAt && auto) setSavedAt(result.savedAt);
        if (savedRevision === revision.current) {
          changedRef.current = false; setDirty(false); sessionStorage.removeItem(recoveryKey);
          if (!auto) {
            allowNavigation(); sessionStorage.setItem("connectsphere:notice", "Draft saved successfully.");
            router.push("/dashboard?status=DRAFT#my-drafts");
          }
        } else {
          setDirty(true); changedRef.current = true;
          setNotice("The draft saved. Your newer edits are still waiting to be saved.");
        }
      } catch (caught) {
        if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500) createAttempt.current = null;
        showFailure(caught);
      } finally { setSaving(false); }
    };
    const work = operation(); inFlight.current = work;
    try { await work; } finally { if (inFlight.current === work) inFlight.current = null; }
  }, [allowNavigation, equipmentProblems, locked, recoveryKey, router, showFailure, uncertainSubmission]);

  useEffect(() => {
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty && valuesRef.current.title.trim() && !loading && !saving && !submitting && !locked && !uncertainSubmission) timer.current = setTimeout(() => { void saveDraft(true); }, 30_000);
    };
    arm();
    for (const event of ["keydown", "mousedown", "mousemove", "touchstart"]) window.addEventListener(event, arm, { passive: true });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const event of ["keydown", "mousedown", "mousemove", "touchstart"]) window.removeEventListener(event, arm);
    };
  }, [dirty, loading, locked, saveDraft, saving, submitting, uncertainSubmission, values]);

  const update = (key: keyof EventFormValues, value: EventFormValues[keyof EventFormValues]) => {
    revision.current += 1;
    replaceValues({ ...valuesRef.current, [key]: value });
    setDirty(true); changedRef.current = true; setNotice(""); setError("");
  };
  const advance = () => {
    const invalid = { ...validateEventStep(valuesRef.current, step, true), ...(step === 4 ? equipmentProblems() : {}) };
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    setStep(current => Math.min(steps.length - 1, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (step !== steps.length - 1 || submitter?.id !== "submit-request" || submissionInFlight.current || locked) return;
    // Acquire before waiting for auto-save so two events cannot both resume it.
    submissionInFlight.current = true; setSubmitting(true); setError("");
    if (timer.current) clearTimeout(timer.current);
    const complete = (result: EventRequest, recovered = false) => {
      if (!result?.eventId || isDraftEvent(result)) throw new Error("The server did not confirm submission. Please try again.");
      idRef.current = result.eventId; submitAttempt.current = null;
      changedRef.current = false; setDirty(false); allowNavigation(); sessionStorage.removeItem(recoveryKey);
      const status = eventStatusLabel(result);
      sessionStorage.setItem("connectsphere:notice", recovered
        ? `${result.requestId} is already ${status}. Open the event details to see its current progress.`
        : `Your event request has been submitted successfully. ${result.requestId} · ${status}. The Coordinator Lead will assign a coordinator.`);
      router.push("/dashboard");
    };
    const retryingCreate = Boolean(submitAttempt.current);
    try {
      if (inFlight.current) await inFlight.current;
      if (submitAttempt.current?.eventId) {
        const current = await apiRequest<{ event: EventRequest }>(`/events/${submitAttempt.current.eventId}`);
        complete(current.event, true);
        return;
      }
      // An uncertain create reuses its original payload and idempotency key.
      if (!submitAttempt.current) {
        const invalid = Object.assign({}, ...steps.map((_, i) => validateEventStep(valuesRef.current, i, true)), equipmentProblems());
        setFieldErrors(invalid);
        if (Object.keys(invalid).length) { setStep(fieldStep(Object.keys(invalid)[0])); return; }
      }
      const payload = toPayload(valuesRef.current);
      let result: { event: EventRequest };
      if (idRef.current) result = await apiRequest(`/events/${idRef.current}/submit`, { method: "PUT", body: JSON.stringify(payload) });
      else {
        submitAttempt.current ??= { key: crypto.randomUUID(), payload };
        sessionStorage.setItem(recoveryKey, JSON.stringify({ values: valuesRef.current, submitAttempt: submitAttempt.current, at: Date.now() }));
        result = await apiRequest("/events", { method: "POST", headers: { "Idempotency-Key": submitAttempt.current.key }, body: JSON.stringify(submitAttempt.current.payload) });
        if (!result.event?.eventId || isDraftEvent(result.event)) throw new Error("The server did not confirm submission. Please try again.");
        // Save the confirmed ID before a follow-up read can fail or expire the session.
        idRef.current = result.event.eventId;
        submitAttempt.current.eventId = result.event.eventId;
        sessionStorage.setItem(recoveryKey, JSON.stringify({ values: valuesRef.current, eventId: idRef.current, submitAttempt: submitAttempt.current, at: Date.now() }));
      }
      if (retryingCreate) {
        const current = await apiRequest<{ event: EventRequest }>(`/events/${result.event.eventId}`);
        complete(current.event, true);
      } else complete(result.event);
    } catch (caught) {
      const ambiguous = !(caught instanceof ApiError) || caught.status === 0 || caught.status >= 500;
      if (idRef.current && !submitAttempt.current && (ambiguous || (caught instanceof ApiError && caught.code === "EVENT_NOT_DRAFT"))) {
        try {
          const current = await apiRequest<{ event: EventRequest }>(`/events/${idRef.current}`);
          if (!isDraftEvent(current.event)) { complete(current.event, true); return; }
        } catch { /* Keep values when the authoritative state cannot be read. */ }
      }
      if (submitAttempt.current && (retryingCreate || ambiguous || (caught instanceof ApiError && caught.status === 401))) {
        // A retry's failure cannot establish whether the original command committed.
        sessionStorage.setItem(recoveryKey, JSON.stringify({ values: valuesRef.current, eventId: idRef.current, submitAttempt: submitAttempt.current, at: Date.now() }));
        setUncertainSubmission(true);
        if (caught instanceof ApiError && caught.status === 401) showFailure(caught);
        else setError("We could not confirm whether your request was submitted. Retry submission to check the same request; your entered information is retained.");
      } else {
        submitAttempt.current = null; setUncertainSubmission(false);
        // apiRequest may already have raised SESSION_EXPIRED. Preserve the form
        // for its login return rather than deleting the recovery listener's data.
        sessionStorage.setItem(recoveryKey, JSON.stringify({ values: valuesRef.current, eventId: idRef.current, at: Date.now() }));
        showFailure(caught);
      }
    } finally { submissionInFlight.current = false; setSubmitting(false); }
  };

  if (loading) return <SectionCard><p>Loading draft…</p></SectionCard>;
  if (locked) return <SectionCard><AlertBanner title="Draft unavailable" tone="error">{error}</AlertBanner><Link href={initialId ? `/events/${initialId}` : "/dashboard"} className="mt-4 inline-block text-primary underline">{initialId ? "View event details" : "Back to My Requests"}</Link></SectionCard>;

  const field = (key: keyof EventFormValues) => fieldErrors[key] ? <p id={`${key}-error`} className="mt-1 text-xs text-error" role="alert">{fieldErrors[key]}</p> : null;
  const errorProps = (key: keyof EventFormValues) => ({ "aria-invalid": Boolean(fieldErrors[key]), "aria-describedby": fieldErrors[key] ? `${key}-error` : undefined });
  return <div className="pb-5">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold leading-[1.2] tracking-tight text-on-surface sm:text-4xl">Create Event Request</h1><p className="mt-1.5 text-sm text-on-surface-variant">Fill in event specifications for Venue Coordinator evaluation. You can save a draft after entering an Event Title.</p></div>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-[2px] bg-[#f8e5e5] px-5 text-sm font-semibold text-error hover:bg-error-container" aria-label="Close request and return to dashboard"><span aria-hidden="true">×</span> Exit request</Link>
    </header>

    <nav aria-label="Request progress" className="mb-6 overflow-x-auto rounded-lg border border-[#e2e5f1] bg-white p-4 sm:p-5">
      <div className="relative grid min-w-[860px] grid-cols-6 gap-2">
        <div aria-hidden="true" className="absolute left-[8.3%] right-[8.3%] top-[21px] h-0.5 bg-[#e2e5f1]" />
        <div aria-hidden="true" className="absolute left-[8.3%] top-[21px] h-0.5 bg-success transition-all" style={{ width: `${Math.max(0, step) * 16.67}%` }} />
        {steps.map((item, index) => {
          const completed = index < step;
          const active = index === step;
          return <button key={item} type="button" onClick={() => { if (index <= step && !uncertainSubmission && !submitting) setStep(index); }} aria-current={active ? "step" : undefined} className="relative z-[1] flex min-w-0 flex-col items-center gap-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span className={`grid size-11 place-items-center rounded-full border-2 text-lg font-bold ${active ? "border-primary bg-primary text-white" : completed ? "border-success bg-[#eaf5ef] text-success" : "border-[#e2e5f1] bg-white text-on-surface-variant"}`}>{completed ? <span aria-label="Complete">✓</span> : index + 1}</span>
            <span className={`max-w-[180px] text-xs font-semibold leading-[18px] ${active ? "text-primary" : "text-on-surface"}`}>{item}</span>
            <span className={`text-[11px] ${active ? "text-primary" : completed ? "text-success" : "text-outline"}`}>{active ? "In progress" : completed ? "Complete" : "Upcoming"}</span>
          </button>;
        })}
      </div>
    </nav>

    {error ? <div className="mb-4"><AlertBanner tone="error" title="We could not save this request">{error}</AlertBanner></div> : null}
    {notice ? <div className="mb-4"><AlertBanner tone="success">{notice}</AlertBanner></div> : null}

    <form onSubmit={submit} noValidate aria-busy={submitting}><fieldset disabled={submitting}>
      <fieldset disabled={uncertainSubmission} className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_332px]">
        <section className="min-h-[596px] overflow-hidden rounded-lg border border-[#e2e5f1] bg-white shadow-elevation-1">
          <header className="flex flex-wrap items-start justify-between gap-3 bg-[#eff4ff] px-5 py-5 sm:px-7 sm:py-6">
            <div><p className="mb-2 text-[11px] font-bold uppercase tracking-label text-primary">Step {step + 1} of 6</p><h2 className="text-xl font-semibold leading-7 text-on-surface sm:text-[22px]">{steps[step]}</h2><p className="mt-1 text-[13px] text-on-surface-variant">{stepDescriptions[step]}</p></div>
            <span className="text-xs text-on-surface-variant">{values.title.trim() ? "Title required for drafts · complete all required fields to submit" : "Title required for drafts"}</span>
          </header>
          <div className="space-y-5 p-5 sm:space-y-6 sm:p-7">
            {step === 0 && <>
              <div><FormLabel htmlFor="title" required>Event Title</FormLabel><input id="title" maxLength={200} required value={values.title} onChange={(e) => update("title", e.target.value)} className={fieldClasses} placeholder="Enter a clear event title" {...errorProps("title")} />{field("title")}<p className="mt-1.5 text-xs text-on-surface-variant">Required to save a draft and to submit. Save Draft is unavailable until an Event Title is entered.</p></div>
              <div><FormLabel htmlFor="purpose" required>Event Purpose</FormLabel><input id="purpose" {...errorProps("purpose")} maxLength={2000} value={values.purpose} onChange={(e) => update("purpose", e.target.value)} className={fieldClasses} placeholder="What is the event for?" />{field("purpose")}</div>
              <div><div className="flex items-center justify-between gap-3"><FormLabel htmlFor="description" required>Executive Abstract &amp; Event Scope</FormLabel><span className="text-xs text-on-surface-variant">{values.description.length} / 5,000 chars</span></div><textarea id="description" {...errorProps("description")} maxLength={5000} rows={5} value={values.description} onChange={(e) => update("description", e.target.value)} className={`${fieldClasses} min-h-36 resize-y`} placeholder="Summarise the event, its audience, and what attendees will experience." />{field("description")}<p className="mt-1.5 text-xs text-on-surface-variant">Keep concise: this summary is shared with event planning teams.</p></div>
              <p className="rounded-control bg-surface-container-low p-3 text-xs leading-relaxed text-on-surface-variant">Classification and hosting department are shown in the prototype, but the current event API does not accept those fields.</p>
            </>}
            {step === 1 && <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <div><FormLabel htmlFor="startDatetime" required>Primary Proposed Date</FormLabel><input id="startDatetime" {...errorProps("startDatetime")} type="datetime-local" value={values.startDatetime} onChange={(e) => update("startDatetime", e.target.value)} className={fieldClasses} />{field("startDatetime")}<p className="mt-1.5 text-xs text-on-surface-variant">Submit at least 48 hours before the event.</p></div>
              <div><FormLabel htmlFor="endDatetime" required>Event End Date &amp; Time</FormLabel><input id="endDatetime" {...errorProps("endDatetime")} type="datetime-local" value={values.endDatetime} onChange={(e) => update("endDatetime", e.target.value)} className={fieldClasses} />{field("endDatetime")}</div>
              <div><FormLabel htmlFor="expectedAttendance" required>Targeted In-Person Headcount</FormLabel><input id="expectedAttendance" {...errorProps("expectedAttendance")} type="number" min="1" step="1" value={values.expectedAttendance} onChange={(e) => update("expectedAttendance", e.target.value)} className={fieldClasses} placeholder="Expected attendance" />{field("expectedAttendance")}</div>
            </div>}
            {step === 2 && <div className="space-y-4">
              {optionsError && <AlertBanner tone="warning">{optionsError}</AlertBanner>}
              <p className="text-sm text-on-surface-variant">Choose up to 20 venues in order of preference. This does not make a booking or hold.</p>
              {options.venues.map(venue => <label key={venue.venueId} className="flex items-center gap-3 rounded-control border p-3"><input type="checkbox" checked={values.venuePreferences.includes(venue.venueId)} disabled={!values.venuePreferences.includes(venue.venueId) && values.venuePreferences.length >= 20} onChange={e => update("venuePreferences", e.target.checked ? [...values.venuePreferences, venue.venueId] : values.venuePreferences.filter(id => id !== venue.venueId))} />{venue.name}{values.venuePreferences.includes(venue.venueId) && <span>Preference {values.venuePreferences.indexOf(venue.venueId) + 1}</span>}</label>)}
              {!options.venues.length && !optionsError && <p>No venues are currently listed. You may submit with no venue preference.</p>}
              {field("venuePreferences")}
              <div><FormLabel htmlFor="layout" required>Preferred Seating &amp; Room Geometry</FormLabel><select id="layout" {...errorProps("preferredLayoutType")} value={values.preferredLayoutType} onChange={e => update("preferredLayoutType", e.target.value)} className={fieldClasses}>{[...new Set([...options.layouts, values.preferredLayoutType])].map(layout => <option key={layout} value={layout}>{layout === "NO_PREFERENCE" ? "No preference" : layout.replaceAll("_", " ")}</option>)}</select>{field("preferredLayoutType")}</div>
            </div>}
            {step === 3 && <div className="space-y-5">{field("accessibilityNeeds")}<div><p className="mb-3 text-[13px] font-semibold text-on-surface">Access and accommodation requirements</p><div className="grid gap-2 sm:grid-cols-2">{ACCESSIBILITY_OPTIONS.map((option) => <label key={option} className="flex min-h-12 items-start gap-3 rounded-control border border-[#e2e5f1] bg-white p-3 text-[13px] leading-5 text-on-surface"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={values.accessibilityNeeds.includes(option)} onChange={(e) => update("accessibilityNeeds", e.target.checked ? [...values.accessibilityNeeds, option] : values.accessibilityNeeds.filter((item) => item !== option))} />{option}</label>)}</div></div><div><FormLabel htmlFor="accessibilityNotes">Other accessibility notes</FormLabel><textarea id="accessibilityNotes" {...errorProps("accessibilityNotes")} maxLength={4000} rows={4} value={values.accessibilityNotes} onChange={(e) => update("accessibilityNotes", e.target.value)} className={`${fieldClasses} resize-y`} placeholder="Describe other access requirements." />{field("accessibilityNotes")}<p className="mt-1 text-xs text-on-surface-variant">Up to 200 characters per note.</p></div></div>}
            {step === 4 && <div className="space-y-4"><section aria-labelledby="equipment-heading" className="grid gap-2"><h3 id="equipment-heading" className="text-[13px] font-semibold text-on-surface">Equipment</h3><EquipmentRequirementsEditor idPrefix="wizard" lines={values.equipmentRequirements} onChange={(lines) => { update("equipmentRequirements", lines); setFieldErrors((errors) => { const next = { ...errors }; delete next.equipmentRequirements; return next; }); }} availability={availability.state} onRetry={availability.retry} error={fieldErrors.equipmentRequirements} /></section><div><FormLabel htmlFor="technicalSupportNeeds">Technical support needs</FormLabel><textarea id="technicalSupportNeeds" {...errorProps("technicalSupportNeeds")} maxLength={2000} rows={4} value={values.technicalSupportNeeds} onChange={(e) => update("technicalSupportNeeds", e.target.value)} className={`${fieldClasses} resize-y`} placeholder="Describe any AV setup, presentation assistance or on-site technical support you need." />{field("technicalSupportNeeds")}<p className="mt-1 text-xs text-on-surface-variant">Optional, up to 2,000 characters. Your coordinator reviews these needs with your event request.</p></div></div>}
            {step === 5 && <div className="space-y-5"><div><FormLabel htmlFor="registrationEnabled">Event Access &amp; Enrollment Mechanism</FormLabel><label className="mt-1 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-control border border-[#e2e5f1] p-4"><span><span className="block text-sm font-semibold text-on-surface">Enable event registration</span><span className="mt-1 block text-xs text-on-surface-variant">Collect registrations for this event.</span></span><input id="registrationEnabled" type="checkbox" className="size-5 accent-primary" checked={values.isRegistrationEnabled} onChange={(e) => update("isRegistrationEnabled", e.target.checked)} /></label></div>{values.isRegistrationEnabled && <div><FormLabel htmlFor="registrationCapacity" required>Registration capacity</FormLabel><input id="registrationCapacity" {...errorProps("registrationCapacity")} type="number" min="1" step="1" value={values.registrationCapacity} onChange={(e) => update("registrationCapacity", e.target.value)} className={fieldClasses} placeholder="Maximum registrations" />{field("registrationCapacity")}</div>}<p className="text-xs leading-relaxed text-on-surface-variant">Registration capacity is supported. Access rules, ticketing, and waitlists are not available in this API.</p></div>}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[#e2e5f1] bg-white p-5">
            <h3 className="text-base font-bold text-on-surface">Save now. Complete later.</h3>
            <div className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${values.title.trim() ? "bg-[#eaf5ef] text-success" : "bg-surface-container-low text-on-surface-variant"}`}><span aria-hidden="true">{values.title.trim() ? "✓" : "•"}</span>{values.title.trim() ? "Event Title entered · draft eligible" : "Enter Event Title to save a draft"}</div>
            <p className="mt-3 text-[13px] leading-5 text-on-surface-variant">Event Title must be entered before any draft can be saved. No other field is compulsory for a draft.</p>
            <div className="my-3 border-t border-[#e2e5f1]" />
            <p className="text-[13px] leading-5 text-on-surface-variant">All remaining required fields must be completed for final submission. <span className="text-error">*</span> marks required fields.</p>
            {savedAt && <p className="mt-3 text-xs font-semibold text-success">Last auto-saved at {formatSavedTime(savedAt)}</p>}
          </section>
          <section className="rounded-lg bg-[#e6eeff] p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-primary"><span aria-hidden="true" className="grid size-[18px] place-items-center rounded-full border border-primary text-[11px]">i</span>{guidance[step].title}</h3>
            <p className="mt-2 text-[13px] leading-5 text-on-surface-variant">{guidance[step].body}</p>
          </section>
        </aside>
      </fieldset>

      <footer className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-[#e2e5f1] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-[13px] font-semibold text-on-surface">{values.title.trim() ? "Your title is entered. You can save a draft without finishing the form." : "Enter an Event Title to save a draft."}</p><p className="mt-0.5 text-xs text-on-surface-variant">After submission, the Coordinator Lead assigns a coordinator to review your request.</p></div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={() => void saveDraft(false)} disabled={saving || submitting || uncertainSubmission || !values.title.trim()} className="inline-flex h-11 items-center gap-2 rounded-[2px] bg-[#e6eeff] px-5 text-sm font-medium text-on-surface disabled:cursor-not-allowed disabled:opacity-50"><span aria-hidden="true">♧</span>{saving ? "Saving…" : "Save as Draft"}</button>
            <Button type="button" variant="secondary" disabled={step === 0 || saving || uncertainSubmission} onClick={() => setStep((current) => current - 1)} className="h-11 rounded-[2px] px-5">Back</Button>
            {step < steps.length - 1 ? <Button key="next-step" type="button" onClick={advance} className="h-11 rounded-[2px] px-5">Next <span aria-hidden="true">→</span></Button> : <Button key="submit-request" id="submit-request" type="submit" disabled={saving || submitting} className="h-11 rounded-[2px] px-5">{submitting ? "Submitting…" : uncertainSubmission ? "Retry submission" : "Submit Request"}</Button>}
          </div>
        </div>
      </footer>
    </fieldset></form>
  </div>;
}
