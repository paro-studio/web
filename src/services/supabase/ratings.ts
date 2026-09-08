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
      .from('prompt_ratings')
      .select('rating')
      .eq('prompt_id', promptId);

    if (error || !data || data.length === 0) {
      return { average: null, count: 0 };
    }

    const ratingsList: number[] = data.map((r) => r.rating);
    const sum = ratingsList.reduce((acc, r) => acc + r, 0);
    const count = ratingsList.length;
    const average = Number((sum / count).toFixed(1));

    return { average, count };
  } catch {
    return { average: null, count: 0 };
  }
}

/**
 * Get accuracy ratings for multiple prompts in bulk (for feeds & lists)
 */
export async function getPromptRatings(promptIds: string[]): Promise<Map<string, PromptRatingInfo>> {
  const result = new Map<string, PromptRatingInfo>();
  const uniqueIds = Array.from(new Set(promptIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from('prompt_ratings')
      .select('prompt_id, rating')
      .in('prompt_id', uniqueIds);

    const grouped: Record<string, number[]> = {};

    if (!error && data && data.length > 0) {
      for (const row of data) {
        if (!grouped[row.prompt_id]) grouped[row.prompt_id] = [];
        grouped[row.prompt_id].push(row.rating);
      }
    }

    for (const id of uniqueIds) {
      if (grouped[id] && grouped[id].length > 0) {
        const ratings = grouped[id];
        const sum = ratings.reduce((acc, r) => acc + r, 0);
        const count = ratings.length;
        result.set(id, { average: Number((sum / count).toFixed(1)), count });
      } else {
        result.set(id, { average: null, count: 0 });
      }
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
