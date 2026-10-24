"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, Skeleton, buttonClasses, fieldClasses } from "@/components/shared/primitives";
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
type Notice = { tone: "success" | "error" | "warning"; text: string } | null;

const ACCEPT = PHOTO_TYPES.join(",");
const UPLOAD_INPUT_ID = "gallery-upload-input";
const REPLACE_INPUT_ID = "gallery-replace-input";
const errorText = (caught: unknown, fallback: string) =>
  caught instanceof ApiError ? caught.fields?.image || caught.message : fallback;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

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

// A real <label> for the hidden file input, so a click opens the browser's
// file picker natively. The label is the keyboard stop too: Enter or Space
// opens the same picker.
function FilePickerLabel({ htmlFor, disabled, children, className }: { htmlFor: string; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!disabled) (document.getElementById(htmlFor) as HTMLInputElement | null)?.click();
      }}
      className={`${className ?? buttonClasses("secondary")} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${disabled ? "pointer-events-none opacity-55" : ""}`}
    >
      {children}
    </label>
  );
}

// Photo gallery carousel at the top of a venue page (T28, SPM-181). Venue
// Staff upload photos (file picker or drag and drop, several at once), then
// edit a photo's caption, position or image, or delete it; the first photo is
// the cover shown on My Venues cards. Stored in MongoDB.
export function VenueGallery({ venueId, venueName }: { venueId: number; venueName: string }) {
  const [state, setState] = useState<GalleryState>({ status: "loading" });
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<VenuePhoto | null>(null);
  const [deleting, setDeleting] = useState<VenuePhoto | null>(null);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async (focusPhotoId?: string) => {
    try {
      const { photos } = await listVenuePhotos(venueId);
      setState({ status: "ready", photos });
      setIndex((current) => {
        const found = focusPhotoId ? photos.findIndex((photo) => photo.photoId === focusPhotoId) : -1;
        if (found >= 0) return found;
        return Math.min(current, Math.max(photos.length - 1, 0));
      });
      return photos;
    } catch (caught) {
      setState({ status: "error", message: errorText(caught, "The photos could not be loaded.") });
      return null;
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
  const remaining = MAX_PHOTOS_PER_VENUE - photos.length;
  const full = remaining <= 0;
  const working = busy !== null;

  // Runs one change, then reloads the gallery (keeping `photoId` selected).
  const run = async (label: string, work: () => Promise<{ message: string; photoId?: string }>, failure: string) => {
    setBusy(label);
    setNotice(null);
    try {
      const { message, photoId } = await work();
      const reloaded = await load(photoId);
      setNotice({ tone: "success", text: message });
      if (editing && reloaded) setEditing(reloaded.find((photo) => photo.photoId === editing.photoId) ?? null);
      return true;
    } catch (caught) {
      setNotice({ tone: "error", text: errorText(caught, failure) });
      // The gallery may have changed elsewhere (e.g. a photo deleted); show the latest.
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 409)) await load();
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Uploads the chosen or dropped files one after another, up to the limit.
  const uploadFiles = async (files: File[]) => {
    if (!files.length || state.status !== "ready") return;
    const problems: string[] = [];
    const accepted = files.filter((file) => {
      const problem = photoFileProblem(file);
      if (problem) problems.push(`${file.name}: ${problem}`);
      return !problem;
    });
    const toSend = accepted.slice(0, Math.max(remaining, 0));
    if (accepted.length > toSend.length) problems.push(`${plural(accepted.length - toSend.length, "photo")} not added: a venue can have ${MAX_PHOTOS_PER_VENUE} photos.`);
    if (!toSend.length) {
      setNotice({ tone: "error", text: problems.join(" ") });
      return;
    }

    setNotice(null);
    let added = 0;
    let lastId: string | undefined;
    for (const [position, file] of toSend.entries()) {
      setBusy(`Uploading ${position + 1} of ${toSend.length}…`);
      try {
        lastId = (await addVenuePhoto(venueId, file)).photo.photoId;
        added += 1;
      } catch (caught) {
        problems.push(`${file.name}: ${errorText(caught, "could not be uploaded.")}`);
      }
    }
    await load(lastId);
    setBusy(null);
    const summary = added ? `${plural(added, "photo")} added. Use Edit photo to add a caption.` : "";
    setNotice({ tone: problems.length ? (added ? "warning" : "error") : "success", text: [summary, ...problems].filter(Boolean).join(" ") });
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadFiles(files);
  };

  const onReplace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const photo = editing ?? current;
    if (!file || !photo) return;
    const problem = photoFileProblem(file);
    if (problem) {
      setNotice({ tone: "error", text: problem });
      return;
    }
    void run("Replacing…", async () => {
      await replaceVenuePhotoImage(venueId, photo.photoId, file);
      return { message: "Photo replaced.", photoId: photo.photoId };
    }, "The photo could not be replaced.");
  };

  const move = (photo: VenuePhoto, position: number, message: string) =>
    run("Moving…", async () => {
      await updateVenuePhoto(venueId, photo.photoId, { position });
      return { message, photoId: photo.photoId };
    }, "The photo could not be moved.");

  const dropProps = {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes("Files") || full || working) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void uploadFiles(Array.from(event.dataTransfer.files));
    },
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    if (event.key === "ArrowRight" && index < photos.length - 1) setIndex(index + 1);
  };

  return (
    <section aria-label="Photo gallery" className="relative grid gap-3 rounded-panel bg-surface-container-lowest p-3 shadow-elevation-1 sm:p-4" {...dropProps}>
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-panel border-2 border-dashed border-primary bg-primary-fixed/80 text-sm font-semibold text-primary">
          Drop photos to upload
        </div>
      ) : null}

      {state.status === "loading" ? <Skeleton className="aspect-[16/7] w-full" /> : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Photos unavailable">
          {state.message}
          <div className="mt-3"><Button variant="secondary" onClick={() => { setState({ status: "loading" }); void load(); }}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" ? (
        <input id={UPLOAD_INPUT_ID} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} data-testid="gallery-add-input"
          disabled={full || working} onChange={onPick} aria-hidden="true" />
      ) : null}

      {state.status === "ready" && !current ? (
        <FilePickerLabel
          htmlFor={UPLOAD_INPUT_ID}
          disabled={working}
          className="grid aspect-[16/7] place-items-center rounded-control border-2 border-dashed border-outline-variant bg-primary-fixed/40 text-center text-primary transition-colors hover:border-primary hover:bg-primary-fixed/70"
        >
          <span className="grid justify-items-center gap-2 px-4">
            <Icon name="venue" size={20} />
            <span className="text-sm font-semibold">No photos yet</span>
            <span className="text-sm">Drag photos here, or <span className="underline">choose files</span> from your computer.</span>
            <span className="text-xs text-on-surface-variant">JPEG, PNG or WebP, up to 2 MB each. The first photo becomes the cover on My Venues.</span>
          </span>
        </FilePickerLabel>
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
          <FilePickerLabel htmlFor={UPLOAD_INPUT_ID} disabled={full || working}>
            <Icon name="arrow-forward" size={16} className="-rotate-90" />Upload photos
          </FilePickerLabel>
          {current ? (
            <>
              <Button variant="quiet" onClick={() => setEditing(current)} disabled={working}><Icon name="edit" size={16} />Edit photo</Button>
              <Button variant="quiet" className="text-error" onClick={() => setDeleting(current)} disabled={working}><Icon name="close" size={16} />Delete photo</Button>
            </>
          ) : null}
          <p className="ml-auto text-xs text-on-surface-variant" aria-live="polite">
            {busy ?? (full
              ? `${MAX_PHOTOS_PER_VENUE} photos (the limit). Delete one to add another.`
              : `${photos.length} of ${MAX_PHOTOS_PER_VENUE} photos · drag and drop or upload JPEG, PNG or WebP, up to 2 MB each`)}
          </p>
        </div>
      ) : null}

      <div aria-live="polite">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit photo">
        {editing ? (
          <EditPhotoForm
            key={`${editing.photoId}-${editing.version}`}
            venueId={venueId}
            photo={editing}
            count={photos.length}
            busy={working}
            onSaveCaption={(caption) => run("Saving…", async () => {
              const { message } = await updateVenuePhoto(venueId, editing.photoId, { caption: caption.trim() || null });
              return { message, photoId: editing.photoId };
            }, "The caption could not be saved.")}
            onMove={(position, message) => move(editing, position, message)}
            onReplace={onReplace}
            onDelete={() => { setDeleting(editing); setEditing(null); }}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this photo?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setDeleting(null)}>Keep photo</Button>
            <Button variant="danger" disabled={working} onClick={async () => {
              const photo = deleting;
              if (!photo) return;
              await run("Deleting…", async () => ({ message: (await deleteVenuePhoto(venueId, photo.photoId)).message }), "The photo could not be deleted.");
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

// Everything about one photo in one place: preview, caption, position, image
// replacement and deletion.
function EditPhotoForm({ venueId, photo, count, busy, onSaveCaption, onMove, onReplace, onDelete }: {
  venueId: number;
  photo: VenuePhoto;
  count: number;
  busy: boolean;
  onSaveCaption: (caption: string) => Promise<boolean>;
  onMove: (position: number, message: string) => Promise<boolean>;
  onReplace: (event: ChangeEvent<HTMLInputElement>) => void;
  onDelete: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const tooLong = caption.trim().length > MAX_CAPTION_LENGTH;
  const changed = (caption.trim() || null) !== (photo.caption ?? null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!tooLong && changed) void onSaveCaption(caption);
  };
  return (
    <div className="grid gap-4">
      <PhotoImage venueId={venueId} photo={photo} className="aspect-[16/9] w-full rounded-control" />
      <p className="text-xs text-on-surface-variant">Photo {photo.position + 1} of {count}{photo.position === 0 ? " · cover photo" : ""}</p>

      <form noValidate onSubmit={submit} className="grid gap-2">
        <label htmlFor="gallery-caption-input" className="text-sm font-semibold text-on-surface">Caption (optional)</label>
        <input id="gallery-caption-input" className={fieldClasses} value={caption} maxLength={MAX_CAPTION_LENGTH + 50}
          aria-invalid={tooLong || undefined} aria-describedby="gallery-caption-help" onChange={(event) => setCaption(event.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="gallery-caption-help" className={`text-xs ${tooLong ? "text-error" : "text-on-surface-variant"}`}>
            {tooLong ? `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.` : `${caption.trim().length} / ${MAX_CAPTION_LENGTH} characters`}
          </p>
          <Button type="submit" disabled={busy || tooLong || !changed}>Save caption</Button>
        </div>
      </form>

      <div className="grid gap-2 border-t border-outline-variant/60 pt-3">
        <p className="text-sm font-semibold text-on-surface">Position and image</p>
        <div className="flex flex-wrap gap-2">
          {photo.position > 0 ? (
            <>
              <Button variant="secondary" onClick={() => void onMove(0, "Cover photo updated.")} disabled={busy}>Set as cover</Button>
              <Button variant="quiet" onClick={() => void onMove(photo.position - 1, "Photo moved earlier.")} disabled={busy}><Icon name="arrow-back" size={16} />Move earlier</Button>
            </>
          ) : null}
          {photo.position < count - 1 ? (
            <Button variant="quiet" onClick={() => void onMove(photo.position + 1, "Photo moved later.")} disabled={busy}>Move later<Icon name="arrow-forward" size={16} /></Button>
          ) : null}
          {/* Inside the dialog: everything outside a modal dialog is inert. */}
          <input id={REPLACE_INPUT_ID} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} data-testid="gallery-replace-input"
            disabled={busy} onChange={onReplace} aria-hidden="true" />
          <FilePickerLabel htmlFor={REPLACE_INPUT_ID} disabled={busy} className={buttonClasses("quiet")}>Replace image</FilePickerLabel>
        </div>
      </div>

      <div className="flex justify-end border-t border-outline-variant/60 pt-3">
        <Button variant="quiet" className="text-error" onClick={onDelete} disabled={busy}><Icon name="close" size={16} />Delete photo…</Button>
      </div>
    </div>
  );
}
