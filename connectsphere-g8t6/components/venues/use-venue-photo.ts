"use client";

import { useEffect, useState } from "react";
import { fetchVenuePhotoBlob } from "@/lib/api/venues";
import { fetchSelectableVenuePhotoBlob } from "@/lib/api/event-venues";

export type PhotoSource = { status: "loading" } | { status: "ready"; url: string } | { status: "error" };

type Loaded = { key: string; url: string | null };

// A blob URL for one gallery photo, revoked when the photo changes or the
// component unmounts. `version` refetches after the image is replaced; null
// means there is no photo to show. `selectable` reads the photo through the
// read-only route for people choosing a venue (organisers, coordinators and
// Leads, SPM-72/74/76) instead of the Venue Staff gallery route.
export function useVenuePhoto(venueId: number, photoId: string | null | undefined, version = 0, selectable = false): PhotoSource | null {
  const key = photoId ? `${selectable ? "options" : "staff"}:${venueId}:${photoId}:${version}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!photoId || !key) return;
    const controller = new AbortController();
    let url: string | null = null;
    const request = selectable
      ? fetchSelectableVenuePhotoBlob(venueId, photoId, controller.signal)
      : fetchVenuePhotoBlob(venueId, photoId, controller.signal);
    request
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setLoaded({ key, url });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, url: null });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [venueId, photoId, key, selectable]);

  if (!key) return null;
  if (loaded?.key !== key) return { status: "loading" };
  return loaded.url ? { status: "ready", url: loaded.url } : { status: "error" };
}
