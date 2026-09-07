/**
 * Supabase Prompts Service
 * Handles prompt CRUD operations
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './client';
import type { NormalizedPrompt } from '@/lib/types';

export interface Prompt {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  image_url: string;
  ai_tool: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface CreatePromptData {
  user_id: string;
  title: string;
  prompt: string;
  image_url: string;
  ai_tool: string;
  tags?: string[];
}

/**
 * Create a new prompt
 * CRITICAL: user_id must be explicitly passed and match auth.uid() for RLS
 */
export async function createPrompt(data: CreatePromptData) {
  const { data: prompt, error } = await supabase
    .from('prompts')
    .insert([{
      user_id: data.user_id,
      title: data.title,
      prompt: data.prompt,
      image_url: data.image_url,
      ai_tool: data.ai_tool,
      tags: data.tags || []
    }])
    .select()
    .single();

  if (error) {
    console.error('❌ createPrompt: Insert failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return { prompt: null, error };
  }

  // CRITICAL: Verify the inserted row has id and user_id

  if (!prompt?.id) {
    console.error('❌ createPrompt: WARNING - No ID in inserted row!');
  }
  
  if (!prompt?.user_id) {
    console.error('❌ createPrompt: WARNING - No user_id in inserted row!');
  }

  return { prompt, error: null };
}

/**
 * Get prompt by ID
 * Should be accessible publicly (read access for all)
 */
export async function getPrompt(id: string) {
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('❌ getPrompt: Fetch failed:', {
      promptId: id,
      code: error.code,
      message: error.message,
      details: error.details
    });
    return { prompt: null, error };
  }


  return { prompt: data, error: null };
}

export async function getUserPrompts(
  userId: string
): Promise<{ prompts: NormalizedPrompt[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ getUserPrompts: Fetch failed:', error);
    return { prompts: [], error };
  }

  // Normalize to camelCase (match PromptWithDetails shape)
  const normalizedPrompts: NormalizedPrompt[] = (data || []).map(p => ({
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
  }));

  return { prompts: normalizedPrompts, error: null };
}

/**
 * Get all prompts (for main feed)
 * Should be accessible publicly (read access for all)
 */
export async function getAllPrompts(
  limit = 50
): Promise<{ prompts: NormalizedPrompt[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ getAllPrompts: Fetch failed:', {
      code: error.code,
      message: error.message,
      details: error.details
    });
    return { prompts: [], error };
  }

  // Normalize to camelCase (match PromptWithDetails shape)
  const normalizedPrompts: NormalizedPrompt[] = (data || []).map(p => ({
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
  }));

  return { prompts: normalizedPrompts, error: null };
}

/**
 * Update prompt
 */
export async function updatePrompt(id: string, userId: string, updates: Partial<CreatePromptData>) {
  const { data, error } = await supabase
    .from('prompts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId) // RLS check
    .select()
    .single();

  if (error) {
    console.error('Error updating prompt:', error);
    return { prompt: null, error };
  }

  return { prompt: data, error: null };
}


/**
 * Increment copy count for a prompt
 */
export async function incrementCopyCount(promptId: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('increment_copy_count', {
    prompt_id: promptId
  });

  if (error) {
    console.error('Error incrementing copy count:', error);
  }

  return { error };
}

/**
 * Increment a prompt's view count.
 *
 * Backed by a SECURITY DEFINER function, because the UPDATE policy on
 * `prompts` only lets a row's owner write to it — but every viewer needs
 * to be able to bump this counter.
 */
export async function incrementViewCount(promptId: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('increment_view_count', {
    prompt_id: promptId
  });

  if (error) {
    console.error('Error incrementing view count:', error);
  }

  return { error };
}

/**
 * Delete prompt, and the image it owns
 *
 * The image lives in the prompt-images bucket under a unique UUID, so once
 * the row is gone nothing points at the file. Read image_url up front.
 */
export async function deletePrompt(id: string, userId: string) {
  const { data: existing } = await supabase
    .from('prompts')
    .select('image_url')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  const { error } = await supabase
    .from('prompts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId); // RLS check

  if (error) {
    console.error('Error deleting prompt:', error);
    return { error };
  }

  // Only once the row is actually gone — if the delete were blocked the
  // prompt still needs its image. A failed cleanup leaks a file but must
  // not report the delete itself as failed.
  if (existing?.image_url) {
    const { deletePromptImage } = await import('./storage');
    const { error: cleanupError } = await deletePromptImage(existing.image_url);

    if (cleanupError) {
      console.error('Prompt deleted but image cleanup failed:', cleanupError);
    }
  }

  return { error: null };
}
