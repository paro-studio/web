
import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Heart, Bookmark, Check, ArrowLeft, Share2, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SharePromptDialog } from "@/components/prompts/SharePromptDialog";
import { cn } from "@/lib/utils";
import { PromptCard } from "@/components/prompts/PromptCard";
import { AuthModal } from "@/components/auth/AuthModal";
import { VerifiedBadge } from "@/components/VerifiedBadge";

export default function PromptDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [accuracyRating, setAccuracyRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Count one view per prompt visited. The ref guards against double-firing
  // under React StrictMode in development, and against re-counting when the
  // query refetches — the effect only depends on the id in the URL.
  const countedViewFor = useRef<string | null>(null);
  useEffect(() => {
    if (!id || countedViewFor.current === id) return;
    countedViewFor.current = id;

    import('@/services/supabase/prompts')
      .then(({ incrementViewCount }) => incrementViewCount(id))
      .catch((error) => console.error('Failed to record view:', error));
  }, [id]);

  const { data: prompt, isLoading } = useQuery({
    queryKey: ["prompt", id, user?.id],
    queryFn: async () => {
      if (!id) return null;

      // Get prompt from Supabase
      const { getPrompt } = await import('@/services/supabase/prompts');
      const { prompt: data, error } = await getPrompt(id);
      
      if (error || !data) {
        console.error('Error fetching prompt:', error);
        return null;
      }

      // Get enrichment data from Supabase
      const { getProfile } = await import('@/services/supabase/profiles');
      const { getLikeCount, isLiked: checkIsLiked } = await import('@/services/supabase/likes');
      const { isSaved: checkIsSaved } = await import('@/services/supabase/saves');
      const { getPromptRating, getUserPromptRating } = await import('@/services/supabase/ratings');

      const creator = await getProfile(data.user_id);
      const likeCount = await getLikeCount(id);
      const liked = user ? await checkIsLiked(user.id, id) : false;
      const saved = user ? await checkIsSaved(user.id, id) : false;
      const ratingInfo = await getPromptRating(id);
      const userRatingValue = user ? await getUserPromptRating(user.id, id) : null;

      // Normalize to clean camelCase UI shape - NO spread operator
      const result = {
        id: data.id,
        title: data.title,
        promptText: data.prompt,
        imageUrl: data.image_url,
        toolUsed: data.ai_tool,
        viewCount: data.view_count || 0,
        copyCount: data.copy_count || 0,
        createdAt: data.created_at || new Date().toISOString(),
        tags: data.tags || [],
        creator: creator ? {
          id: creator.id,
          username: creator.username || 'unknown',
          displayName: creator.full_name || creator.username || 'Unknown',
          avatarUrl: creator.avatar_url,
          verified: creator.verified ?? false,
        } : {
          id: data.user_id,
          username: 'unknown',
          displayName: 'Unknown User',
          avatarUrl: null,
          verified: false,
        },
        likeCount: likeCount,
        isLiked: liked,
        isSaved: saved,
        accuracyRating: ratingInfo.average,
        ratingCount: ratingInfo.count,
        userRating: userRatingValue,
      };

      setIsLiked(result.isLiked);
      setIsSaved(result.isSaved);
      setLikeCount(result.likeCount);
      setAccuracyRating(result.accuracyRating);
      setRatingCount(result.ratingCount);
      setUserRating(result.userRating);

      return result;
    },
    enabled: !!id,
  });

  // Fetch recommended prompts based on matching tags
  const { data: recommendations } = useQuery({
    queryKey: ["recommendations", id, prompt?.tags, user?.id],
    queryFn: async () => {
      if (!prompt?.tags || prompt.tags.length === 0 || !id) return [];

      // Get related prompts from Supabase
      const { getAllPrompts } = await import('@/services/supabase/prompts');
      const { prompts: relatedPrompts, error: relatedError } = await getAllPrompts(50);
      
      if (relatedError) {
        console.error('Error fetching related prompts:', relatedError);
      }
      
      const filteredRelated = (relatedPrompts || [])
        .filter((p) => p.id !== id && p.tags && prompt.tags && p.tags.some((tag) => prompt.tags!.includes(tag)))
        .slice(0, 4);

      const enrichedRelated = await Promise.all(
        filteredRelated.map(async (p) => {
          const { getProfile } = await import('@/services/supabase/profiles');
          const { isLiked: checkIsLiked } = await import('@/services/supabase/likes');
          const { isSaved: checkIsSaved } = await import('@/services/supabase/saves');
          
          const creator = await getProfile(p.userId);
          const liked = user ? await checkIsLiked(user.id, p.id) : false;
          const saved = user ? await checkIsSaved(user.id, p.id) : false;

          // Normalize to clean camelCase UI shape
          return {
            id: p.id,
            title: p.title,
            promptText: p.promptText,
            imageUrl: p.imageUrl,
            toolUsed: p.toolUsed,
            viewCount: p.viewCount || 0,
            copyCount: p.copyCount || 0,
            createdAt: p.createdAt || new Date().toISOString(),
            tags: p.tags || [],
            creator: creator ? {
              id: creator.id,
              username: creator.username ||'unknown',
              displayName: creator.full_name || creator.username || 'Unknown',
              avatarUrl: creator.avatar_url,
              verified: creator.verified ?? false,
            } : {
              id: p.userId,
              username: 'unknown',
              displayName: 'Unknown User',
              avatarUrl: null,
              verified: false,
            },
            likeCount: 0,
            isLiked: liked,
            isSaved: saved
          };
      }));

      return enrichedRelated;
    },
    enabled: !!prompt?.tags && prompt.tags.length > 0,
  });

  const handleCopy = async () => {
    if (!prompt) return;

    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    await navigator.clipboard.writeText(prompt.promptText);
    setCopied(true);

    const { incrementCopyCount } = await import('@/services/supabase/prompts');
    await incrementCopyCount(prompt.id);
    // Pull the new count back so the displayed number actually moves
    queryClient.invalidateQueries({ queryKey: ["prompt", prompt.id] });

    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Prompt copied to clipboard" });
  };

  const handleLike = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like prompts",
      });
      return;
    }

    if (!prompt) return;

    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    const { toggleLike } = await import('@/services/supabase/likes');
    await toggleLike(user.id, prompt.id);
    
    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ['prompt', id] });
    queryClient.invalidateQueries({ queryKey: ['prompts'] });
  };

  const handleSave = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save prompts",
      });
      return;
    }

    if (!prompt) return;

    const newSaved = !isSaved;
    setIsSaved(newSaved);

    const { toggleSave } = await import('@/services/supabase/saves');
    await toggleSave(user.id, prompt.id);
    
    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ['prompt', id] });
    queryClient.invalidateQueries({ queryKey: ['prompts'] });

    if (newSaved) {
      toast({ title: "Saved to collection" });
    }
  };

  const handleRate = async (rating: number) => {
    if (!user) {
      setAuthModalOpen(true);
      toast({
        title: "Sign in required",
        description: "Please sign in to rate prompt accuracy",
      });
      return;
    }

    if (!prompt || isSubmittingRating) return;

    setIsSubmittingRating(true);
    try {
      const { ratePrompt } = await import('@/services/supabase/ratings');
      const { ratingInfo, error } = await ratePrompt(user.id, prompt.id, rating);
      if (error) {
        console.error("Failed to submit rating:", error);
        toast({
          title: "Rating failed",
          description: "Could not save your rating. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setUserRating(rating);
      setAccuracyRating(ratingInfo.average);
      setRatingCount(ratingInfo.count);
      toast({
        title: "Rating recorded",
        description: `Thank you! You rated this prompt's accuracy ${rating} / 5 stars.`,
      });
      queryClient.invalidateQueries({ queryKey: ["prompt", id] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    } catch (err) {
      console.error("Failed to submit rating:", err);
      toast({
        title: "Rating failed",
        description: "Could not save your rating. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingRating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background">
        <Navbar />
        <main className="pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 sm:gap-6 items-start py-4">
            <Skeleton className="w-full lg:w-2/5 aspect-square rounded-sm" />
            <div className="w-full lg:w-3/5 space-y-3 sm:space-y-4">
              <Skeleton className="h-6 sm:h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 sm:h-20 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background">
        <Navbar />
        <main className="pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8 text-center py-12 sm:py-16">
          <h1 className="font-serif text-xl sm:text-2xl">Prompt not found</h1>
          <Link to="/" className="text-muted-foreground hover:text-foreground mt-4 inline-block text-sm">
            Return home
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-14 sm:pt-16 lg:pt-20">
        {/* Main content section - compact to show recommendations without scroll */}
        <section className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6">
          <div className="max-w-[1400px] mx-auto">
            {/* Back button */}
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 sm:gap-2 text-muted-foreground hover:text-foreground transition-colors mb-3 sm:mb-4 text-sm"
            >
              <ArrowLeft className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              <span>Back</span>
            </Link>

            {/* Main content - side by side on desktop, stacked on mobile */}
            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8 items-start">
              {/* Image - constrained height with responsive sizing */}
              <div className="w-full lg:w-2/5 flex items-start justify-center">
                <img
                  src={prompt.imageUrl}
                  alt={prompt.title}
                  className="max-h-[40vh] sm:max-h-[35vh] lg:max-h-[50vh] w-auto max-w-full object-contain rounded-sm shadow-card"
                  loading="lazy"
                />
              </div>

              {/* Content - compact layout */}
              <div className="w-full lg:w-3/5 flex flex-col gap-2.5 sm:gap-3">
                {/* Title */}
                <h1 className="font-serif text-lg sm:text-xl lg:text-2xl leading-tight">
                  {prompt.title}
                </h1>

                {/* Creator */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <Link to={`/profile/${prompt.creator.id}`}>
                    <Avatar className="h-6 w-6 sm:h-7 sm:w-7">
                      <AvatarImage src={prompt.creator.avatarUrl || ""} />
                      <AvatarFallback className="bg-secondary font-serif text-xs">
                        {prompt.creator.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div>
                    <Link
                      to={`/profile/${prompt.creator.id}`}
                      className="flex items-center gap-1 text-sm font-medium hover:text-gold transition-colors"
                    >
                      {prompt.creator.displayName}
                      {prompt.creator.verified && <VerifiedBadge className="h-3.5 w-3.5" />}
                    </Link>
                    <p className="text-xs text-muted-foreground">@{prompt.creator.username}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1" title="Copies">
                    <Copy className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                    <span className="tabular-nums">{prompt.copyCount.toLocaleString()}</span>
                  </span>
                  <span className="flex items-center gap-1" title="Likes">
                    <Heart className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                    <span className="tabular-nums">{likeCount.toLocaleString()}</span>
                  </span>
                  {ratingCount > 0 && accuracyRating !== null ? (
                    <span
                      className="flex items-center gap-1 text-gold font-medium"
                      title={`Prompt Accuracy: ${accuracyRating.toFixed(1)} / 5.0 (${ratingCount} rating${ratingCount === 1 ? '' : 's'})`}
                    >
                      <Star className="h-3 sm:h-3.5 w-3 sm:w-3.5 fill-gold text-gold" />
                      <span className="tabular-nums">{accuracyRating.toFixed(1)}</span>
                      <span className="text-muted-foreground text-[11px]">({ratingCount})</span>
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1 text-muted-foreground"
                      title="Not yet rated"
                    >
                      <Star className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-muted-foreground/50" />
                      <span className="text-[11px]">Not rated</span>
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 bg-secondary rounded-sm">
                    {prompt.toolUsed}
                  </span>
                </div>

                {/* Actions - Responsive button sizes */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <Button
                    onClick={handleCopy}
                    size="default"
                    className={cn(
                      "gap-1.5 sm:gap-2 text-sm",
                      copied && "bg-gold text-gold-foreground"
                    )}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
                        <span className="hidden xs:inline">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
                        <span className="hidden xs:inline">Copy Prompt</span>
                        <span className="xs:hidden">Copy</span>
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="default"
                    onClick={handleLike}
                    className={cn("p-2 sm:px-3", isLiked && "border-destructive/50")}
                    aria-label={isLiked ? "Unlike" : "Like"}
                  >
                    <Heart
                      className={cn(
                        "h-4 w-4",
                        isLiked && "fill-destructive text-destructive"
                      )}
                    />
                  </Button>

                  <Button
                    variant="outline"
                    size="default"
                    onClick={handleSave}
                    className={cn("p-2 sm:px-3", isSaved && "border-gold/50")}
                    aria-label={isSaved ? "Unsave" : "Save"}
                  >
                    <Bookmark
                      className={cn("h-4 w-4", isSaved && "fill-gold text-gold")}
                    />
                  </Button>

                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setShareOpen(true)}
                    className="p-2 sm:px-3"
                    aria-label="Share prompt"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Accuracy Rating Interactive Widget */}
                <div className="rounded-lg border border-border/80 bg-secondary/30 p-3 sm:p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-gold/10 text-gold border border-gold/20 flex-shrink-0">
                        <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-gold text-gold" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-semibold leading-none text-foreground">Prompt Accuracy Rating</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          How consistently this prompt delivers the expected result
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {ratingCount > 0 && accuracyRating !== null ? (
                        <>
                          <div className="text-sm sm:text-base font-bold tabular-nums text-gold flex items-center gap-1 justify-end">
                            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                            <span>{accuracyRating.toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground font-normal">/ 5.0</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 justify-end">
                            <span>Not yet rated</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Be the first to rate
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Interactive Star Selection */}
                  <div className="pt-2 flex items-center justify-between border-t border-border/40 flex-wrap gap-2">
                    <div className="text-xs text-muted-foreground">
                      {userRating ? (
                        <span>Your rating: <strong className="text-foreground font-medium">{userRating} / 5</strong></span>
                      ) : (
                        <span>Rate consistency:</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1" onMouseLeave={() => setHoverRating(null)}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const isFilled = (hoverRating !== null ? hoverRating >= star : (userRating ?? 0) >= star);
                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleRate(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            disabled={isSubmittingRating}
                            aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                            title={`Rate ${star} out of 5`}
                            className="p-1 hover:scale-110 active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
                          >
                            <Star
                              className={cn(
                                "h-4 w-4 transition-colors",
                                isFilled ? "fill-gold text-gold" : "text-muted-foreground/40 hover:text-gold"
                              )}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {prompt.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {prompt.tags.map((tag: string) => (
                      <Link
                        key={tag}
                        to={`/?tag=${tag}`}
                        className="px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-sm hover:bg-secondary/80 transition-colors"
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Recommended Prompts - Immediately visible */}
        {recommendations && recommendations.length > 0 && (
          <section className="border-t border-border py-4 sm:py-6 lg:py-8 mt-2 sm:mt-4">
            <div className="px-4 sm:px-5 lg:px-6 xl:px-8">
              <div className="max-w-[1920px] mx-auto">
                <h2 className="font-serif text-lg sm:text-xl mb-3 sm:mb-4">More like this</h2>

                <div className="masonry-grid">
                  {recommendations.slice(0, 8).map((rec) => (
                    <PromptCard
                      key={rec.id}
                      id={rec.id}
                      title={rec.title}
                      promptText={rec.promptText}
                      imageUrl={rec.imageUrl}
                      toolUsed={rec.toolUsed}
                      viewCount={rec.viewCount}
                      copyCount={rec.copyCount}
                      likeCount={rec.likeCount}
                      creator={rec.creator}
                      tags={rec.tags}
                      isLiked={rec.isLiked}
                      isSaved={rec.isSaved}
                      onLoginRequired={() => setAuthModalOpen(true)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultMode="login"
      />

      {prompt && (
        <SharePromptDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          promptId={prompt.id}
          title={prompt.title}
          imageUrl={prompt.imageUrl}
        />
      )}
    </div>
  );
}
