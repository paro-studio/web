import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedPaginationProps {
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
}

/**
 * Which pages to offer: all of them when they fit, otherwise the first, the
 * last and the ones either side of the current page, with gaps as null.
 */
export function pagesToShow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const nearby = [1, page - 1, page, page + 1, totalPages]
    .filter((p) => p >= 1 && p <= totalPages)
    .filter((p, i, all) => all.indexOf(p) === i);

  return nearby.flatMap((p, i) => (i > 0 && p - nearby[i - 1] > 1 ? [null, p] : [p]));
}

const CIRCLE =
  "inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium tabular-nums transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function FeedPagination({ page, pageSize, totalRows, onPageChange }: FeedPaginationProps) {
  const totalPages = Math.max(Math.ceil(totalRows / pageSize), page);

  return (
    <nav aria-label="Feed pages" className="mt-10 sm:mt-14 flex items-center justify-center gap-1 sm:gap-1.5">
      {/* invisible, not removed, so the numbers don't shift between pages */}
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => onPageChange(page - 1)}
        className={cn(CIRCLE, "mr-1 sm:mr-2 bg-secondary/50 text-foreground hover:bg-secondary", page === 1 && "invisible")}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pagesToShow(page, totalPages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden="true" className="w-6 text-center text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPageChange(p)}
            className={cn(
              CIRCLE,
              p === page
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        aria-label="Next page"
        onClick={() => onPageChange(page + 1)}
        className={cn(CIRCLE, "ml-1 sm:ml-2 bg-secondary/50 text-foreground hover:bg-secondary", page >= totalPages && "invisible")}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
