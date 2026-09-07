import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Copy, Heart, Bookmark, Check, Pencil, Trash2, Share2, MoreHorizontal, Link as LinkIcon, UserCircle, Flag, MoreVertical, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePromptShare } from "@/hooks/usePromptShare";
import { SharePromptDialog } from "@/components/prompts/SharePromptDialog";
import { ReportPromptDialog } from "@/components/prompts/ReportPromptDialog";
import { AiToolBadge } from "@/components/prompts/AiToolBadge";
import { useQueryClient } from "@tanstack/react-query";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface PromptCardProps {
  id: string;
  title: string;
  promptText: string;
  imageUrl: string;
  toolUsed: string;
  viewCount?: number | null;
  copyCount?: number | null;
  likeCount?: number | null;
  accuracyRating?: number | null;
  ratingCount?: number | null;
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    verified?: boolean;
  };
  tags: string[];
  isLiked?: boolean;
  isSaved?: boolean;
  onLikeChange?: () => void;
  onSaveChange?: () => void;
  showEditButton?: boolean;
  onEditClick?: () => void;
  onLoginRequired?: () => void;
  onDelete?: () => void;
  /**
   * Set on the handful of cards that are visible without scrolling.
   *
   * Every feed image was lazy loaded, including whichever one happens to be
   * the largest contentful paint. A lazy image is not fetched until layout has
   * run and decided it is near the viewport, which pushed LCP to 7.3s on
   * mobile while the server was answering in 30ms. Above the fold, lazy
   * loading is pure delay.
   */
  priority?: boolean;
}

export function PromptCard({
  id,
  title,
  promptText,
  imageUrl,
  toolUsed,
  viewCount,
  copyCount,
  likeCount,
  accuracyRating,
  ratingCount,
  creator,
  tags,
  isLiked = false,
  isSaved = false,
  onLikeChange,
  onSaveChange,
  showEditButton = false,
  onEditClick,
  onLoginRequired,
  onDelete,
  priority = false,
}: PromptCardProps) {
  const hasRatings = typeof ratingCount === "number" && ratingCount > 0 && typeof accuracyRating === "number";
  const [copied, setCopied] = useState(false);
  const [localLiked, setLocalLiked] = useState(isLiked);
  const [localSaved, setLocalSaved] = useState(isSaved);
  const [localLikeCount, setLocalLikeCount] = useState(likeCount ?? 0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { copyPromptLink } = usePromptShare();

  // Only the creator can delete; everyone else gets Report in that slot.
  const isOwner = !!user && !!profile && profile.id === creator.id;

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      onLoginRequired?.();
      return;
    }

    await navigator.clipboard.writeText(promptText);
    setCopied(true);

    // Increment copy count in Supabase
    const { incrementCopyCount } = await import('@/services/supabase/prompts');
    await incrementCopyCount(id);

    setTimeout(() => setCopied(false), 2000);
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like prompts",
      });
      return;
    }

    const newLiked = !localLiked;
    setLocalLiked(newLiked);
    setLocalLikeCount((prev) => (newLiked ? (prev ?? 0) + 1 : Math.max(0, (prev ?? 0) - 1)));

    const { toggleLike } = await import('@/services/supabase/likes');
    await toggleLike(user.id, id);

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['prompts'] });
    queryClient.invalidateQueries({ queryKey: ['liked-prompts', user.id] });

    onLikeChange?.();
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save prompts",
      });
      return;
    }

    const newSaved = !localSaved;
    setLocalSaved(newSaved);

    const { toggleSave } = await import('@/services/supabase/saves');
    await toggleSave(user.id, id);
    
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['prompts'] });
    queryClient.invalidateQueries({ queryKey: ['saved-prompts', user.id] });
    
    if (newSaved) {
      toast({ title: "Saved to collection" });
    }

    onSaveChange?.();
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await copyPromptLink(id);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShareOpen(true);
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!profile || profile.id !== creator.id) return;

    setIsDeleting(true);

    try {
      // Deletes the row and its stored image together.
      const { deletePrompt } = await import('@/services/supabase/prompts');
      const { error } = await deletePrompt(id, user.id);

      if (error) {
        throw new Error(error.message);
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['profile-prompts', profile.id] });

      toast({ title: "Prompt deleted" });

      // Call parent callback
      onDelete?.();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <article className="group masonry-item">
      <div className="relative overflow-hidden rounded-sm bg-card hover-lift">
        {/* Image */}
        <Link to={`/prompt/${id}`} className="block">
          <div className="relative aspect-auto">
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              loading={priority ? "eager" : "lazy"}
            />

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300 pointer-events-none" />
          </div>
        </Link>

        {/* Mobile three-dot menu trigger - top RIGHT, inside image */}
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute top-2 sm:top-3 right-2 sm:right-3 lg:hidden z-30 pointer-events-auto"
        >
          <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} dismissible={true}>
            <DrawerTrigger asChild>
              <button
                className="p-1.5"
                aria-label="More options"
              >
                <MoreVertical className="h-5 w-5 text-black drop-shadow-md" />
              </button>
            </DrawerTrigger>
          
          <DrawerContent className="px-4 pb-8">
            {/* Accessibility - Hidden title and description for screen readers */}
            <DrawerTitle className="sr-only">Post options</DrawerTitle>
            <DrawerDescription className="sr-only">Actions for this prompt</DrawerDescription>
            
            {/* Primary Actions - Large Circular Buttons */}
            <div className="flex items-center justify-center gap-8 py-6">
              {/* Save Button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSave(e);
                  setTimeout(() => setMobileMenuOpen(false), 100);
                }}
                className="flex flex-col items-center gap-2"
              >
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center border-2 transition-colors",
                  localSaved 
                    ? "bg-gold/20 border-gold" 
                    : "bg-secondary border-border"
                )}>
                  <Bookmark className={cn(
                    "h-6 w-6",
                    localSaved && "fill-gold text-gold"
                  )} />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {localSaved ? "Unsave" : "Save"}
                </span>
              </button>

              {/* Copy Link Button */}
              <button
                onClick={(e) => {
                  handleCopyLink(e);
                  setMobileMenuOpen(false);
                }}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-16 h-16 rounded-full bg-secondary border-2 border-border flex items-center justify-center transition-colors">
                  <LinkIcon className="h-6 w-6 text-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Copy Link</span>
              </button>

              {/* Share Button - one drawer closes before the other opens */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMobileMenuOpen(false);
                  setTimeout(() => setShareOpen(true), 250);
                }}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-16 h-16 rounded-full bg-secondary border-2 border-border flex items-center justify-center transition-colors">
                  <Share2 className="h-6 w-6 text-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Share</span>
              </button>
            </div>

            {/* Separator */}
            <div className="border-t border-border my-2" />

            {/* Secondary Actions - List Items */}
            <div className="flex flex-col gap-1">
              {/* View Profile */}
              <DrawerClose asChild>
                <Link
                  to={`/profile/${creator.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-secondary rounded-sm transition-colors"
                >
                  <UserCircle className="h-5 w-5 text-foreground" />
                  <span className="text-sm font-medium text-foreground">View Profile</span>
                </Link>
              </DrawerClose>

              {/* Delete for the owner, Report for everyone else */}
              {isOwner ? (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMobileMenuOpen(false);
                    setTimeout(() => setShowDeleteDialog(true), 250);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-secondary rounded-sm transition-colors text-left"
                >
                  <Trash2 className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Delete</span>
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMobileMenuOpen(false);
                    if (!user) {
                      onLoginRequired?.();
                      return;
                    }
                    setTimeout(() => setReportOpen(true), 250);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-secondary rounded-sm transition-colors text-left"
                >
                  <Flag className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Report</span>
                </button>
              )}
            </div>
          </DrawerContent>
        </Drawer>
        </div>

        {/* Copy button - top LEFT on all devices, visible on hover for desktop */}
        <button
          onClick={handleCopy}
          className={cn(
            "absolute top-2 sm:top-3 left-2 sm:left-3 p-1.5 sm:p-2 rounded-full bg-background shadow-soft transition-all duration-200 touch-target flex items-center justify-center",
            "opacity-100 lg:opacity-0 lg:group-hover:opacity-100",
            copied && "bg-gold/90"
          )}
          title="Copy prompt"
          aria-label={copied ? "Copied" : "Copy prompt"}
        >
          {copied ? (
            <Check className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
          ) : (
            <Copy className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
          )}
        </button>

        {/* Like & Save - top RIGHT on desktop only, visible on hover */}
        <div className="absolute top-2 sm:top-3 right-2 sm:right-3 hidden lg:flex gap-1.5 sm:gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={handleLike}
            className="p-1.5 sm:p-2 rounded-full bg-background shadow-soft transition-all duration-200 touch-target flex items-center justify-center"
            title={localLiked ? "Unlike" : "Like"}
            aria-label={localLiked ? "Unlike" : "Like"}
          >
            <Heart
              className={cn(
                "h-3.5 sm:h-4 w-3.5 sm:w-4 transition-colors",
                localLiked && "fill-destructive text-destructive"
              )}
            />
          </button>

          <button
            onClick={handleSave}
            className="p-1.5 sm:p-2 rounded-full bg-background shadow-soft transition-all duration-200 touch-target flex items-center justify-center"
            title={localSaved ? "Unsave" : "Save"}
            aria-label={localSaved ? "Unsave" : "Save"}
          >
            <Bookmark
              className={cn(
                "h-3.5 sm:h-4 w-3.5 sm:w-4 transition-colors",
                localSaved && "fill-gold text-gold"
              )}
            />
          </button>
        </div>

        {/* Share button - bottom RIGHT on desktop only, visible on hover, stacked over watermark */}
        <button
          onClick={handleShare}
          className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 hidden lg:flex p-1.5 sm:p-2 rounded-full bg-background shadow-soft transition-all duration-200 opacity-0 group-hover:opacity-100 z-10 items-center justify-center"
          title="Share"
          aria-label="Share prompt"
        >
          <Share2 className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
        </button>

        {/* Edit button - bottom right of image, for creator's own profile */}
        {showEditButton && onEditClick && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditClick();
            }}
            className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 lg:right-16 p-1.5 sm:p-2 rounded-full bg-gold text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center"
            title="Edit prompt"
            aria-label="Edit prompt"
          >
            <Pencil className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
          </button>
        )}

        {/* Deleting lives in the menus below — on the image it sat on top of
            the share button, and a one-tap destructive action next to a
            hover-revealed one is asking for an accident. */}
      </div>

      {/* Content */}
      <div className="pt-2 sm:pt-3 pb-1">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/prompt/${id}`} className="flex-1 min-w-0">
            <h3 className="font-serif text-base sm:text-lg leading-tight group-hover:text-gold transition-colors duration-300 text-truncate-2">
              {title}
            </h3>
          </Link>

          {/* Three-dot menu - Desktop only */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="hidden lg:flex items-center justify-center p-1 hover:bg-secondary rounded-sm transition-colors cursor-pointer"
                aria-label="More options"
              >
                <MoreHorizontal className="h-5 w-5 text-foreground" />
              </button>
            </DropdownMenuTrigger>
            
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handleCopyLink}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Copy Link
              </DropdownMenuItem>
              
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSave(e);
                }}
              >
                <Bookmark className={cn("h-4 w-4 mr-2", localSaved && "fill-gold text-gold")} />
                {localSaved ? "Unsave" : "Save"}
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link to={`/profile/${creator.id}`} className="flex items-center cursor-pointer">
                  <UserCircle className="h-4 w-4 mr-2" />
                  View Profile
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />

              {isOwner ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!user) {
                      onLoginRequired?.();
                      return;
                    }
                    setReportOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Like & Share buttons - visible on mobile/tablet only, next to title */}
          <div className="flex lg:hidden gap-1 sm:gap-1.5 flex-shrink-0">
            <button
              onClick={handleLike}
              className={cn(
                "p-1 sm:p-1.5 rounded-full bg-secondary transition-all duration-200 touch-target flex items-center justify-center",
                localLiked && "bg-destructive/10"
              )}
              title={localLiked ? "Unlike" : "Like"}
              aria-label={localLiked ? "Unlike" : "Like"}
            >
              <Heart
                className={cn(
                  "h-3.5 sm:h-4 w-3.5 sm:w-4 transition-colors",
                  localLiked && "fill-destructive text-destructive"
                )}
              />
            </button>

            <button
              onClick={handleShare}
              className="p-1 sm:p-1.5 rounded-full bg-secondary transition-all duration-200 touch-target flex items-center justify-center"
              title="Share"
              aria-label="Share prompt"
            >
              <Share2 className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground mt-1">
          {/* The creator name takes the room the tool name no longer needs; the
              badge is short and fixed, so it never squeezes the name to an
              initial the way the full tool string did. */}
          <Link
            to={`/profile/${creator.id}`}
            className="flex items-center gap-1 hover:text-foreground transition-colors min-w-0 flex-1"
          >
            <span className="truncate">{creator.displayName}</span>
            {creator.verified && <VerifiedBadge className="h-3.5 w-3.5 flex-shrink-0" />}
          </Link>
          <span className="text-border flex-shrink-0">•</span>
          <AiToolBadge tool={toolUsed} className="flex-shrink-0 max-w-[60%]" />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 sm:gap-4 mt-1.5 sm:mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5 sm:gap-1" title="Views">
            <Eye className="h-3 w-3" />
            <span className="tabular-nums">{(viewCount ?? 0).toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-0.5 sm:gap-1" title="Copies">
            <Copy className="h-3 w-3" />
            <span className="tabular-nums">{(copyCount ?? 0).toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-0.5 sm:gap-1" title="Likes">
            <Heart className="h-3 w-3" />
            <span className="tabular-nums">{(localLikeCount ?? 0).toLocaleString()}</span>
          </span>
          {hasRatings ? (
            <span
              className="flex items-center gap-0.5 sm:gap-1 text-gold font-medium"
              title={`Prompt Accuracy: ${accuracyRating.toFixed(1)} / 5.0 (${ratingCount} rating${ratingCount === 1 ? '' : 's'})`}
              aria-label={`Prompt Accuracy: ${accuracyRating.toFixed(1)} out of 5 stars`}
            >
              <Star className="h-3 w-3 fill-gold text-gold" />
              <span className="tabular-nums">{accuracyRating.toFixed(1)}</span>
            </span>
          ) : (
            <span
              className="flex items-center gap-0.5 sm:gap-1 text-muted-foreground"
              title="Not yet rated"
              aria-label="Not yet rated"
            >
              <Star className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-[11px] sm:text-xs">Not rated</span>
            </span>
          )}
        </div>
      </div>

      <SharePromptDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        promptId={id}
        title={title}
        imageUrl={imageUrl}
      />

      <ReportPromptDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        promptId={id}
        promptTitle={title}
      />

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteDialog(false)}>
          <div className="bg-background p-6 rounded-lg shadow-lg max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Prompt?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete this prompt and its image. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm border border-border rounded-sm hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-sm hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}