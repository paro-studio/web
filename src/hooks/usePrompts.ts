
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getAllPrompts, getRecentPromptCreatorIds, searchPrompts } from "@/services/supabase/prompts";
import { getProfilesByIds } from "@/services/supabase/profiles";
import { getLikeCounts, getLikedPromptIds } from "@/services/supabase/likes";
import { getSavedPromptIds } from "@/services/supabase/saves";
import { getPromptRatings } from "@/services/supabase/ratings";
import { getFollowerCounts } from "@/services/supabase/follows";
import { promptsQueryKey } from "@/hooks/queryKeys";

export interface PromptWithDetails {
  id: string;
  title: string;
  imageUrl: string;
  toolUsed: string;
  viewCount: number;
  copyCount: number;
  createdAt: string;
  tags: string[];
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    verified: boolean;
  };
  likeCount: number;
  isLiked: boolean;
  isSaved: boolean;
  accuracyRating?: number | null;
  ratingCount?: number;
}

export const FEED_PAGE_SIZE = 50;

// Sorting happens here rather than in the query, so a page is a slice of the
// sorted rows. Every page has to slice the same list or prompts repeat and go
// missing between pages, so early pages all share this many rows. Past this
// many prompts, Trending and Most copied need sorting in the database (#143).
const MIN_ROWS_TO_SORT = 200;

export function usePrompts(options?: {
  selectedTags?: string[];
  searchQuery?: string;
  sortBy?: "trending" | "newest" | "most_copied";
  limit?: number;
  page?: number;
}) {
  const { user, sessionLoading } = useAuth();
  const { selectedTags = [], searchQuery = "", sortBy = "trending", limit = FEED_PAGE_SIZE, page = 1 } = options || {};
  const rowsToFetch = Math.max(page * limit * 2, MIN_ROWS_TO_SORT);

  const trimmedQuery = searchQuery.trim();
  const isSearch = Boolean(trimmedQuery || selectedTags.length > 0);
  const tagsKey = JSON.stringify(selectedTags);

  // Search queries use server-side full-text search (searchPrompts).
  // Default feed rows are cached and re-sorted/filtered in memory without refetching.
  const selectFeed = useCallback(
    (allPrompts: PromptWithDetails[]) => {
      let filtered = allPrompts;

      if (selectedTags.length > 0) {
        filtered = filtered.filter(p =>
          selectedTags.some(tag => p.tags.includes(tag))
        );
      }

      // Copy before sorting so the cached list is never reordered in place.
      return [...filtered]
        .sort((a, b) => {
          if (sortBy === "newest") {
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          } else if (sortBy === "most_copied") {
            return (b.copyCount || 0) - (a.copyCount || 0);
          } else {
            // Trending: copies count most, then likes, then views.
            const score = (p: PromptWithDetails) =>
              (p.viewCount || 0) + (p.copyCount || 0) * 3 + (p.likeCount || 0) * 2;
            return score(b) - score(a);
          }
        })
        .slice((page - 1) * limit, page * limit);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tagsKey, sortBy, limit, page]
  );

  const feedQuery = {
    // The user id is in the key because isLiked and isSaved depend on it.
    // When searching, include query and tags in the key to fetch via searchPrompts.
    queryKey: isSearch
      ? ["prompts", "search", trimmedQuery, tagsKey, rowsToFetch, user?.id ?? null]
      : promptsQueryKey(rowsToFetch, user?.id),
    queryFn: async () => {
      const { prompts: allPrompts, error } = isSearch
        ? await searchPrompts({
            query: trimmedQuery || undefined,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
            limit: rowsToFetch,
          })
        : await getAllPrompts(rowsToFetch);

      if (error) throw error;

      // Enrich in bulk. Doing this per prompt meant 4 extra round trips each,
      // 200+ requests for a 50-prompt feed. These five run once, in parallel,
      // regardless of how many prompts came back.
      const promptIds = allPrompts.map(p => p.id);
      const creatorIds = allPrompts.map(p => p.userId);

      const [profiles, likeCounts, likedIds, savedIds, ratingsMap] = await Promise.all([
        getProfilesByIds(creatorIds),
        getLikeCounts(promptIds),
        user ? getLikedPromptIds(user.id, promptIds) : Promise.resolve(new Set<string>()),
        user ? getSavedPromptIds(user.id, promptIds) : Promise.resolve(new Set<string>()),
        getPromptRatings(promptIds),
      ]);

      const enrichedPrompts: PromptWithDetails[] = allPrompts.map((p) => {
        const profile = profiles.get(p.userId) ?? null;
        const ratingInfo = ratingsMap.get(p.id);

        return {
          id: p.id,
          title: p.title,
          imageUrl: p.imageUrl,
          toolUsed: p.toolUsed,
          viewCount: p.viewCount || 0,
          copyCount: p.copyCount || 0,
          createdAt: p.createdAt || new Date().toISOString(),
          tags: p.tags || [],
          creator: profile ? {
            id: profile.id,
            username: profile.username || 'unknown',
            displayName: profile.full_name || profile.username || 'Unknown',
            avatarUrl: profile.avatar_url,
            verified: profile.verified ?? false
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
          accuracyRating: ratingInfo?.average ?? null,
          ratingCount: ratingInfo?.count ?? 0,
        };
      });

      return enrichedPrompts;
    },
    placeholderData: (previousData: PromptWithDetails[] | undefined) => previousData,
    // Waits only for the stored session, which is read locally. Waiting on the
    // profile fetch as well held the whole feed back behind two extra round
    // trips it does not need.
    enabled: !sessionLoading,
  };

  const query = useQuery({ ...feedQuery, select: selectFeed });
  const { data: rowCount = 0 } = useQuery({
    ...feedQuery,
    select: (rows: PromptWithDetails[]) => rows.length,
  });

  return { ...query, hasNextPage: rowCount > page * limit };
}

export function useTopCreators(limit = 6) {
  return useQuery({
    queryKey: ["top-creators", limit],
    queryFn: async () => {
      // Only the owner of each prompt is needed here. Fetching whole rows
      // downloaded the full text of 200 prompts just to count them.
      const { userIds, error } = await getRecentPromptCreatorIds(200);

      if (error) throw error;

      const creatorIds = Array.from(new Set(userIds));

      // Two queries total, rather than two per creator.
      const [profiles, followerCounts] = await Promise.all([
        getProfilesByIds(creatorIds),
        getFollowerCounts(creatorIds),
      ]);

      const promptCounts = new Map<string, number>();
      for (const userId of userIds) {
        promptCounts.set(userId, (promptCounts.get(userId) ?? 0) + 1);
      }

      return creatorIds
        .map((id) => {
          const profile = profiles.get(id);
          if (!profile) return null;

          return {
            id: profile.id,
            username: profile.username || 'unknown',
            displayName: profile.full_name || profile.username || 'Unknown',
            avatarUrl: profile.avatar_url,
            verified: profile.verified ?? false,
            promptCount: promptCounts.get(id) ?? 0,
            followerCount: followerCounts.get(id) ?? 0,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.followerCount - a.followerCount || b.promptCount - a.promptCount)
        .slice(0, limit);
    },
  });
}
