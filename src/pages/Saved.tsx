import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PromptCard } from "@/components/prompts/PromptCard";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserSaves } from "@/services/supabase/saves";
import { getProfilesByIds } from "@/services/supabase/profiles";
import { getLikeCounts, getLikedPromptIds } from "@/services/supabase/likes";
import { getPromptRatings } from "@/services/supabase/ratings";

export default function Saved() {
  const { user, session, profile, loading } = useAuth();

  // Fetch saved prompts from Supabase
  const { data: savedPrompts, isLoading, refetch } = useQuery({
    queryKey: ["saved-prompts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get saved prompts from Supabase
      const { prompts, error } = await getUserSaves(user.id);
      
      if (error) {
        console.error('Error fetching saved prompts:', error);
        return [];
      }

      // Enrich the whole page with bulk lookups rather than per-card requests.
      const promptIds = prompts.map((p) => p.id);
      const [creators, likedIds, likeCounts, ratings] = await Promise.all([
        getProfilesByIds(prompts.map((p) => p.userId)),
        getLikedPromptIds(user.id, promptIds),
        getLikeCounts(promptIds),
        getPromptRatings(promptIds),
      ]);

      const enriched = prompts.map((p) => {
        const creator = creators.get(p.userId) ?? null;
        const liked = likedIds.has(p.id);
        const rating = ratings.get(p.id);

        return {
          id: p.id,
          title: p.title,
          promptText: p.promptText,
          imageUrl: p.imageUrl,
          toolUsed: p.toolUsed,
          viewCount: p.viewCount || 0,
          copyCount: p.copyCount || 0,
          createdAt: p.createdAt,
          tags: p.tags || [],
          creator: creator ? {
            id: creator.id,
            username: creator.username || 'unknown',
            displayName: creator.full_name || creator.username || 'Unknown',
            avatarUrl: creator.avatar_url,
            verified: creator.verified ?? false
          } : {
            id: p.userId,
            username: 'unknown',
            displayName: 'Unknown User',
            avatarUrl: null,
            verified: false
          },
          likeCount: likeCounts.get(p.id) ?? 0,
          isLiked: liked,
          isSaved: true, // Always true on this page
          accuracyRating: rating?.average ?? null,
          ratingCount: rating?.count ?? 0
        };
      });

      return enriched;
    },
    enabled: !!user?.id,
  });

  // Auth guard: wait for loading, then check session
  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8 text-center py-12 sm:py-16">
          <p className="text-sm sm:text-base text-muted-foreground">Loading...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8 text-center py-12 sm:py-16">
          <h1 className="font-serif text-xl sm:text-2xl mb-3 sm:mb-4">Sign in to view saved prompts</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Your saved prompts will appear here
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-14 sm:pt-16 lg:pt-20">
        <div className="px-4 sm:px-5 lg:px-6 xl:px-8 py-8 sm:py-10 lg:py-12">
          <div className="max-w-[1920px] mx-auto">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-6 sm:mb-8">
              <Bookmark className="h-5 w-5 sm:h-6 sm:w-6 text-gold" />
              <h1 className="font-serif text-2xl sm:text-3xl">Saved Prompts</h1>
            </div>

            {isLoading ? (
              <div className="masonry-grid">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="masonry-item">
                    <Skeleton className="aspect-[3/4] rounded-xl" />
                  </div>
                ))}
              </div>
            ) : savedPrompts?.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">No saved prompts yet</p>
                <Link to="/" className="text-gold hover:underline text-sm sm:text-base">
                  Explore prompts
                </Link>
              </div>
            ) : (
              <div className="masonry-grid">
                {savedPrompts?.map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    id={prompt.id}
                    title={prompt.title}
                    promptText={prompt.promptText}
                    imageUrl={prompt.imageUrl}
                    toolUsed={prompt.toolUsed}
                    viewCount={prompt.viewCount}
                    copyCount={prompt.copyCount}
                    likeCount={prompt.likeCount}
                    accuracyRating={prompt.accuracyRating}
                    ratingCount={prompt.ratingCount}
                    creator={prompt.creator}
                    tags={prompt.tags}
                    isLiked={prompt.isLiked}
                    isSaved={prompt.isSaved}
                    onLikeChange={refetch}
                    onSaveChange={refetch}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
