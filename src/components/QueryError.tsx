import { Button } from "@/components/ui/button";

export function QueryError({ resource, onRetry, retrying = false }: {
  resource: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="text-center py-8 space-y-3">
      <p className="text-muted-foreground">We couldn't load {resource}. Please try again.</p>
      <Button variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying ? "Retrying…" : "Try again"}
      </Button>
    </div>
  );
}
