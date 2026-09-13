import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div role="status" className="max-w-2xl mx-auto space-y-4">
      <span className="sr-only">Loading page</span>
      <div aria-hidden="true" className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
