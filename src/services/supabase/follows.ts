/**
 * Supabase Follows Service
 * Handles follow CRUD operations
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * Check if a user is following another user
 */
export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .match({ follower_id: followerId, following_id: followingId })
    .maybeSingle();

  if (error) {
    console.error('Error checking follow status:', error);
    return false;
  }

  return data !== null;
}

/**
 * Get follower count for a user
 */
export async function getFollowerCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);

  if (error) {
    console.error('Error getting follower count:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Follower counts for many users in one query.
 *
 * Users with no followers are absent from the map — read with `?? 0`.
 */
export async function getFollowerCounts(userIds: string[]): Promise<Map<string, number>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .in('following_id', unique);

  if (error) {
    console.error('Error getting follower counts:', error);
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const { following_id } of data ?? []) {
    counts.set(following_id, (counts.get(following_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Get following count for a user
 */
export async function getFollowingCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);

  if (error) {
    console.error('Error getting following count:', error);
    return 0;
  }

  return count || 0;
}

/** Set the requested follow state without depending on a possibly stale read. */
export async function setFollow(followerId: string, followingId: string, active: boolean): Promise<{ error: PostgrestError | null }> {
  if (!active) {
    const { error } = await supabase
      .from('follows')
      .delete()
      .match({ follower_id: followerId, following_id: followingId });
    return { error };
  }

  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: followerId, following_id: followingId },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
    );
  return { error };
}
