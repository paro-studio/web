
import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getProfile } from "@/services/supabase/profiles";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PromptCard } from "@/components/prompts/PromptCard";
import { EditPromptModal } from "@/components/prompts/EditPromptModal";
import { AuthModal } from "@/components/auth/AuthModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { PromptWithDetails } from "@/hooks/usePrompts";
import { ExternalLink, Plus, Sparkles } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";


export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile: currentUserProfile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [editingPrompt, setEditingPrompt] = useState<PromptWithDetails | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      if (!id) return null;
      // Get profile by ID from Supabase
      const supabaseProfile = await getProfile(id);
      if (!supabaseProfile) return null;
      
      // Convert Supabase Profile to UserProfile format
      return {
        id: supabaseProfile.id,
        username: supabaseProfile.username || supabaseProfile.id.slice(0, 8),
        display_name: supabaseProfile.full_name || supabaseProfile.username || 'User',
        avatar_url: supabaseProfile.avatar_url,
        cover_url: supabaseProfile.cover_url,
        bio: supabaseProfile.bio,
        verified: supabaseProfile.verified ?? false,
      };
    },
    enabled: !!id,
  });

  const { data: prompts, isLoading: promptsLoading, refetch: refetchPrompts } = useQuery({
    queryKey: ["profile-prompts", profile?.id, currentUserProfile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Get prompts from Supabase
      const { getUserPrompts } = await import('@/services/supabase/prompts');
      const { prompts: userPrompts, error } = await getUserPrompts(profile.id);

      if (error) {
        console.error('Error fetching user prompts:', error);
        return [];
      }

      // Sort by newest first
      userPrompts.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      // Enrich in bulk — four queries for the whole grid, not four per prompt.
      const { getLikeCounts, getLikedPromptIds } = await import('@/services/supabase/likes');
      const { getSavedPromptIds } = await import('@/services/supabase/saves');
      const { getPromptRatings } = await import('@/services/supabase/ratings');

      const promptIds = userPrompts.map(p => p.id);
      const viewerId = currentUserProfile?.id;

      const [likeCounts, likedIds, savedIds, ratingsMap] = await Promise.all([
        getLikeCounts(promptIds),
        viewerId ? getLikedPromptIds(viewerId, promptIds) : Promise.resolve(new Set<string>()),
        viewerId ? getSavedPromptIds(viewerId, promptIds) : Promise.resolve(new Set<string>()),
        getPromptRatings(promptIds),
      ]);

      // Every prompt on this page belongs to the profile being viewed, so the
      // creator is already loaded — no per-row profile lookup needed.
      const creator = profile;

      const enriched = userPrompts.map((p) => {
        const ratingInfo = ratingsMap.get(p.id);
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
            username: creator.username || 'unknown',
            displayName: creator.display_name || creator.username || 'Unknown',
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
          isLiked: likedIds.has(p.id),
          isSaved: savedIds.has(p.id),
          accuracyRating: ratingInfo?.average,
          ratingCount: ratingInfo?.count,
        };
      });

      return enriched;
    },
    enabled: !!profile?.id,
  });

  // Check follow status and get follower count using React Query
  const { data: followerData } = useQuery({
    queryKey: ["follower-count", profile?.id, currentUserProfile?.id],
    queryFn: async () => {
      if (!profile?.id) return { count: 0, following: false };
      
      const { getFollowerCount, isFollowing: checkIsFollowing } = await import('@/services/supabase/follows');
      const count = await getFollowerCount(profile.id);
      
      if (currentUserProfile) {
        const following = await checkIsFollowing(currentUserProfile.id, profile.id);
        return { count, following };
      }
      
      return { count, following: false };
    },
    enabled: !!profile?.id,
  });

  useEffect(() => {
    if (followerData) {
      setFollowerCount(followerData.count);
      setIsFollowing(followerData.following);
    }
  }, [followerData]);

  const handleFollow = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to follow creators",
      });
      return;
    }

    if (!currentUserProfile || !profile?.id) return;

    const newFollowing = !isFollowing;
    setIsFollowing(newFollowing);
    setFollowerCount((prev) => (newFollowing ? prev + 1 : prev - 1));

    const { toggleFollow } = await import('@/services/supabase/follows');
    await toggleFollow(currentUserProfile.id, profile.id);
    
    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ['follower-count', profile.id] });
  };



  const isOwnProfile = currentUserProfile?.id === id;

  if (profileLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background">
        <Navbar />
        <main className="pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center py-8 sm:py-12">
            <Skeleton className="h-20 w-20 sm:h-24 sm:w-24 rounded-full mx-auto" />
            <Skeleton className="h-6 sm:h-8 w-36 sm:w-48 mx-auto mt-4" />
            <Skeleton className="h-4 w-24 sm:w-32 mx-auto mt-2" />
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background">
        <Navbar />
        <main className="pt-14 sm:pt-16 lg:pt-20 px-4 sm:px-6 lg:px-8 text-center py-12 sm:py-16">
          <h1 className="font-serif text-xl sm:text-2xl">Profile not found</h1>
          <Link to="/" className="text-muted-foreground hover:text-foreground mt-4 inline-block text-sm">
            Return home
          </Link>
        </main>
      </div>
    );
  }

  const coverUrl = profile.cover_url;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-14 sm:pt-16 lg:pt-20">
        {/* Cover Photo */}
        <div className="relative h-32 xs:h-40 sm:h-48 md:h-56 lg:h-64 bg-secondary overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt="Cover"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-secondary to-muted" />
          )}
        </div>

        {/* Profile Header */}
        <section className="px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center -mt-10 sm:-mt-12 relative z-10">
            <Avatar className="h-20 w-20 sm:h-24 sm:w-24 mx-auto mb-3 sm:mb-4 border-4 border-background">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback className="bg-secondary font-serif text-xl sm:text-2xl">
                {(profile.display_name || profile.username).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <h1 className="font-serif text-2xl sm:text-3xl mb-1 flex items-center justify-center gap-2">
              {profile.display_name || profile.username}
              {profile.verified && <VerifiedBadge className="h-5 w-5" />}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">@{profile.username}</p>

            {profile.bio && (
              <p className="text-sm sm:text-base text-foreground/80 max-w-md mx-auto mb-4 sm:mb-6 px-4">
                {profile.bio}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center justify-center gap-6 sm:gap-8 mb-4 sm:mb-6 text-sm">
              <div>
                <span className="font-medium">{prompts?.length || 0}</span>
                <span className="text-muted-foreground ml-1">prompts</span>
              </div>
              <div>
                <span className="font-medium">{followerCount.toLocaleString()}</span>
                <span className="text-muted-foreground ml-1">followers</span>
              </div>
            </div>

            {/* Action Buttons */}
            {!isOwnProfile && (
              <Button
                onClick={handleFollow}
                variant={isFollowing ? "outline" : "default"}
                size="default"
                className="min-w-[100px]"
              >
                {isFollowing ? "Following" : "Follow"}
              </Button>
            )}

            {isOwnProfile && (
              <Button variant="outline" size="default" asChild>
                <Link to="/settings">Edit Profile</Link>
              </Button>
            )}
          </div>
        </section>

        {/* Prompts Grid */}
        <section className="px-4 sm:px-5 lg:px-6 xl:px-8 py-6 sm:py-8 border-t border-border mt-6 sm:mt-8">
          <div className="max-w-[1920px] mx-auto">
            <h2 className="font-serif text-xl sm:text-2xl mb-4 sm:mb-6">Prompts</h2>

            {promptsLoading ? (
              <div className="masonry-grid">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="masonry-item">
                    <Skeleton className="aspect-[3/4] rounded-sm" />
                  </div>
                ))}
              </div>
            ) : prompts?.length === 0 ? (
              isOwnProfile ? (
                <div className="text-center py-12 sm:py-16 max-w-md mx-auto">
                  <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
                    <Sparkles className="h-6 w-6 text-gold" />
                  </div>
                  <h3 className="font-serif text-lg sm:text-xl mb-2">
                    You haven't posted any prompts yet
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Share your prompts to showcase your creative workflows with the community and build your profile.
                  </p>
                  <Button asChild size="default" className="gap-2">
                    <Link to="/upload">
                      <Plus className="h-4 w-4" />
                      Post your first prompt
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <p className="text-sm sm:text-base text-muted-foreground">No prompts yet</p>
                </div>
              )
            ) : (
              <div className="masonry-grid">
                {prompts?.map((prompt) => (
                  <div key={prompt.id} className="masonry-item relative group/card">
                    <PromptCard
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
                      showEditButton={isOwnProfile}
                      onEditClick={() => setEditingPrompt(prompt)}
                      onLoginRequired={() => setAuthModalOpen(true)}
                      onDelete={() => refetchPrompts()}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>


      </main>

      <Footer />

      {/* Edit Modal */}
      {editingPrompt && (
        <EditPromptModal
          isOpen={!!editingPrompt}
          onClose={() => setEditingPrompt(null)}
          prompt={{
            id: editingPrompt.id,
            title: editingPrompt.title,
            prompt_text: editingPrompt.promptText,
            image_url: editingPrompt.imageUrl,
            tool_used: editingPrompt.toolUsed,
            tags: editingPrompt.tags,
          }}
          onUpdated={refetchPrompts}
        />
      )}

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultMode="login"
      />
    </div>
  );
}