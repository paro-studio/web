
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Camera, ImageIcon } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";


export default function Settings() {
  const navigate = useNavigate();
  const { user, session, profile, refreshProfile, loading } = useAuth();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || "");
      setDisplayName(profile.display_name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url);
      setCoverUrl(profile.cover_url || null);
    }
  }, [profile]);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Import storage service dynamically
    const { uploadAvatar } = await import('@/services/supabase/storage');
    const { updateProfile } = await import('@/services/supabase/profiles');

    setIsSubmitting(true);

    // Show the chosen file straight away. Uploading, writing the profile and
    // refreshing auth are three round trips, and the old image used to sit
    // there for all of them, which made a working upload look like it had done
    // nothing at all.
    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);

    try {
      // Upload to Supabase Storage
      const { url, error } = await uploadAvatar(user.id, file);

      if (error) {
        setAvatarPreview(avatarUrl);
        toast({
          title: "Upload  failed",
          description: error,
          variant: "destructive"
        });
        return;
      }

      if (!url) {
        setAvatarPreview(avatarUrl);
        toast({
          title: "Upload failed",
          description: "Could not get upload URL",
          variant: "destructive"
        });
        return;
      }

      // Update profile in database
      const { profile: updatedProfile, error: updateError } = await updateProfile(user.id, {
        avatar_url: url
      });

      if (updateError) {
        setAvatarPreview(avatarUrl);
        toast({
          title: "Update failed",
          description: updateError.message,
          variant: "destructive"
        });
        return;
      }

      // Update local state
      setAvatarUrl(url);
      setAvatarPreview(url);

      // Refresh profile in auth context
      await refreshProfile();

      toast({ title: "Avatar updated successfully!" });
    } catch (error) {
      console.error('Avatar upload error:', error);
      setAvatarPreview(avatarUrl);
      toast({
        title: "Upload failed",
        description: getErrorMessage(error, "Unknown error"),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
      // Every path above has either swapped in the uploaded URL or put the old
      // one back, so the object URL is no longer on screen and can go.
      URL.revokeObjectURL(localPreview);
      // Reset file input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Import storage service dynamically
    const { uploadBanner } = await import('@/services/supabase/storage');
    const { updateProfile } = await import('@/services/supabase/profiles');

    setIsSubmitting(true);

    // Same reasoning as the avatar above: show the picked file immediately
    // rather than leaving the old banner up for three round trips.
    const localPreview = URL.createObjectURL(file);
    setCoverPreview(localPreview);

    try {
      // Upload to Supabase Storage
      const { url, error } = await uploadBanner(user.id, file);

      if (error) {
        setCoverPreview(coverUrl);
        toast({
          title: "Upload failed",
          description: error,
          variant: "destructive"
        });
        return;
      }

      if (!url) {
        setCoverPreview(coverUrl);
        toast({
          title: "Upload failed",
          description: "Could not get upload URL",
          variant: "destructive"
        });
        return;
      }

      // Update profile in database
      const { profile: updatedProfile, error: updateError } = await updateProfile(user.id, {
        cover_url: url
      });

      if (updateError) {
        setCoverPreview(coverUrl);
        toast({
          title: "Update failed",
          description: updateError.message,
          variant: "destructive"
        });
        return;
      }

      // Update local state
      setCoverUrl(url);
      setCoverPreview(url);

      // Refresh profile in auth context
      await refreshProfile();

      toast({ title: "Banner updated successfully!" });
    } catch (error) {
      console.error('Banner upload error:', error);
      setCoverPreview(coverUrl);
      toast({
        title: "Upload failed",
        description: getErrorMessage(error, "Unknown error"),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
      URL.revokeObjectURL(localPreview);
      // Reset file input
      if (coverInputRef.current) {
        coverInputRef.current.value = "";
      }
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    // Validate username format
    if (username && !/^[a-z0-9_]+$/.test(username)) {
      setUsernameError("Only lowercase letters, numbers, and underscores");
      return;
    }

    if (username && username.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return;
    }

    // Validate bio length
    if (bio.length > 300) {
      toast({ 
        title: "Bio too long", 
        description: "Bio must be 300 characters or less",
        variant: "destructive" 
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { updateProfile } = await import('@/services/supabase/profiles');

      const { profile: updatedProfile, error } = await updateProfile(user.id, {
        username: username.toLowerCase() || null,
        full_name: displayName || null,
        bio: bio || null
      });

      if (error) {
        // Handle specific errors
        if (error.code === '23505' || getErrorMessage(error) === 'Username already taken') {
          setUsernameError("Username already taken");
          toast({ 
            title: "Username taken", 
            description: "Please choose a different username",
            variant: "destructive" 
          });
          return;
        }

        toast({ 
          title: "Update failed", 
          description: getErrorMessage(error),
          variant: "destructive" 
        });
        return;
      }

      await refreshProfile();
      toast({ title: "Profile updated successfully!" });
      
      // Navigate to profile page
      navigate(`/profile/${user.id}`);
    } catch (error) {
      console.error('Profile update error:', error);
      toast({ 
        title: "Update failed", 
        description: getErrorMessage(error, "Unknown error"),
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auth guard: wait for loading, then check session
  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background">
        <Navbar />
        <main className="pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8 text-center py-12 sm:py-16">
          <p className="text-sm sm:text-base text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background">
        <Navbar />
        <main className="pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8 text-center py-12 sm:py-16">
          <h1 className="font-serif text-xl sm:text-2xl mb-3 sm:mb-4">Sign in to access settings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            You need to be signed in to manage your settings
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20 lg:pt-24">
        <div className="container mx-auto px-4 lg:px-8 py-12">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-serif text-3xl text-center mb-8">Edit Profile</h1>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Cover Photo */}
              <div className="space-y-2">
                <Label>Cover Photo</Label>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverSelect}
                  className="hidden"
                />
                <div
                  onClick={() => coverInputRef.current?.click()}
                  className="relative w-full h-40 bg-secondary/50 rounded-sm overflow-hidden cursor-pointer group"
                >
                  {(coverPreview || coverUrl) ? (
                    <>
                      <img
                        src={coverPreview || coverUrl || ""}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors flex items-center justify-center">
                        <Camera className="h-8 w-8 text-background opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload cover photo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Avatar */}
              <div className="space-y-2">
                <Label>Profile Picture</Label>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <div className="relative group">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={avatarPreview || avatarUrl || ""} />
                      <AvatarFallback className="bg-secondary font-serif text-xl">
                        {(displayName || username).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 rounded-full bg-foreground/0 group-hover:bg-foreground/30 transition-colors flex items-center justify-center">
                      <Camera className="h-6 w-6 text-background opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Click to upload profile picture<br />
                    Max 2MB, square recommended
                  </div>
                </div>
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase());
                    setUsernameError("");
                  }}
                  className={`bg-secondary/50 border-0 ${usernameError ? "border-destructive border" : ""}`}           />
                {usernameError && (
                  <p className="text-sm text-destructive">{usernameError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  parostudios.in/profile/{user?.id || "id"}
                </p>
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="Your Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-secondary/50 border-0"
                />
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us about yourself..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  maxLength={300}
                  className="bg-secondary/50 border-0 resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">{bio.length}/300</p>
              </div>


              {/* Submit */}
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={isSubmitting || !!usernameError}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
