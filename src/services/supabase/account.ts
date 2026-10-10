/**
 * Supabase Account Service
 * Deletes the signed-in user's account through the delete-account Edge Function.
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './client';

const FALLBACK_ERROR = "Couldn't delete your account. Please try again.";

/**
 * Delete the signed-in user's account, their rows and their uploaded files.
 *
 * This has to go through `supabase/functions/delete-account`: deleting an auth
 * user needs the service role key, which never ships to the browser. The
 * function works out who to delete from the access token that `invoke` sends,
 * so there is nothing to pass here.
 *
 * On success the session is no longer valid. Sign out straight after.
 */
export async function deleteAccount(): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });

  if (!error) return { error: null };

  console.error('Error deleting account:', error);

  // The function answers failures with { error: "..." } written for people,
  // like "Could not delete your files. Nothing was deleted, try again."
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string' && body.error) return { error: body.error };
    } catch {
      // Not JSON. Fall through to the generic message.
    }
  }

  return { error: FALLBACK_ERROR };
}
