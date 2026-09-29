import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { deleteAccount } from "@/services/supabase/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Typing a word, not a single tap, so nobody deletes their account by accident.
const CONFIRM_WORD = "DELETE";

export function DeleteAccountSection() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmed = confirmText.trim() === CONFIRM_WORD;

  const handleOpenChange = (next: boolean) => {
    // Closing mid-delete would hide a request that is still running.
    if (isDeleting) return;
    setOpen(next);
    if (!next) setConfirmText("");
  };

  const handleDelete = async () => {
    if (!confirmed || isDeleting) return;
    setIsDeleting(true);

    const { error } = await deleteAccount();

    if (error) {
      setIsDeleting(false);
      toast({ title: "Account not deleted", description: error, variant: "destructive" });
      return;
    }

    // The session is dead now. signOut already falls back to clearing the
    // local session when the server rejects it, and clears the query cache.
    await signOut();
    // Only one toast shows at a time, so this replaces signOut's "Signed out".
    toast({ title: "Account deleted", description: "Your account, prompts and images are gone." });
    navigate("/", { replace: true });
  };

  return (
    <section className="mt-12 pt-8 border-t border-border space-y-3" aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" className="font-serif text-xl">Delete account</h2>
      <p className="text-sm text-muted-foreground">
        Permanently deletes your account, your prompts, images, likes, saves, follows and ratings. This cannot be undone.
      </p>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        Delete account
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Everything you've posted or saved on Paro will be deleted for good. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-account-confirm">
              Type <span className="font-semibold">{CONFIRM_WORD}</span> to confirm
            </Label>
            <Input
              id="delete-account-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              disabled={isDeleting}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={!confirmed || isDeleting}>
              {isDeleting ? "Deleting..." : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
