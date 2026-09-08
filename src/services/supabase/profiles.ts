/**
 * Supabase Profiles Service
 * 
 * Handles profile CRUD operations
 */

import { supabase } from './client';
import type { User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateProfileData {
  username?: string;
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  cover_url?: string;
}

/**
 * Get user profile by ID
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned - profile doesn't exist
      return null;
    }
    console.error('Error fetching profile:', error);
    return null;
  }

  return data;
}

/**
 * Fetch many profiles in one query, keyed by id.
 *
 * Use this instead of calling `getProfile` per row when enriching a list —
 * it turns N round trips into one.
 */
export async function getProfilesByIds(userIds: string[]): Promise<Map<string, Profile>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', unique);

  if (error) {
    console.error('Error fetching profiles:', error);
    return new Map();
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

/**
 * Get profile by username (for checking availability)
 */
export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile by username:', error);
    return null;
  }

  return data;
}

/**
 * Create a new profile from auth user
 * Only inserts minimal required fields to avoid RLS issues
 */
export async function createProfile(user: User) {
  // Use minimal insert shape as specified
  // NOTE: profiles table has id, username, full_name, avatar_url, cover_url, bio, website
  // Website column exists in DB but unused in frontend (left for potential future use)
  const profile = {
    id: user.id,
    full_name: user.user_metadata?.full_name ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
  };


  const { data, error } = await supabase
    .from('profiles')
    .insert([profile])
    .select()
    .single();

  if (error) {
    console.error('❌ createProfile: Insert failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      fullError: error
    });
    return { profile: null, error };
  }

  return { profile: data, error: null };
}

/**
 * Update user profile with validation
 */
export async function updateProfile(userId: string, updates: UpdateProfileData) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('❌ updateProfile: Failed:', {
      code: error.code,
      message: error.message,
      details: error.details
    });
    
    // Handle unique constraint violation for username
    if (error.code === '23505') {
      return { 
        profile: null, 
        error: {
          ...error,
          message: 'Username already taken'
        }
      };
    }
    
    return { profile: null, error };
  }

  return { profile: data, error: null };
}
