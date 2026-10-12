"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertBanner, Button, FormLabel, SectionCard, fieldClasses } from "@/components/shared/primitives";
import { apiRequest, ApiError } from "@/lib/api";
import { ACCESSIBILITY_OPTIONS, EMPTY_EVENT_FORM, EventFormValues, EventRequest, formValuesFromEvent, formatSavedTime, toPayload } from "@/lib/events";

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
  "Note technical and equipment needs for event planning.",
  "Set up the supported event registration options.",
];
const guidance = [
  { title: "Event identity & purpose", body: "A clear title and concise event scope help your coordinator understand the request. The title is the only field required to save a draft." },
  { title: "Attendance & scheduling", body: "Submit at least 48 hours before the proposed start. Your end time must follow the start time; attendance is used during coordinator review." },
  { title: "Venue coordination", body: "Venue and layout catalogues are not connected yet. This request will not reserve a room or create a venue hold." },
  { title: "Accessibility planning", body: "Share the access arrangements your attendees need. The event team can follow up if more detail is required." },
  { title: "Equipment planning", body: "Equipment selection is not connected yet. Equipment requirements will be left empty in this request." },
  { title: "Registration", body: "You can enable registration and set a capacity. Access controls and waitlists are not supported by this request API." },
];
type SaveResponse = { event?: EventRequest; savedAt?: string };

export function EventRequestWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const draftId = params.get("draft");
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(Boolean(draftId));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [eventId, setEventId] = useState<number | null>(draftId ? Number(draftId) : null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changedRef = useRef(false);
  const editRevision = useRef(0);

  useEffect(() => {
    if (!draftId) return;
    let active = true;
    void apiRequest<{ event?: EventRequest }>(`/events/${draftId}`).then((result) => {
      if (active && result.event) { setValues(formValuesFromEvent(result.event)); setEventId(result.event.eventId); setDirty(false); }
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load this draft."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [draftId]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (changedRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    const confirmNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (anchor && changedRef.current && !window.confirm("You have unsaved changes. Leave this request? Your last autosave may not include them.")) event.preventDefault();
    };
    document.addEventListener("click", confirmNavigation, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", confirmNavigation, true); };
  }, []);

  const saveDraft = useCallback(async (auto = false) => {
    if (!values.title.trim()) return;
    const revisionAtStart = editRevision.current;
    setSaving(true); setError(""); setFieldErrors({});
    try {
      const payload = toPayload(values);
      let result: SaveResponse;
      if (eventId) {
        result = await apiRequest<SaveResponse>(`/events/${eventId}/draft`, {
          method: "PUT", body: JSON.stringify({ ...payload, isAutoSave: auto }),
        });
      } else {
        result = await apiRequest<SaveResponse>("/events/drafts", {
          method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload),
        });
      }
      const savedEvent = result.event;
      if (savedEvent) setEventId(savedEvent.eventId);
      if (result.savedAt) setSavedAt(result.savedAt);
      if (!auto) {
        if (revisionAtStart === editRevision.current) {
          setDirty(false);
          changedRef.current = false;
          const id = savedEvent?.eventId ?? eventId;
          router.push(`/dashboard?saved=draft${id ? `&draft=${id}` : ""}`);
        } else {
          setDirty(true);
          changedRef.current = true;
          setNotice("The draft saved, and newer edits are still waiting to be saved.");
        }
      } else if (revisionAtStart === editRevision.current) {
        setDirty(false);
        changedRef.current = false;
      } else {
        setDirty(true);
        changedRef.current = true;
      }
    } catch (caught) {
      if (caught instanceof ApiError) { setError(caught.message); setFieldErrors(caught.fields); }
      else setError(caught instanceof Error ? caught.message : "Draft could not be saved.");
    } finally { setSaving(false); }
  }, [eventId, router, values]);

  useEffect(() => {
    if (!dirty || !values.title.trim() || loading) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveDraft(true); }, 30_000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirty, loading, saveDraft, values]);

  const update = (key: keyof EventFormValues, value: string | boolean | string[]) => {
    editRevision.current += 1;
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true); changedRef.current = true;
    setNotice(""); setError("");
  };

  const validate = (index: number, complete = false) => {
    const errors: Record<string, string> = {};
    if (index === 0) {
      if (!values.title.trim()) errors.title = "Enter an event title.";
      if (values.title.trim().length > 200) errors.title = "The title must be 200 characters or fewer.";
      if (complete && !values.purpose.trim()) errors.purpose = "Enter the event purpose.";
      if (values.purpose.length > 2000) errors.purpose = "Purpose must be 2,000 characters or fewer.";
      if (complete && !values.description.trim()) errors.description = "Enter an event description.";
      if (values.description.length > 5000) errors.description = "Description must be 5,000 characters or fewer.";
    }
    if (index === 1) {
      if (complete && !values.startDatetime) errors.startDatetime = "Choose a start date and time.";
      if (complete && !values.endDatetime) errors.endDatetime = "Choose an end date and time.";
      if (values.startDatetime && values.endDatetime && new Date(values.endDatetime) <= new Date(values.startDatetime)) errors.endDatetime = "End time must be after the start time.";
      if (complete && !values.expectedAttendance.trim()) errors.expectedAttendance = "Enter the expected attendance.";
      if (values.expectedAttendance && (!Number.isInteger(Number(values.expectedAttendance)) || Number(values.expectedAttendance) < 1)) errors.expectedAttendance = "Enter a whole number greater than zero.";
    }
    if (index === 3 && values.accessibilityNotes.length > 200) errors.accessibilityNotes = "Keep each accessibility note to 200 characters or fewer.";
    if (index === 5 && values.isRegistrationEnabled && complete && !values.registrationCapacity.trim()) errors.registrationCapacity = "Enter a registration capacity.";
    if (index === 5 && values.isRegistrationEnabled && values.registrationCapacity && (!Number.isInteger(Number(values.registrationCapacity)) || Number(values.registrationCapacity) < 1)) errors.registrationCapacity = "Enter a whole number greater than zero.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const advance = () => {
    if (!validate(step)) return;
    setStep((current) => Math.min(steps.length - 1, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!steps.every((_, index) => validate(index, true))) {
      const firstInvalid = steps.findIndex((_, index) => !validate(index, true));
      setStep(Math.max(0, firstInvalid));
      return;
    }
    const start = values.startDatetime ? new Date(values.startDatetime).getTime() : NaN;
    const earliest = Date.now() + 48 * 60 * 60 * 1000;
    if (Number.isFinite(start) && start < earliest) {
      setFieldErrors({ startDatetime: "Choose a start time at least 48 hours from now." });
      setStep(1); return;
    }
    setSaving(true); setError("");
    try {
      const payload = toPayload(values);
      if (eventId) {
        await apiRequest(`/events/${eventId}/draft`, { method: "PUT", body: JSON.stringify({ ...payload, isAutoSave: false }) });
        await apiRequest(`/events/${eventId}/submit`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiRequest("/events", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) });
      }
      changedRef.current = false;
      router.push("/dashboard?submitted=1");
    } catch (caught) {
      if (caught instanceof ApiError) { setError(caught.message); setFieldErrors(caught.fields); }
      else setError(caught instanceof Error ? caught.message : "The event request could not be submitted.");
      setStep(0);
    } finally { setSaving(false); }
  };

  if (loading) return <SectionCard><p className="text-sm text-on-surface-variant">Loading draft…</p></SectionCard>;

  const field = (key: keyof EventFormValues) => fieldErrors[key] ? <p className="mt-1 text-xs text-error" role="alert">{fieldErrors[key]}</p> : null;
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
          return <button key={item} type="button" onClick={() => { if (index <= step) setStep(index); }} aria-current={active ? "step" : undefined} className="relative z-[1] flex min-w-0 flex-col items-center gap-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span className={`grid size-11 place-items-center rounded-full border-2 text-lg font-bold ${active ? "border-primary bg-primary text-white" : completed ? "border-success bg-[#eaf5ef] text-success" : "border-[#e2e5f1] bg-white text-on-surface-variant"}`}>{completed ? <span aria-label="Complete">✓</span> : index + 1}</span>
            <span className={`max-w-[180px] text-xs font-semibold leading-[18px] ${active ? "text-primary" : "text-on-surface"}`}>{item}</span>
            <span className={`text-[11px] ${active ? "text-primary" : completed ? "text-success" : "text-outline"}`}>{active ? "In progress" : completed ? "Complete" : "Upcoming"}</span>
          </button>;
        })}
      </div>
    </nav>

    {error ? <div className="mb-4"><AlertBanner tone="error" title="We could not save this request">{error}</AlertBanner></div> : null}
    {notice ? <div className="mb-4"><AlertBanner tone="success">{notice}</AlertBanner></div> : null}

    <form onSubmit={submit}>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_332px]">
        <section className="min-h-[596px] overflow-hidden rounded-lg border border-[#e2e5f1] bg-white shadow-elevation-1">
          <header className="flex flex-wrap items-start justify-between gap-3 bg-[#eff4ff] px-5 py-5 sm:px-7 sm:py-6">
            <div><p className="mb-2 text-[11px] font-bold uppercase tracking-label text-primary">Step {step + 1} of 6</p><h2 className="text-xl font-semibold leading-7 text-on-surface sm:text-[22px]">{steps[step]}</h2><p className="mt-1 text-[13px] text-on-surface-variant">{stepDescriptions[step]}</p></div>
            <span className="text-xs text-on-surface-variant">{values.title.trim() ? "Title required for drafts · complete all required fields to submit" : "Title required for drafts"}</span>
          </header>
          <div className="space-y-5 p-5 sm:space-y-6 sm:p-7">
            {step === 0 && <>
              <div><FormLabel htmlFor="title" required>Event Title</FormLabel><input id="title" maxLength={200} required value={values.title} onChange={(e) => update("title", e.target.value)} className={fieldClasses} placeholder="Enter a clear event title" aria-invalid={Boolean(fieldErrors.title)} />{field("title")}<p className="mt-1.5 text-xs text-on-surface-variant">Required to save a draft and to submit. Save Draft is unavailable until an Event Title is entered.</p></div>
              <div><FormLabel htmlFor="purpose" required>Event Purpose</FormLabel><input id="purpose" maxLength={2000} value={values.purpose} onChange={(e) => update("purpose", e.target.value)} className={fieldClasses} placeholder="What is the event for?" />{field("purpose")}</div>
              <div><div className="flex items-center justify-between gap-3"><FormLabel htmlFor="description" required>Executive Abstract &amp; Event Scope</FormLabel><span className="text-xs text-on-surface-variant">{values.description.length} / 5,000 chars</span></div><textarea id="description" maxLength={5000} rows={5} value={values.description} onChange={(e) => update("description", e.target.value)} className={`${fieldClasses} min-h-36 resize-y`} placeholder="Summarise the event, its audience, and what attendees will experience." />{field("description")}<p className="mt-1.5 text-xs text-on-surface-variant">Keep concise: this summary is shared with event planning teams.</p></div>
              <p className="rounded-control bg-surface-container-low p-3 text-xs leading-relaxed text-on-surface-variant">Classification and hosting department are shown in the prototype, but the current event API does not accept those fields.</p>
            </>}
            {step === 1 && <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <div><FormLabel htmlFor="startDatetime" required>Primary Proposed Date</FormLabel><input id="startDatetime" type="datetime-local" value={values.startDatetime} onChange={(e) => update("startDatetime", e.target.value)} className={fieldClasses} />{field("startDatetime")}<p className="mt-1.5 text-xs text-on-surface-variant">Submit at least 48 hours before the event.</p></div>
              <div><FormLabel htmlFor="endDatetime" required>Event End Date &amp; Time</FormLabel><input id="endDatetime" type="datetime-local" value={values.endDatetime} onChange={(e) => update("endDatetime", e.target.value)} className={fieldClasses} />{field("endDatetime")}</div>
              <div><FormLabel htmlFor="expectedAttendance" required>Targeted In-Person Headcount</FormLabel><input id="expectedAttendance" type="number" min="1" step="1" value={values.expectedAttendance} onChange={(e) => update("expectedAttendance", e.target.value)} className={fieldClasses} placeholder="Expected attendance" />{field("expectedAttendance")}</div>
            </div>}
            {step === 2 && <div className="space-y-4"><AlertBanner tone="info" title="Venue choices are unavailable">Your request can still be submitted. Venue preferences and layout selections will be omitted until the catalogue is connected.</AlertBanner><div><FormLabel htmlFor="layout">Preferred Seating &amp; Room Geometry</FormLabel><select id="layout" disabled className={`${fieldClasses} disabled:opacity-70`}><option>No preference available</option></select><p className="mt-1.5 text-xs text-on-surface-variant">No room will be selected or held by this form.</p></div></div>}
            {step === 3 && <div className="space-y-5"><div><p className="mb-3 text-[13px] font-semibold text-on-surface">Access and accommodation requirements</p><div className="grid gap-2 sm:grid-cols-2">{ACCESSIBILITY_OPTIONS.map((option) => <label key={option} className="flex min-h-12 items-start gap-3 rounded-control border border-[#e2e5f1] bg-white p-3 text-[13px] leading-5 text-on-surface"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={values.accessibilityNeeds.includes(option)} onChange={(e) => update("accessibilityNeeds", e.target.checked ? [...values.accessibilityNeeds, option] : values.accessibilityNeeds.filter((item) => item !== option))} />{option}</label>)}</div></div><div><FormLabel htmlFor="accessibilityNotes">Other accessibility notes</FormLabel><textarea id="accessibilityNotes" maxLength={200} rows={4} value={values.accessibilityNotes} onChange={(e) => update("accessibilityNotes", e.target.value)} className={`${fieldClasses} resize-y`} placeholder="Describe other access requirements." />{field("accessibilityNotes")}<p className="mt-1 text-xs text-on-surface-variant">Up to 200 characters per note.</p></div></div>}
            {step === 4 && <div className="space-y-4"><AlertBanner tone="info" title="Equipment catalogue is unavailable">The prototype includes equipment selections, but no equipment catalogue is exposed by the current API. This request will leave equipment requirements empty.</AlertBanner><div className="rounded-control border border-[#e2e5f1] bg-surface-container-low p-4"><p className="text-sm font-semibold text-on-surface">Technical requirements</p><p className="mt-1 text-sm leading-relaxed text-on-surface-variant">Your event coordinator can follow up about AV, staging, and other equipment needs once the request is under review.</p></div></div>}
            {step === 5 && <div className="space-y-5"><div><FormLabel htmlFor="registrationEnabled">Event Access &amp; Enrollment Mechanism</FormLabel><label className="mt-1 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-control border border-[#e2e5f1] p-4"><span><span className="block text-sm font-semibold text-on-surface">Enable event registration</span><span className="mt-1 block text-xs text-on-surface-variant">Collect registrations for this event.</span></span><input id="registrationEnabled" type="checkbox" className="size-5 accent-primary" checked={values.isRegistrationEnabled} onChange={(e) => update("isRegistrationEnabled", e.target.checked)} /></label></div>{values.isRegistrationEnabled && <div><FormLabel htmlFor="registrationCapacity" required>Registration capacity</FormLabel><input id="registrationCapacity" type="number" min="1" step="1" value={values.registrationCapacity} onChange={(e) => update("registrationCapacity", e.target.value)} className={fieldClasses} placeholder="Maximum registrations" />{field("registrationCapacity")}</div>}<p className="text-xs leading-relaxed text-on-surface-variant">Registration capacity is supported. Access rules, ticketing, and waitlists are not available in this API.</p></div>}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[#e2e5f1] bg-white p-5">
            <h3 className="text-base font-bold text-on-surface">Save now. Complete later.</h3>
            <div className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${values.title.trim() ? "bg-[#eaf5ef] text-success" : "bg-surface-container-low text-on-surface-variant"}`}><span aria-hidden="true">{values.title.trim() ? "✓" : "•"}</span>{values.title.trim() ? "Event Title entered · draft eligible" : "Enter Event Title to save a draft"}</div>
            <p className="mt-3 text-[13px] leading-5 text-on-surface-variant">Event Title must be entered before any draft can be saved. No other field is compulsory for a draft.</p>
            <div className="my-3 border-t border-[#e2e5f1]" />
            <p className="text-[13px] leading-5 text-on-surface-variant">All remaining required fields must be completed for final submission. <span className="text-error">*</span> marks required fields.</p>
            {savedAt && <p className="mt-3 text-xs font-semibold text-success">Last saved at {formatSavedTime(savedAt)}</p>}
          </section>
          <section className="rounded-lg bg-[#e6eeff] p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-primary"><span aria-hidden="true" className="grid size-[18px] place-items-center rounded-full border border-primary text-[11px]">i</span>{guidance[step].title}</h3>
            <p className="mt-2 text-[13px] leading-5 text-on-surface-variant">{guidance[step].body}</p>
          </section>
        </aside>
      </div>

      <footer className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-[#e2e5f1] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-[13px] font-semibold text-on-surface">{values.title.trim() ? "Your title is entered. You can save a draft without finishing the form." : "Enter an Event Title to save a draft."}</p><p className="mt-0.5 text-xs text-on-surface-variant">Your request will be evaluated by a Venue Coordinator within 2 business days.</p></div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={() => void saveDraft(false)} disabled={saving || !values.title.trim()} className="inline-flex h-11 items-center gap-2 rounded-[2px] bg-[#e6eeff] px-5 text-sm font-medium text-on-surface disabled:cursor-not-allowed disabled:opacity-50"><span aria-hidden="true">♧</span>{saving ? "Saving…" : "Save Draft"}</button>
            <Button type="button" variant="secondary" disabled={step === 0 || saving} onClick={() => setStep((current) => current - 1)} className="h-11 rounded-[2px] px-5">Back</Button>
            {step < steps.length - 1 ? <Button type="button" onClick={advance} className="h-11 rounded-[2px] px-5">Next <span aria-hidden="true">→</span></Button> : <Button type="submit" disabled={saving} className="h-11 rounded-[2px] px-5">{saving ? "Submitting…" : "Submit request"}</Button>}
          </div>
        </div>
      </footer>
    </form>
  </div>;
}
