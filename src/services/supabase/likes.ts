/**
 * Supabase Likes Service
 * Handles like CRUD operations
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './client';
import type { NormalizedPrompt } from '@/lib/types';

/**
 * Check if a user has liked a prompt
 */
export async function isLiked(userId: string, promptId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('likes')
    .select('id')
    .match({ user_id: userId, prompt_id: promptId })
    .maybeSingle();

  if (error) {
    console.error('Error checking like status:', error);
    return false;
  }

  return data !== null;
}

/**
 * Get like count for a prompt
 */
export async function getLikeCount(promptId: string): Promise<number> {
  const { data, error } = await supabase
    .from('prompts')
    .select('like_count')
    .eq('id', promptId)
    .maybeSingle();

  if (error) {
    console.error('Error getting like count:', error);
    return 0;
  }

  return data?.like_count ?? 0;
}

/**
 * Like counts for many prompts in one query.
 *
 * Reads denormalized `like_count` directly from `prompts`, transferring only
 * one row per requested prompt ID regardless of total like volume.
 * Prompts with no likes are simply absent from the map — read with `?? 0`.
 */
export async function getLikeCounts(promptIds: string[]): Promise<Map<string, number>> {
  const unique = Array.from(new Set(promptIds));
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('prompts')
    .select('id, like_count')
    .in('id', unique);

  if (error) {
    console.error('Error getting like counts:', error);
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const { id, like_count } of data ?? []) {
    counts.set(id, like_count ?? 0);
  }
  return counts;
}

/**
 * Which of these prompts the given user has liked, as a set of prompt ids.
 */
export async function getLikedPromptIds(userId: string, promptIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(promptIds));
  if (unique.length === 0) return new Set();

  const { data, error } = await supabase
    .from('likes')
    .select('prompt_id')
    .eq('user_id', userId)
    .in('prompt_id', unique);

  if (error) {
    console.error('Error getting liked prompts:', error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.prompt_id));
}

/** Set the requested like state without depending on a possibly stale read. */
export async function setLike(userId: string, promptId: string, active: boolean): Promise<{ error: PostgrestError | null }> {
  if (!active) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .match({ user_id: userId, prompt_id: promptId });
    return { error };
  }

  const { error } = await supabase
    .from('likes')
    .upsert({ user_id: userId, prompt_id: promptId }, { onConflict: 'user_id,prompt_id', ignoreDuplicates: true });
  return { error };
}

/**
 * Get all prompts liked by a user (for Liked page)
 * Returns prompts with join
 */
export async function getUserLikes(
  userId: string
): Promise<{ prompts: NormalizedPrompt[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('likes')
    .select(`
      prompt_id,
      prompts (
        id,
        user_id,
        title,
        image_url,
        ai_tool,
        tags,
        created_at,
        view_count,
        copy_count
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return { prompts: [], error };
  }

  // Flatten and normalize to camelCase (match PromptWithDetails shape)
  const prompts = (data || [])
    .filter(item => item.prompts !== null)
    .map(item => {
      const p = item.prompts;
      return {
        id: p.id,
        userId: p.user_id,
        title: p.title,
        imageUrl: p.image_url,
        toolUsed: p.ai_tool,
        tags: p.tags || [],
        createdAt: p.created_at,
        viewCount: p.view_count || 0,
        copyCount: p.copy_count || 0,
      };
    });

  return { prompts, error: null };
}
