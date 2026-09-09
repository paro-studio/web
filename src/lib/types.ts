/**
 * Shared TypeScript types for the application
 */

/**
 * User profile type compatible with Supabase profiles table
 */
export interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  verified?: boolean;
}

export interface NormalizedPrompt {
  id: string;
  userId: string;
  title: string;
  promptText: string;
  imageUrl: string;
  toolUsed: string;
  tags: string[];
  createdAt: string;
  viewCount?: number;
  copyCount?: number;
  accuracyRating?: number;
  ratingCount?: number;
}
