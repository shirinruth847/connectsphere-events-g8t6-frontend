"use client";

import { useEffect, useState } from "react";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, SectionCard } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type AssignedEvent = {
  eventId: number;
  title: string;
  status: string;
  startDatetime?: string;
};

export function CoordinatorDashboard() {
  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void apiRequest<{ events: AssignedEvent[] }>("/events/assigned")
      .then(data => { if (alive) setEvents(data.events); })
      .catch(error => { if (alive) setError(error.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return <PageContent title={`${ROLE_LABELS.COORDINATOR} dashboard`} eyebrow={ROLE_LABELS.COORDINATOR}>
    <h2 className="text-xl font-semibold">Your assigned events</h2>
    {error && <AlertBanner tone="error">{error}</AlertBanner>}
    {loading ? <p>Loading assigned events…</p> : events.length ? events.map(event => (
      <SectionCard key={event.eventId}>
        <h3 className="font-semibold">{event.title}</h3>
        <p>{event.status.replaceAll("_", " ")}</p>
        {event.startDatetime && <p>{new Date(event.startDatetime).toLocaleString()}</p>}
      </SectionCard>
    )) : <p>No events are currently assigned to you.</p>}
  </PageContent>;
}
