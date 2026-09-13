import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PromptCard } from "@/components/prompts/PromptCard";
import { Skeleton } from "@/components/ui/skeleton";
import { getLikeCounts, getUserLikes } from "@/services/supabase/likes";
import { getProfilesByIds } from "@/services/supabase/profiles";
import { getSavedPromptIds } from "@/services/supabase/saves";
import { getPromptRatings } from "@/services/supabase/ratings";

export default function Liked() {
  const { user, session, profile, loading } = useAuth();

  // Fetch liked prompts from Supabase
  const { data: likedPrompts, isLoading, refetch } = useQuery({
    queryKey: ["liked-prompts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get liked prompts from Supabase
      const { prompts, error } = await getUserLikes(user.id);
      
      if (error) {
        console.error('Error fetching liked prompts:', error);
        return [];
      }

      // Enrich the whole page with bulk lookups rather than per-card requests.
      const promptIds = prompts.map((p) => p.id);
      const [creators, savedIds, likeCounts, ratings] = await Promise.all([
        getProfilesByIds(prompts.map((p) => p.userId)),
        getSavedPromptIds(user.id, promptIds),
        getLikeCounts(promptIds),
        getPromptRatings(promptIds),
      ]);

      const enriched = prompts.map((p) => {
        const creator = creators.get(p.userId) ?? null;
        const saved = savedIds.has(p.id);
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
          isLiked: true, // Always true on this page
          isSaved: saved,
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
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 lg:pt-24 container mx-auto px-4 lg:px-8 text-center py-16">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 lg:pt-24 container mx-auto px-4 lg:px-8 text-center py-16">
          <h1 className="font-serif text-2xl mb-4">Sign in to view liked prompts</h1>
          <p className="text-muted-foreground">
            Your liked prompts will appear here
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
          <div className="flex items-center justify-center gap-3 mb-8">
            <Heart className="h-6 w-6 text-destructive" />
            <h1 className="font-serif text-3xl">Liked Prompts</h1>
          </div>

          {isLoading ? (
            <div className="masonry-grid">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="masonry-item">
                  <Skeleton className="aspect-[3/4] rounded-xl" />
                </div>
              ))}
            </div>
          ) : likedPrompts?.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No liked prompts yet</p>
              <Link to="/" className="text-gold hover:underline">
                Explore prompts
              </Link>
            </div>
          ) : (
            <div className="masonry-grid">
              {likedPrompts?.map((prompt) => (
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
      </main>

      <Footer />
    </div>
  );
}
