"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  getCoordinatorAvailability,
  getCurrentUser,
  getLeadAssignments,
  reassignCoordinator,
  type CoordinatorAvailability,
  type LeadAssignment,
} from "@/lib/api/events";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  AvailabilityMatrix,
  overlaps,
  TERMINAL_STATES,
} from "@/components/assignments/availability-matrix";
import {
  EVENT_STATUS_CONFIG,
  isMappedEventStatus,
  StatusChip,
} from "@/components/shared/status-chip";
import { CoordinatorShell } from "@/components/layout/coordinator-shell";

type Coordinator = CoordinatorAvailability;
type AuthState =
  | "loading"
  | "signed-out"
  | "ready"
  | "forbidden"
  | "configuration-error"
  | "error";

const REASSIGNABLE_STATES = new Set([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "AWAITING_CLARIFICATION",
  "PLANNING",
  "SAFETY_REVIEW",
  "PREPARATION",
  "CONFIRMED",
]);

const dateTimeFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : dateTimeFormat.format(date);
}

function isReassignable(status: string) {
  return REASSIGNABLE_STATES.has(status) && !TERMINAL_STATES.has(status);
}

export default function AssignmentsPage() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [accessToken, setAccessToken] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [leadAssignments, setLeadAssignments] = useState<LeadAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [coordinatorFilter, setCoordinatorFilter] = useState("all");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<
    number | null
  >(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  async function loadAssignments(token: string) {
    setLoading(true);
    setError("");
    try {
      const [availability, assignmentList] = await Promise.all([
        getCoordinatorAvailability(token),
        getLeadAssignments(token),
      ]);
      setCoordinators(availability.coordinators);
      setLeadAssignments(assignmentList.assignments);
    } catch (loadError) {
      const typedError = loadError as Error & { status?: number };
      setError(typedError.status === 403 ? "Your account is not permitted to view this queue." : typedError.message);
      setAuthState(typedError.status === 403 ? "forbidden" : "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const { data, error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (signInError || !data.session) throw signInError ?? new Error("Sign-in did not return an active session.");
      const result = await getCurrentUser(data.session.access_token);
      if (result.user.role === "COORDINATOR_LEAD") {
        setAuthState("ready");
        setAccessToken(data.session.access_token);
        setUserName(result.user.name);
        setUserEmail(result.user.email);
        await loadAssignments(data.session.access_token);
      } else {
        setAuthState("forbidden");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function refreshAssignments() {
    loadAssignments(accessToken);
  }

  useEffect(() => {
    setMounted(true);
    let mountedLocal = true;
    try {
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!mountedLocal) return;
        if (!session?.access_token) {
          setAuthState("signed-out");
          return;
        }
        try {
          const result = await getCurrentUser(session.access_token);
          setAccessToken(session.access_token);
          setUserName(result.user.name);
          setUserEmail(result.user.email);
          const canManageAssignments = result.user.role === "COORDINATOR_LEAD";
          setAuthState(canManageAssignments ? "ready" : "forbidden");
          if (canManageAssignments) await loadAssignments(session.access_token);
        } catch (loadError) {
          const typedError = loadError as Error & { status?: number };
          if (typedError.status === 401) {
            setAccessToken("");
            setAuthState("signed-out");
          } else {
            setError(typedError.message);
            setAuthState("error");
          }
        }
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          setAccessToken("");
          setAuthState("signed-out");
        }
      });
      return () => { mountedLocal = false; listener.subscription.unsubscribe(); };
    } catch (configurationError) {
      queueMicrotask(() => {
        if (!mountedLocal) return;
        setError((configurationError as Error).message);
        setAuthState("configuration-error");
      });
    }
  }, []);

  // Derived state - must be before early returns
  const assignments = useMemo(() => {
    return leadAssignments
      .filter((a) => !TERMINAL_STATES.has(a.status))
      .map((a) => ({
        event: a,
        coordinatorId: a.coordinatorId,
        coordinatorName: a.coordinatorName,
      }));
  }, [leadAssignments]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter(({ event, coordinatorId, coordinatorName }) => {
      const matchesSearch =
        search === "" ||
        event.title.toLowerCase().includes(search.toLowerCase()) ||
        event.requestId.toLowerCase().includes(search.toLowerCase()) ||
        coordinatorName.toLowerCase().includes(search.toLowerCase());
      const matchesCoordinator =
        coordinatorFilter === "all" ||
        String(coordinatorId) === coordinatorFilter;
      return matchesSearch && matchesCoordinator;
    });
  }, [assignments, search, coordinatorFilter]);

  const selectedAssignment = assignments.find(
    (a) => a.event.eventId === selectedEventId
  );
  const selectedConflict = selectedAssignment
    ? overlaps(selectedAssignment.event, selectedAssignment.event)
    : null;

  if (authState === "loading" && !mounted) {
    return (
      <CoordinatorShell userName="Loading..." userEmail="">
        <div className="empty-state" role="status">
          <h2>Loading assignments…</h2>
          <p>Checking your authenticated session.</p>
        </div>
      </CoordinatorShell>
    );
  }

  if (authState === "configuration-error") {
    return (
      <CoordinatorShell userName="Error" userEmail="">
        <div className="access-denied">
          <div className="access-card">
            <h1>Supabase setup required</h1>
            <p>{error}</p>
          </div>
        </div>
      </CoordinatorShell>
    );
  }

  if (authState === "signed-out") {
    return (
      <CoordinatorShell userName="Sign in" userEmail="">
        <div className="access-denied">
          <div className="access-card">
            <span className="eyebrow">CONNECTSPHERE AUTHENTICATION</span>
            <h1>Sign in to assignment oversight</h1>
            <p>
              Use an Event Coordinator Lead account to review and reassign active
              events.
            </p>
            <form className="lead-sign-in" onSubmit={handleSignIn}>
              <label htmlFor="lead-email">Email</label>
              <input
                id="lead-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label htmlFor="lead-password">Password</label>
              <input
                id="lead-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              {error && (
                <div className="error-alert" role="alert">
                  {error}
                </div>
              )}
              <button className="button button-primary" type="submit">
                Sign in
              </button>
            </form>
          </div>
        </div>
      </CoordinatorShell>
    );
  }

  if (authState === "forbidden") {
    return (
      <CoordinatorShell userName={userName} userEmail={userEmail}>
        <div className="access-denied">
          <div className="access-card">
            <span className="eyebrow">EVENT COORDINATOR LEAD WORKSPACE</span>
            <span className="lock-mark" aria-hidden="true">
              ⌑
            </span>
            <h1>Lead access required</h1>
            <p>
              Coordinator assignment and reassignment are restricted to an Event
              Coordinator Lead.
            </p>
            <Link className="button button-secondary" href="/events">
              Return to event requests
            </Link>
          </div>
        </div>
      </CoordinatorShell>
    );
}
  if (authState === "error") {
    return (
      <CoordinatorShell userName={userName} userEmail={userEmail}>
        <div className="access-denied">
          <div className="access-card">
            <h1>Unable to load assignments</h1>
            <p>{error}</p>
            <button
              className="button button-primary"
              type="button"
              onClick={refreshAssignments}
            >
              Retry
            </button>
          </div>
        </div>
      </CoordinatorShell>
    );
  }
  
  function openReassignment(assignment: { event: LeadAssignment; coordinatorId: number; coordinatorName: string }, trigger: HTMLElement) {
    setSelectedEventId(assignment.event.eventId);
    setSelectedCoordinatorId(null);
    setError("");
    triggerRef.current = trigger;
  }

  function closeReassignment() {
    setSelectedEventId(null);
    setSelectedCoordinatorId(null);
    setError("");
    triggerRef.current?.focus();
  }

  async function handleReassignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAssignment || selectedCoordinatorId === null) return;
    if (!isReassignable(selectedAssignment.event.status)) {
      setError("This event's status does not allow reassignment.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await reassignCoordinator(
        selectedAssignment.event.eventId,
        selectedCoordinatorId,
        selectedAssignment.coordinatorId,
        accessToken
      );
      setFeedback(
        `${selectedAssignment.event.requestId} reassigned to ${coordinators.find((c) => c.coordinatorId === selectedCoordinatorId)?.name}.`
      );
      closeReassignment();
      await loadAssignments(accessToken);
    } catch (reassignmentError) {
      const typedError = reassignmentError as Error & { status?: number; code?: string };
      setError(typedError.code === "COORDINATOR_CONFLICT" ? "The selected coordinator became unavailable. Choose another coordinator." : typedError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const modal =
    selectedAssignment && mounted ? (
      <div
        className="modal-backdrop assignments-modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeReassignment();
        }}
      >
        <section
          aria-labelledby="reassign-title"
          aria-modal="true"
          className="modal reassign-modal"
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <header className="modal-header">
            <div>
              <span className="eyebrow">COORDINATOR CHANGE</span>
              <h2 id="reassign-title">Reassign event coordinator</h2>
              <span className="reference-tag">
                {selectedAssignment.event.requestId}
              </span>
            </div>
            <button
              className="close-button"
              type="button"
              onClick={closeReassignment}
              aria-label="Close reassignment dialog"
              disabled={submitting}
            >
              ×
            </button>
          </header>
          <div className="modal-body">
            <div className="reassign-event-summary">
              <div>
                <StatusChip status={selectedAssignment.event.status} />
                <h3>{selectedAssignment.event.title}</h3>
              </div>
              <dl className="reassign-details">
                <div>
                  <dt>Currently assigned</dt>
                  <dd>{selectedAssignment.coordinatorName}</dd>
                </div>
                <div>
                  <dt>Event time</dt>
                  <dd>
                    {formatDateTime(selectedAssignment.event.startDatetime)} –{" "}
                    {formatDateTime(selectedAssignment.event.endDatetime)}
                  </dd>
                </div>
                <div>
                  <dt>Expected attendance</dt>
                  <dd>
                    {selectedAssignment.event.expectedAttendance.toLocaleString()}{" "}
                    people
                  </dd>
                </div>
              </dl>
            </div>
            {!isMappedEventStatus(selectedAssignment.event.status) && (
              <p className="status-mapping-note" role="note">
                The backend status “{selectedAssignment.event.status}” is not
                mapped to the approved event lifecycle. Reassignment is disabled
                until that status is resolved.
              </p>
            )}
            {error && (
              <div className="error-alert" role="alert">
                <strong>Reassignment could not be completed</strong>
                <span>{error}</span>
              </div>
            )}
            <form id="reassign-form" onSubmit={handleReassignment}>
              <fieldset
                className="coordinator-options"
                disabled={
                  submitting || !isReassignable(selectedAssignment.event.status)
                }
              >
                <legend>Choose a different Coordinator</legend>
                <AvailabilityMatrix
                  coordinators={coordinators}
                  requested={selectedAssignment.event}
                  excludeCoordinatorId={selectedAssignment.coordinatorId}
                  selectedCoordinatorId={selectedCoordinatorId}
                  onSelect={(coordinatorId) => {
                    setSelectedCoordinatorId(coordinatorId);
                    setError("");
                  }}
                />
              </fieldset>
            </form>
          </div>
          <footer className="modal-footer">
            <button
              className="button button-secondary"
              type="button"
              onClick={closeReassignment}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              form="reassign-form"
              type="submit"
              disabled={
                !selectedCoordinatorId ||
                Boolean(selectedConflict) ||
                submitting ||
                !isReassignable(selectedAssignment.event.status)
              }
            >
              {submitting ? "Reassigning…" : "Confirm reassignment"}
            </button>
          </footer>
        </section>
      </div>
    ) : null;

  return (
    <CoordinatorShell userName={userName} userEmail={userEmail}>
      <div className="assignments-content">
        <section className="assignments-page-header">
          <div>
            <span className="eyebrow">
              EVENT COORDINATOR LEAD · ASSIGNMENT OVERSIGHT
            </span>
            <h1>Coordinator assignments</h1>
            <p>
              Review active event ownership and reassign a Coordinator when
              needed.
            </p>
          </div>
          <div className="header-actions">
            <div className="stat-chip">
              <strong>
                {
                  assignments.filter(
                    ({ event }) => !TERMINAL_STATES.has(event.status),
                  ).length
                }
              </strong>
              <span>Active assignments</span>
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={refreshAssignments}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh assignments"}
            </button>
          </div>
        </section>

        {feedback && (
          <div className="success-banner" role="status" aria-live="polite">
            {feedback}
            <button
              type="button"
              onClick={() => setFeedback("")}
              aria-label="Dismiss success message"
            >
              ×
            </button>
          </div>
        )}
        {error && !selectedAssignment && (
          <div className="error-alert" role="alert">
            <strong>Assignment action needs attention</strong>
            <span>{error}</span>
          </div>
        )}

        <section className="assignment-section-heading">
          <div>
            <h2>Current assignments</h2>
            <p>
              Assignment changes take effect after the backend confirms them.
            </p>
          </div>
          <div className="assignment-filters">
            <label className="sr-only" htmlFor="assignment-search">
              Search event or Coordinator
            </label>
            <input
              id="assignment-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by event, request ID or Coordinator"
            />
            <label className="sr-only" htmlFor="coordinator-filter">
              Filter by current Coordinator
            </label>
            <select
              id="coordinator-filter"
              value={coordinatorFilter}
              onChange={(event) => setCoordinatorFilter(event.target.value)}
            >
              <option value="all">All Coordinators</option>
              {coordinators.map((coordinator) => (
                <option
                  key={coordinator.coordinatorId}
                  value={coordinator.coordinatorId}
                >
                  {coordinator.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {loading ? (
          <div className="empty-state" role="status">
            <h2>Loading assignments…</h2>
            <p>Fetching current Coordinator ownership.</p>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              ✓
            </span>
            <h2>
              {assignments.length === 0
                ? "No active assignments"
                : "No matching assignments"}
            </h2>
            <p>
              {assignments.length === 0
                ? "Assigned events will appear here for Lead oversight."
                : "Try a different search or Coordinator filter."}
            </p>
          </div>
        ) : (
          <div className="assignment-list">
            {filteredAssignments.map((assignment) => {
              const { event, coordinatorName } = assignment;
              const knownStatus = isMappedEventStatus(event.status);
              const reassignable = knownStatus && isReassignable(event.status);
              const tone = knownStatus
                ? `assignment-card--${EVENT_STATUS_CONFIG[event.status as keyof typeof EVENT_STATUS_CONFIG].cardTone}`
                : "assignment-card--unknown";
              return (
                <article
                  className={`assignment-card ${tone}`}
                  key={event.eventId}
                >
                  <div className="assignment-card-top">
                    <StatusChip status={event.status} />
                    <span className="reference-tag">{event.requestId}</span>
                  </div>
                  <div className="assignment-card-main">
                    <div>
                      <h3>{event.title}</h3>
                      <p>
                        Currently assigned to <strong>{coordinatorName}</strong>
                      </p>
                    </div>
                    <span className="assignment-date">
                      {formatDateTime(event.startDatetime)}
                    </span>
                  </div>
                  <dl className="assignment-details">
                    <div>
                      <dt>Event time</dt>
                      <dd>
                        {formatDateTime(event.startDatetime)} –{" "}
                        {formatDateTime(event.endDatetime)}
                      </dd>
                    </div>
                    <div>
                      <dt>Expected attendance</dt>
                      <dd>
                        {event.expectedAttendance.toLocaleString()} people
                      </dd>
                    </div>
                    <div>
                      <dt>Organisation</dt>
                      <dd>{event.organisation?.name ?? "ConnectSphere"}</dd>
                    </div>
                  </dl>
                  {!knownStatus && (
                    <p className="status-mapping-note" role="note">
                      Unmapped backend status “{event.status}”. Reassignment is
                      disabled until the event lifecycle mapping is resolved.
                    </p>
                  )}
                  {TERMINAL_STATES.has(event.status) && (
                    <p className="read-only-note">
                      This event is closed and its assignment is read-only.
                    </p>
                  )}
                  <footer className="assignment-card-footer">
                    <span>
                      {reassignable
                        ? "Lead action · reassignment available"
                        : "Read-only assignment"}
                    </span>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={!reassignable}
                      onClick={(clickEvent) =>
                        openReassignment(assignment, clickEvent.currentTarget)
                      }
                      aria-label={`Reassign ${event.requestId}, ${event.title}, currently assigned to ${coordinatorName}`}
                    >
                      Reassign Coordinator
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </CoordinatorShell>
  );
}