import { ExternalLink, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CREATOR_FORM_URL } from "@/lib/creators";

/**
 * What the Upload page shows anyone who is not a creator yet: what being one
 * means, and the way to apply. The form opens in a new tab.
 */
export function BecomeCreator() {
  return (
    <div className="max-w-md mx-auto text-center py-10 sm:py-16 space-y-4">
      <Sparkles className="h-9 w-9 text-accent mx-auto" aria-hidden="true" />
      <h1 className="font-serif text-2xl sm:text-3xl">Become a Paro creator</h1>
      <p className="text-sm sm:text-base font-medium text-foreground">
        Your prompts could be the next thing everyone recreates.
      </p>
      <p className="text-sm sm:text-base text-muted-foreground">
        Paro is a hand-picked gallery where every prompt is worth discovering and recreating.
      </p>
      <p className="text-sm sm:text-base text-muted-foreground">
        As a creator, you&apos;ll have your own profile, build a following, and see who likes and rates your
        work, and how often it&apos;s copied.
      </p>
      <div className="pt-4">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <a href={CREATOR_FORM_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
            Apply to create
          </a>
        </Button>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground">
        We&apos;ll review your application and contact you by email.
      </p>
    </div>
  );
}
