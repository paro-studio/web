/**
 * Supabase Ratings Service
 * Handles prompt accuracy rating operations and calculations
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './client';

export interface PromptRatingInfo {
  average: number | null;
  count: number;
}

/**
 * Get accuracy rating info for a single prompt from Supabase
 */
export async function getPromptRating(promptId: string): Promise<PromptRatingInfo> {
  if (!promptId) return { average: null, count: 0 };

  try {
    const { data, error } = await supabase
      .from('prompts')
      .select('rating_average, rating_count')
      .eq('id', promptId)
      .maybeSingle();

    if (error || !data) {
      return { average: null, count: 0 };
    }

    return {
      average: data.rating_average !== null && data.rating_average !== undefined ? Number(data.rating_average) : null,
      count: data.rating_count ?? 0,
    };
  } catch {
    return { average: null, count: 0 };
  }
}

/**
 * Get accuracy ratings for multiple prompts in bulk (for feeds & lists)
 *
 * Reads denormalized rating aggregates directly from `prompts`, transferring only
 * one row per prompt ID regardless of total rating volume.
 */
export async function getPromptRatings(promptIds: string[]): Promise<Map<string, PromptRatingInfo>> {
  const result = new Map<string, PromptRatingInfo>();
  const uniqueIds = Array.from(new Set(promptIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from('prompts')
      .select('id, rating_average, rating_count')
      .in('id', uniqueIds);

    if (error || !data) {
      for (const id of uniqueIds) {
        result.set(id, { average: null, count: 0 });
      }
      return result;
    }

    const map = new Map(data.map((p) => [p.id, p]));
    for (const id of uniqueIds) {
      const row = map.get(id);
      result.set(id, {
        average: row?.rating_average !== null && row?.rating_average !== undefined ? Number(row.rating_average) : null,
        count: row?.rating_count ?? 0,
      });
    }
  } catch {
    for (const id of uniqueIds) {
      result.set(id, { average: null, count: 0 });
    }
  }

  return result;
}

/**
 * Get a user's rating for a specific prompt
 */
export async function getUserPromptRating(userId: string, promptId: string): Promise<number | null> {
  if (!userId || !promptId) return null;

  try {
    const { data, error } = await supabase
      .from('prompt_ratings')
      .select('rating')
      .eq('user_id', userId)
      .eq('prompt_id', promptId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.rating ?? null;
  } catch {
    return null;
  }
}

/**
 * Submit or update an accuracy rating (1 - 5 stars) for a prompt
 */
export async function ratePrompt(
  userId: string,
  promptId: string,
  rating: number
): Promise<{ ratingInfo: PromptRatingInfo; error: PostgrestError | null }> {
  const normalizedRating = Math.max(1, Math.min(5, Math.round(rating)));

  const { error } = await supabase
    .from('prompt_ratings')
    .upsert(
      {
        user_id: userId,
        prompt_id: promptId,
        rating: normalizedRating,
      },
      { onConflict: 'user_id,prompt_id' }
    );

  const updatedRating = await getPromptRating(promptId);
  return { ratingInfo: updatedRating, error };
}
