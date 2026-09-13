import type { NormalizedPrompt } from "@/lib/types";
import type { PromptWithDetails } from "./usePrompts";

/** Normalize shared card data with a fixed number of bulk lookups per list. */
export async function enrichPrompts(prompts: NormalizedPrompt[], viewerId?: string): Promise<PromptWithDetails[]> {
  if (prompts.length === 0) return [];
  const { getProfilesByIds } = await import("@/services/supabase/profiles");
  const { getLikeCounts, getLikedPromptIds } = await import("@/services/supabase/likes");
  const { getSavedPromptIds } = await import("@/services/supabase/saves");
  const { getPromptRatings } = await import("@/services/supabase/ratings");
  const ids = [...new Set(prompts.map(prompt => prompt.id))];
  const creatorIds = [...new Set(prompts.map(prompt => prompt.userId))];
  const [profiles, counts, liked, saved, ratings] = await Promise.all([
    getProfilesByIds(creatorIds),
    getLikeCounts(ids),
    viewerId ? getLikedPromptIds(viewerId, ids) : Promise.resolve(new Set<string>()),
    viewerId ? getSavedPromptIds(viewerId, ids) : Promise.resolve(new Set<string>()),
    getPromptRatings(ids),
  ]);
  return prompts.map(prompt => {
    const creator = profiles.get(prompt.userId);
    const rating = ratings.get(prompt.id);
    return {
      id: prompt.id,
      title: prompt.title,
      promptText: prompt.promptText,
      imageUrl: prompt.imageUrl,
      toolUsed: prompt.toolUsed,
      viewCount: prompt.viewCount ?? 0,
      copyCount: prompt.copyCount ?? 0,
      createdAt: prompt.createdAt,
      tags: prompt.tags ?? [],
      creator: {
        id: creator?.id ?? prompt.userId,
        username: creator?.username || "unknown",
        displayName: creator?.full_name || creator?.username || "Unknown User",
        avatarUrl: creator?.avatar_url ?? null,
        verified: creator?.verified ?? false,
      },
      likeCount: counts.get(prompt.id) ?? 0,
      isLiked: liked.has(prompt.id),
      isSaved: saved.has(prompt.id),
      accuracyRating: rating?.average ?? null,
      ratingCount: rating?.count ?? 0,
    };
  });
}
