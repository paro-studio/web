import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { updateProfile } from "@/services/supabase/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

export default function CompleteProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, needsProfileCompletion, refreshProfile } = useAuth();
  const { toast } = useToast();

  // Where ProtectedRoute redirected from, if it was the one that sent us here.
  const returnTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  // Redirect completed users away from this page (prevent access after completion)
  useEffect(() => {
    if (user && !needsProfileCompletion) {
      navigate(returnTo, { replace: true });
    }
  }, [user, needsProfileCompletion, navigate, returnTo]);

  // Prefill display name from user metadata (Google OAuth)
  useEffect(() => {
    if (user && !displayName) {
      // @ts-expect-error - user_metadata is available from Supabase auth
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || "";
      if (fullName) {
        setDisplayName(fullName);
      }
    }
  }, [user]);

  const validateUsername = (value: string): boolean => {
    setUsernameError("");

    if (!value) {
      setUsernameError("Username is required");
      return false;
    }

    if (value.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return false;
    }

    if (!/^[a-z0-9_]+$/.test(value)) {
      setUsernameError("Only lowercase letters, numbers, and underscores allowed");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: "Error",
        description: "No user session found",
        variant: "destructive",
      });
      return;
    }

    const normalizedUsername = username.toLowerCase().trim();
    
    if (!validateUsername(normalizedUsername)) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Attempt to update profile with username
      const { profile: updatedProfile, error } = await updateProfile(user.id, {
        username: normalizedUsername,
        full_name: displayName.trim() || null,
      });

      if (error) {
        // Check for unique constraint violation
        if (error.code === "23505" || getErrorMessage(error)?.includes("duplicate key")) {
          setUsernameError("Username already taken. Please choose another.");
          toast({
            title: "Username taken",
            description: "This username is already in use. Please try another.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: getErrorMessage(error, "Failed to update profile"),
            variant: "destructive",
          });
        }
        return;
      }

      if (!updatedProfile) {
        toast({
          title: "Error",
          description: "Failed to update profile",
          variant: "destructive",
        });
        return;
      }

      // Refresh profile in auth context
      await refreshProfile();

      toast({
        title: "Profile completed!",
        description: "Welcome to PARO Studio",
      });

      // Back to whatever they were trying to reach, or home
      navigate(returnTo, { replace: true });
    } catch (error) {
      console.error("Profile completion error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // @ts-expect-error - user_metadata is available from Supabase auth
  const avatarUrl = user?.user_metadata?.avatar_url || profile?.avatar_url || "";
  const avatarFallback = displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U";

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      {/* Minimal branded header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 sm:px-5 lg:px-6 xl:px-8">
          <div className="flex items-center justify-center h-14 sm:h-16 lg:h-20">
            <Link to="/" className="flex items-center">
              <span className="font-serif text-xl sm:text-2xl lg:text-3xl tracking-tight pointer-events-none">
                PARO
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 pt-20 pb-8">
        <div className="w-full max-w-md">
          {/* Card container - matching AuthModal style */}
          <div className="bg-card border border-border/50 rounded-xl p-6 sm:p-8 shadow-lg space-y-6">
            {/* Header with avatar */}
            <div className="text-center space-y-4">
              {avatarUrl && (
                <div className="flex justify-center">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 ring-2 ring-border">
                    <AvatarImage src={avatarUrl} alt={displayName || "User"} />
                    <AvatarFallback className="bg-secondary text-secondary-foreground font-medium text-2xl">
                      {avatarFallback}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div>
                <h1 className="font-serif text-2xl font-normal mb-2">Complete Your Profile</h1>
                <p className="text-sm text-muted-foreground">
                  Choose a unique username to continue
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username - Required */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium">
                  Username <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="username"
                  placeholder="your_username"
                  maxLength={30}
                  value={username}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase();
                    setUsername(value);
                    if (usernameError) {
                      validateUsername(value);
                    }
                  }}
                  onBlur={() => validateUsername(username)}
                  required
                  disabled={isSubmitting}
                  className={`bg-secondary/50 border-0 focus-visible:ring-1 ${
                    usernameError ? "ring-2 ring-destructive" : ""
                  }`}
                  autoFocus
                />
                {usernameError && (
                  <p className="text-sm text-destructive">{usernameError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and underscores only. 3 to 30 characters.
                </p>
              </div>

              {/* Display Name - Optional */}
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-medium">
                  Display Name <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id="displayName"
                  placeholder="Your Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-secondary/50 border-0 focus-visible:ring-1"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  How your name appears on your profile
                </p>
              </div>

              {/* Submit Button - Gold primary style */}
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !username || !!usernameError}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Complete Profile"
                )}
              </Button>
            </form>

            {/* Footer info */}
            <p className="text-xs text-center text-muted-foreground pt-2">
              You can update your profile anytime from settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
