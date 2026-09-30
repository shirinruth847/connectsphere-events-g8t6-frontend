import { Skeleton } from "@/components/feedback/Skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading events"
      className="mx-auto flex w-full max-w-page flex-col gap-5 px-4 pt-5 pb-12 md:px-6"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-52 rounded-full" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-28 w-full rounded-card" />
      <div className="flex flex-col gap-5 pt-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-72 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
