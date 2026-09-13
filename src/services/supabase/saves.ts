/**
 * Supabase Saves Service
 * Handles save CRUD operations
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './client';
import type { NormalizedPrompt } from '@/lib/types';

/**
 * Check if a user has saved a prompt
 */
export async function isSaved(userId: string, promptId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('saves')
    .select('id')
    .match({ user_id: userId, prompt_id: promptId })
    .maybeSingle();

  if (error) {
    console.error('Error checking save status:', error);
    return false;
  }

  return data !== null;
}

/**
 * Which of these prompts the given user has saved, as a set of prompt ids.
 *
 * The `saves` SELECT policy is scoped to the owner, so this only ever returns
 * the caller's own rows.
 */
export async function getSavedPromptIds(userId: string, promptIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(promptIds));
  if (unique.length === 0) return new Set();

  const { data, error } = await supabase
    .from('saves')
    .select('prompt_id')
    .eq('user_id', userId)
    .in('prompt_id', unique);

  if (error) {
    console.error('Error getting saved prompts:', error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.prompt_id));
}

/** Set the requested save state without depending on a possibly stale read. */
export async function setSave(userId: string, promptId: string, active: boolean): Promise<{ error: PostgrestError | null }> {
  if (!active) {
    const { error } = await supabase
      .from('saves')
      .delete()
      .match({ user_id: userId, prompt_id: promptId });
    return { error };
  }

  const { error } = await supabase
    .from('saves')
    .upsert({ user_id: userId, prompt_id: promptId }, { onConflict: 'user_id,prompt_id', ignoreDuplicates: true });
  return { error };
}

/**
 * Get all prompts saved by a user (for Saved page)
 * Returns prompts with join
 */
export async function getUserSaves(
  userId: string
): Promise<{ prompts: NormalizedPrompt[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('saves')
    .select(`
      prompt_id,
      prompts (
        id,
        user_id,
        title,
        prompt,
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
        promptText: p.prompt,
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
