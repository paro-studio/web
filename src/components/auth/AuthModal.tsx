import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { clearPendingRoute, setPendingRoute } from "@/lib/pendingRoute";
import { Chrome } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "action": opened by trying to do something that needs an account. */
  defaultMode?: "login" | "signup" | "action";
}

const COPY = {
  login: { title: "Welcome back", subtitle: "Sign in to your account" },
  signup: { title: "Join PARO", subtitle: "Create an account to start sharing prompts" },
  action: { title: "Sign in to continue", subtitle: "Copy, like, save and post prompts with a free account" },
};

export function AuthModal({ open, onOpenChange, defaultMode = "login" }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithGoogle } = useAuth();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    // Google sends everyone back to the feed. Remember this page so the feed
    // can forward them here once they are signed in. The feed itself is never
    // stored, see setPendingRoute.
    setPendingRoute(window.location.pathname + window.location.search);
    const { error } = await signInWithGoogle();
    if (!error) {
      // OAuth redirect will happen
      // Don't close modal or reset loading - user is being redirected
    } else {
      // No redirect is coming, so nothing will pick the stored page up.
      clearPendingRoute();
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/50">
        <DialogHeader className="text-center pb-4">
          <DialogTitle className="font-serif text-2xl font-normal">
            {COPY[defaultMode].title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {COPY[defaultMode].subtitle}
          </p>
        </DialogHeader>

        {/* Google Sign In Button */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          <Chrome className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>
      </DialogContent>
    </Dialog>
  );
}
