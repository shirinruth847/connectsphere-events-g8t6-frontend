"use client";

import { useEffect, useState } from "react";
import { fetchVenuePhotoBlob } from "@/lib/api/venues";

export type PhotoSource = { status: "loading" } | { status: "ready"; url: string } | { status: "error" };

type Loaded = { key: string; url: string | null };

// A blob URL for one gallery photo, revoked when the photo changes or the
// component unmounts. `version` refetches after the image is replaced; null
// means there is no photo to show.
export function useVenuePhoto(venueId: number, photoId: string | null | undefined, version = 0): PhotoSource | null {
  const key = photoId ? `${venueId}:${photoId}:${version}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!photoId || !key) return;
    const controller = new AbortController();
    let url: string | null = null;
    fetchVenuePhotoBlob(venueId, photoId, controller.signal)
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
  }, [venueId, photoId, key]);

  if (!key) return null;
  if (loaded?.key !== key) return { status: "loading" };
  return loaded.url ? { status: "ready", url: loaded.url } : { status: "error" };
}
