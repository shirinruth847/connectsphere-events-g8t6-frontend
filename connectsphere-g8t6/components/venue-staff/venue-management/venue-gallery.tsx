"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { useVenuePhoto } from "@/components/venues/use-venue-photo";
import { ApiError } from "@/lib/api";
import {
  MAX_CAPTION_LENGTH,
  MAX_PHOTOS_PER_VENUE,
  PHOTO_TYPES,
  addVenuePhoto,
  deleteVenuePhoto,
  listVenuePhotos,
  photoFileProblem,
  replaceVenuePhotoImage,
  updateVenuePhoto,
  type VenuePhoto,
} from "@/lib/api/venues";

type GalleryState = { status: "loading" } | { status: "ready"; photos: VenuePhoto[] } | { status: "error"; message: string };
type Notice = { tone: "success" | "error"; text: string } | null;

const ACCEPT = PHOTO_TYPES.join(",");
const errorText = (caught: unknown, fallback: string) =>
  caught instanceof ApiError ? caught.fields?.image || caught.message : fallback;

function PhotoImage({ venueId, photo, className }: { venueId: number; photo: VenuePhoto; className: string }) {
  const source = useVenuePhoto(venueId, photo.photoId, photo.version);
  if (!source || source.status === "loading") return <Skeleton className={className} />;
  if (source.status === "error") {
    return (
      <div className={`grid place-items-center bg-surface-container-low text-xs text-on-surface-variant ${className}`}>
        Photo could not be loaded
      </div>
    );
  }
  return (
    // Blob URLs from the authenticated API, so next/image cannot optimise them.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={source.url} alt={photo.caption || `Venue photo ${photo.position + 1}`} className={`object-cover ${className}`} />
  );
}

// Photo gallery carousel at the top of a venue page (T28, SPM-181). Venue
// Staff add, re-caption, reorder, replace and delete photos; the first photo
// is the cover shown on My Venues cards. Stored in MongoDB.
export function VenueGallery({ venueId, venueName }: { venueId: number; venueName: string }) {
  const [state, setState] = useState<GalleryState>({ status: "loading" });
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<VenuePhoto | null>(null);
  const [deleting, setDeleting] = useState<VenuePhoto | null>(null);
  const [adding, setAdding] = useState<File | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (focusPhotoId?: string) => {
    try {
      const { photos } = await listVenuePhotos(venueId);
      setState({ status: "ready", photos });
      setIndex((current) => {
        const found = focusPhotoId ? photos.findIndex((photo) => photo.photoId === focusPhotoId) : -1;
        if (found >= 0) return found;
        return Math.min(current, Math.max(photos.length - 1, 0));
      });
    } catch (caught) {
      setState({ status: "error", message: errorText(caught, "The photos could not be loaded.") });
    }
  }, [venueId]);

  useEffect(() => {
    let alive = true;
    listVenuePhotos(venueId)
      .then(({ photos }) => { if (alive) setState({ status: "ready", photos }); })
      .catch((caught: unknown) => { if (alive) setState({ status: "error", message: errorText(caught, "The photos could not be loaded.") }); });
    return () => { alive = false; };
  }, [venueId]);

  const photos = state.status === "ready" ? state.photos : [];
  const current = photos[index] ?? null;
  const full = photos.length >= MAX_PHOTOS_PER_VENUE;

  const run = async (work: () => Promise<{ message: string; photoId?: string }>, failure: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const { message, photoId } = await work();
      await load(photoId);
      setNotice({ tone: "success", text: message });
      return true;
    } catch (caught) {
      setNotice({ tone: "error", text: errorText(caught, failure) });
      // The gallery may have changed elsewhere (e.g. a photo deleted); show the latest.
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 409)) await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>, onFile: (file: File) => void) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = photoFileProblem(file);
    if (problem) setNotice({ tone: "error", text: problem });
    else onFile(file);
  };

  const move = (photo: VenuePhoto, position: number, message: string) =>
    run(async () => {
      await updateVenuePhoto(venueId, photo.photoId, { position });
      return { message, photoId: photo.photoId };
    }, "The photo could not be moved.");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    if (event.key === "ArrowRight" && index < photos.length - 1) setIndex(index + 1);
  };

  return (
    <section aria-label="Photo gallery" className="grid gap-3 rounded-panel bg-surface-container-lowest p-3 shadow-elevation-1 sm:p-4">
      <input ref={addInput} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="gallery-add-input"
        onChange={(event) => pickFile(event, setAdding)} />
      <input ref={replaceInput} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="gallery-replace-input"
        onChange={(event) => pickFile(event, (file) => {
          if (!current) return;
          void run(async () => {
            await replaceVenuePhotoImage(venueId, current.photoId, file);
            return { message: "Photo replaced.", photoId: current.photoId };
          }, "The photo could not be replaced.");
        })} />

      {state.status === "loading" ? <Skeleton className="aspect-[16/7] w-full" /> : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Photos unavailable">
          {state.message}
          <div className="mt-3"><Button variant="secondary" onClick={() => { setState({ status: "loading" }); void load(); }}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" && !current ? (
        <div className="grid aspect-[16/7] place-items-center rounded-control bg-primary-fixed text-center text-primary">
          <div className="grid justify-items-center gap-2 px-4">
            <Icon name="venue" size={20} />
            <p className="text-sm font-semibold">No photos yet</p>
            <p className="text-xs text-on-surface-variant">The first photo you add becomes the cover on My Venues.</p>
          </div>
        </div>
      ) : null}

      {current ? (
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label={`${venueName} photos`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="relative overflow-hidden rounded-control bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div aria-live="polite" aria-atomic="true">
            <PhotoImage key={current.photoId} venueId={venueId} photo={current} className="aspect-[16/7] w-full" />
            <p className="sr-only">Photo {index + 1} of {photos.length}{current.caption ? `: ${current.caption}` : ""}</p>
          </div>
          {photos.length > 1 ? (
            <>
              <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0}
                className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow-elevation-2 disabled:opacity-40">
                <Icon name="arrow-back" size={20} label="Previous photo" />
              </button>
              <button type="button" onClick={() => setIndex(index + 1)} disabled={index === photos.length - 1}
                className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow-elevation-2 disabled:opacity-40">
                <Icon name="arrow-forward" size={20} label="Next photo" />
              </button>
            </>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-white">
            <p className="line-clamp-2 text-sm font-semibold" data-testid="gallery-caption">{current.caption || "No caption"}</p>
            <p className="text-xs font-semibold" aria-hidden="true">
              {index === 0 ? "Cover · " : ""}{index + 1} / {photos.length}
            </p>
          </div>
        </div>
      ) : null}

      {photos.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose a photo">
          {photos.map((photo, photoIndex) => (
            <li key={photo.photoId} className="shrink-0">
              <button type="button" onClick={() => setIndex(photoIndex)} aria-current={photoIndex === index ? "true" : undefined}
                aria-label={`Show photo ${photoIndex + 1}${photo.caption ? `: ${photo.caption}` : ""}`}
                className={`block overflow-hidden rounded-control border-2 ${photoIndex === index ? "border-primary" : "border-transparent"}`}>
                <PhotoImage venueId={venueId} photo={photo} className="h-14 w-20" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {state.status === "ready" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => addInput.current?.click()} disabled={busy || full}>Add photo</Button>
          {current ? (
            <>
              <Button variant="quiet" onClick={() => setEditing(current)} disabled={busy}><Icon name="edit" size={16} />Edit caption</Button>
              <Button variant="quiet" onClick={() => replaceInput.current?.click()} disabled={busy}>Replace image</Button>
              {index > 0 ? (
                <>
                  <Button variant="quiet" onClick={() => void move(current, 0, "Cover photo updated.")} disabled={busy}>Set as cover</Button>
                  <Button variant="quiet" onClick={() => void move(current, index - 1, "Photo moved earlier.")} disabled={busy}>Move earlier</Button>
                </>
              ) : null}
              {index < photos.length - 1 ? (
                <Button variant="quiet" onClick={() => void move(current, index + 1, "Photo moved later.")} disabled={busy}>Move later</Button>
              ) : null}
              <Button variant="quiet" className="text-error" onClick={() => setDeleting(current)} disabled={busy}><Icon name="close" size={16} />Delete photo</Button>
            </>
          ) : null}
          <p className="ml-auto text-xs text-on-surface-variant">
            {full ? `${MAX_PHOTOS_PER_VENUE} photos (the limit). Delete one to add another.` : `${photos.length} of ${MAX_PHOTOS_PER_VENUE} photos · JPEG, PNG or WebP, up to 2 MB`}
          </p>
        </div>
      ) : null}

      <div aria-live="polite">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>

      <CaptionDialog
        title="Add photo"
        open={adding !== null}
        initial=""
        submitLabel="Upload photo"
        busy={busy}
        fileName={adding?.name}
        onClose={() => setAdding(null)}
        onSubmit={async (caption) => {
          const file = adding;
          if (!file) return;
          const ok = await run(async () => {
            const { message, photo } = await addVenuePhoto(venueId, file, caption);
            return { message, photoId: photo.photoId };
          }, "The photo could not be uploaded.");
          if (ok) setAdding(null);
        }}
      />
      <CaptionDialog
        title="Edit caption"
        open={editing !== null}
        initial={editing?.caption ?? ""}
        submitLabel="Save caption"
        busy={busy}
        onClose={() => setEditing(null)}
        onSubmit={async (caption) => {
          const photo = editing;
          if (!photo) return;
          const ok = await run(async () => {
            const { message } = await updateVenuePhoto(venueId, photo.photoId, { caption: caption.trim() || null });
            return { message, photoId: photo.photoId };
          }, "The caption could not be saved.");
          if (ok) setEditing(null);
        }}
      />
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this photo?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setDeleting(null)}>Keep photo</Button>
            <Button variant="danger" disabled={busy} onClick={async () => {
              const photo = deleting;
              if (!photo) return;
              await run(async () => ({ message: (await deleteVenuePhoto(venueId, photo.photoId)).message }), "The photo could not be deleted.");
              setDeleting(null);
            }}>Delete photo</Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface">
          The photo is removed from the gallery for everyone.{deleting && deleting.position === 0 && photos.length > 1 ? " The next photo becomes the cover." : ""} This cannot be undone.
        </p>
      </Dialog>
    </section>
  );
}

function CaptionDialog(props: {
  title: string;
  open: boolean;
  initial: string;
  submitLabel: string;
  busy: boolean;
  fileName?: string;
  onClose: () => void;
  onSubmit: (caption: string) => Promise<void>;
}) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.title}>
      {/* Mounted only while open, so each opening starts from the saved caption. */}
      {props.open ? <CaptionForm {...props} /> : null}
    </Dialog>
  );
}

function CaptionForm({ initial, submitLabel, busy, fileName, onClose, onSubmit }: {
  initial: string;
  submitLabel: string;
  busy: boolean;
  fileName?: string;
  onClose: () => void;
  onSubmit: (caption: string) => Promise<void>;
}) {
  const [caption, setCaption] = useState(initial);
  const tooLong = caption.trim().length > MAX_CAPTION_LENGTH;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!tooLong) void onSubmit(caption);
  };
  return (
    <form noValidate onSubmit={submit} className="grid gap-3">
      {fileName ? <p className="text-sm text-on-surface-variant">File: <span className="font-semibold text-on-surface">{fileName}</span></p> : null}
      <label htmlFor="gallery-caption-input" className="text-sm font-semibold text-on-surface">Caption (optional)</label>
      <input id="gallery-caption-input" className={fieldClasses} value={caption} maxLength={MAX_CAPTION_LENGTH + 50}
        aria-invalid={tooLong || undefined} aria-describedby="gallery-caption-help" onChange={(event) => setCaption(event.target.value)} />
      <p id="gallery-caption-help" className={`text-xs ${tooLong ? "text-error" : "text-on-surface-variant"}`}>
        {tooLong ? `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.` : `${caption.trim().length} / ${MAX_CAPTION_LENGTH} characters`}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || tooLong}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
