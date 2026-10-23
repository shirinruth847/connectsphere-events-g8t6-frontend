"use client";

import { useEffect, useState } from "react";
import { Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { useVenuePhoto } from "@/components/venues/use-venue-photo";
import { listEventVenuePhotos } from "@/lib/api/event-venues";
import type { VenuePhoto } from "@/lib/api/venues";

type PhotoList = { status: "loading" } | { status: "ready"; photos: VenuePhoto[] } | { status: "error" };

export function EventVenuePhoto({ eventId, venueId, photoId, alt, className }: {
  eventId: number;
  venueId: number;
  photoId: string | null;
  alt: string;
  className: string;
}) {
  const source = useVenuePhoto(venueId, photoId, 0, eventId);
  if (!source || source.status === "error") {
    return (
      <div className={`flex items-center justify-center bg-surface-container-low text-xs text-on-surface-variant ${className}`}>
        {source ? "Photo unavailable" : "No photo"}
      </div>
    );
  }
  if (source.status === "loading") return <Skeleton className={className} />;
  // A blob URL from an authenticated fetch, so next/image cannot load it.
  // min-w-0: in a grid, an image's natural width would otherwise widen its track.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source.url} alt={alt} className={`min-w-0 object-cover ${className}`} />;
}

// The venue's gallery, read-only (Venue Staff maintain it, T28).
export function VenuePhotoCarousel({ eventId, venueId, venueName }: { eventId: number; venueId: number; venueName: string }) {
  const [list, setList] = useState<PhotoList>({ status: "loading" });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    listEventVenuePhotos(eventId, venueId)
      .then((result) => { if (alive) setList({ status: "ready", photos: result.photos }); })
      .catch(() => { if (alive) setList({ status: "error" }); });
    return () => { alive = false; };
  }, [eventId, venueId]);

  if (list.status === "loading") return <Skeleton className="aspect-video w-full rounded-control" />;
  if (list.status === "error") {
    return <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">Photos cannot be loaded right now.</p>;
  }
  if (!list.photos.length) {
    return <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">No photos have been added for this venue.</p>;
  }

  const current = list.photos[Math.min(index, list.photos.length - 1)];
  const count = list.photos.length;
  return (
    <figure className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" aria-roledescription="carousel" aria-label={`${venueName} photos`}>
      <EventVenuePhoto
        eventId={eventId}
        venueId={venueId}
        photoId={current.photoId}
        alt={current.caption || `${venueName} photo ${index + 1}`}
        className="aspect-video w-full rounded-control"
      />
      <figcaption className="flex items-center justify-between gap-2 text-sm text-on-surface-variant">
        <span className="min-w-0 truncate">{current.caption || `Photo ${index + 1}`}</span>
        {count > 1 ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button variant="quiet" aria-label="Previous photo" onClick={() => setIndex((value) => (value - 1 + count) % count)}><Icon name="arrow-back" size={16} /></Button>
            <span aria-live="polite">{index + 1} / {count}</span>
            <Button variant="quiet" aria-label="Next photo" onClick={() => setIndex((value) => (value + 1) % count)}><Icon name="arrow-forward" size={16} /></Button>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
