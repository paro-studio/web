import { X } from "lucide-react";

export function RatingInvitation({ onRate, onDismiss }: {
  onRate: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="status" className="mt-3 rounded border border-border bg-secondary/40 p-3 text-sm" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        <p>How accurate was this prompt?</p>
        <button type="button" aria-label="Dismiss rating invitation" onClick={onDismiss} className="p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <button type="button" className="mt-2 text-gold underline underline-offset-4" onClick={onRate}>
        Rate this prompt
      </button>
    </div>
  );
}
