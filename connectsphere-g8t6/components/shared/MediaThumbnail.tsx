import Image from "next/image";
import { cn } from "@/lib/cn";

interface MediaThumbnailProps {
  src: string | null;
  /** Shown on the corner chip, and centred on the fallback when there is no photo. */
  label: string;
  /** Rendered image width hint for next/image. */
  sizes: string;
  className?: string;
  preload?: boolean;
}

/** Event or venue photo with a dark corner label; soft indigo gradient when no photo exists. */
export function MediaThumbnail({
  src,
  label,
  sizes,
  className,
  preload,
}: MediaThumbnailProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-control", className)}>
      {src ? (
        <>
          {/* Decorative: the card title and label chip already say what this is. */}
          <Image src={src} alt="" fill sizes={sizes} preload={preload} className="object-cover" />
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-tag bg-on-surface/80 px-1.5 py-0.5 text-label font-bold text-surface">
            {label}
          </span>
        </>
      ) : (
        <div className="flex size-full items-center justify-center bg-linear-to-br from-primary-fixed via-surface-container-high to-tertiary-fixed p-4 text-center text-title-sm font-bold text-on-primary-fixed">
          {label}
        </div>
      )}
    </div>
  );
}
