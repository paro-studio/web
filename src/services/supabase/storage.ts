/**
 * Supabase Storage Service
 * Handles image uploads for avatars and banners
 */

import { supabase } from './client';
import { getErrorMessage } from "@/lib/errors";
import { resizeImage } from "@/lib/imageResize";

const AVATAR_BUCKET = 'avatars';
const BANNER_BUCKET = 'banners';

// Checked after downscaling, and they match the file_size_limit set on each
// bucket. A photo straight off a phone comes in far above these and lands well
// under them, so in practice these are a backstop rather than something users
// hit. Keep them in step with supabase/migrations, the bucket limits are the
// real enforcement.
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_BANNER_SIZE = 5 * 1024 * 1024; // 5MB

// Checked before decoding. Decoding something enormous can lock up the tab, so
// this rejects the pathological case before we touch it. Deliberately generous.
export const MAX_SOURCE_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Storage path extensions, keyed by MIME type so the path never contains
// anything taken from a user supplied filename.
const EXT_FOR_TYPE: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

// Avatars render at well under 200px and banners span a page at most. Prompt
// images are the product itself, so they keep more resolution and a higher
// quality setting than the other two.
const AVATAR_BOUNDS = { maxWidth: 512, maxHeight: 512 };
const BANNER_BOUNDS = { maxWidth: 1600, maxHeight: 1600 };
const PROMPT_BOUNDS = { maxWidth: 2048, maxHeight: 2048, quality: 0.9 };

interface UploadResult {
  url: string | null;
  error: string | null;
}

/**
 * Avatars and banners live at a fixed path per user and are overwritten in
 * place, so their public URL never changes and the browser keeps serving the
 * previous image from cache for an hour. Uploading appeared to do nothing.
 * A version parameter gives each upload a distinct URL.
 *
 * Prompt images do not need this, their paths carry a fresh UUID each time.
 */
function withCacheBust(url: string): string {
  return `${url}?v=${Date.now()}`;
}

/**
 * Upload avatar image to Supabase Storage
 * Path: avatars/{userId}/avatar.jpg
 * Always overwrites existing file
 */
export async function uploadAvatar(userId: string, file: File): Promise<UploadResult> {
  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        url: null,
        error: 'Invalid file type. Please use JPEG, PNG, or WebP.'
      };
    }

    if (file.size > MAX_SOURCE_SIZE) {
      return {
        url: null,
        error: 'That image is too large to process. Please use one under 25MB.'
      };
    }

    // Downscale before uploading. A phone photo is several MB and renders in a
    // circle a few dozen pixels wide, so this is the difference between a slow
    // upload and an instant one.
    const resized = await resizeImage(file, AVATAR_BOUNDS);

    if (resized.size > MAX_AVATAR_SIZE) {
      return {
        url: null,
        error: 'File too large. Avatar must be less than 2MB.'
      };
    }

    // Fixed path, overwritten each time. The extension stays .jpg for the sake
    // of deleteAvatar and any URL already stored on a profile; what the browser
    // actually serves is decided by contentType below.
    const filePath = `${userId}/avatar.jpg`;


    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, resized, {
        upsert: true,
        contentType: resized.type
      });

    if (error) {
      console.error('❌ Avatar upload failed:', error);
      return {
        url: null,
        error: getErrorMessage(error)
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(filePath);


    return {
      url: withCacheBust(publicUrl),
      error: null
    };
  } catch (error) {
    console.error('❌ Avatar upload error:', error);
    return {
      url: null,
      error: getErrorMessage(error, 'Upload failed')
    };
  }
}

/**
 * Upload banner image to Supabase Storage
 * Path: banners/{userId}/banner.jpg
 * Always overwrites existing file
 */
export async function uploadBanner(userId: string, file: File): Promise<UploadResult> {
  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        url: null,
        error: 'Invalid file type. Please use JPEG, PNG, or WebP.'
      };
    }

    if (file.size > MAX_SOURCE_SIZE) {
      return {
        url: null,
        error: 'That image is too large to process. Please use one under 25MB.'
      };
    }

    const resized = await resizeImage(file, BANNER_BOUNDS);

    if (resized.size > MAX_BANNER_SIZE) {
      return {
        url: null,
        error: 'File too large. Banner must be less than 5MB.'
      };
    }

    // Fixed path, same reasoning as the avatar above.
    const filePath = `${userId}/banner.jpg`;


    const { data, error } = await supabase.storage
      .from(BANNER_BUCKET)
      .upload(filePath, resized, {
        upsert: true,
        contentType: resized.type
      });

    if (error) {
      console.error('❌ Banner upload failed:', error);
      return {
        url: null,
        error: getErrorMessage(error)
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BANNER_BUCKET)
      .getPublicUrl(filePath);


    return {
      url: withCacheBust(publicUrl),
      error: null
    };
  } catch (error) {
    console.error('❌ Banner upload error:', error);
    return {
      url: null,
      error: getErrorMessage(error, 'Upload failed')
    };
  }
}

/**
 * Delete avatar from storage (optional - for cleanup)
 */
export async function deleteAvatar(userId: string): Promise<{ error: string | null }> {
  const filePath = `${userId}/avatar.jpg`;
  
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error('❌ Failed to delete avatar:', error);
    return { error: getErrorMessage(error) };
  }

  return { error: null };
}

/**
 * Delete banner from storage (optional - for cleanup)
 */
export async function deleteBanner(userId: string): Promise<{ error: string | null }> {
  const filePath = `${userId}/banner.jpg`;
  
  const { error } = await supabase.storage
    .from(BANNER_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error('❌ Failed to delete banner:', error);
    return { error: getErrorMessage(error) };
  }

  return { error: null };
}

/**
 * Upload prompt image to Supabase Storage
 * Path: prompt-images/{userId}/{uuid}.ext
 * Does NOT overwrite - uses unique UUID for each image
 */
export async function uploadPromptImage(userId: string, file: File): Promise<UploadResult> {
  const PROMPT_BUCKET = 'prompt-images';
  const MAX_SIZE = 3 * 1024 * 1024; // 3MB

  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        url: null,
        error: 'Invalid file type. Please use JPEG, PNG, or WebP.'
      };
    }

    if (file.size > MAX_SOURCE_SIZE) {
      return {
        url: null,
        error: 'That image is too large to process. Please use one under 25MB.'
      };
    }

    // Prompt images are the thing people came to look at, so they keep more
    // resolution and quality than avatars and banners.
    const resized = await resizeImage(file, PROMPT_BOUNDS);

    if (resized.size > MAX_SIZE) {
      return {
        url: null,
        error: 'File too large. Image must be less than 3MB.'
      };
    }

    // The extension used to come from the user supplied filename, which meant
    // an attacker chose part of the storage path. It is derived from the MIME
    // type now, so the set of possible values is ours. resizeImage falls back
    // to the original file on failure, so this reads the type of what is
    // actually being uploaded rather than assuming webp.
    const fileExt = EXT_FOR_TYPE[resized.type] ?? 'jpg';
    const uuid = crypto.randomUUID();
    const filePath = `${userId}/${uuid}.${fileExt}`;


    const { data, error } = await supabase.storage
      .from(PROMPT_BUCKET)
      .upload(filePath, resized, {
        upsert: false, // Do NOT overwrite
        contentType: resized.type
      });

    if (error) {
      console.error('❌ Prompt image upload failed:', error);
      return {
        url: null,
        error: getErrorMessage(error)
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(PROMPT_BUCKET)
      .getPublicUrl(filePath);


    return {
      url: publicUrl,
      error: null
    };
  } catch (error) {
    console.error('❌ Prompt image upload error:', error);
    return {
      url: null,
      error: getErrorMessage(error, 'Upload failed')
    };
  }
}

/**
 * Delete prompt image from storage (cleanup after failed DB insert)
 */
export async function deletePromptImage(imageUrl: string): Promise<{ error: string | null }> {
  const PROMPT_BUCKET = 'prompt-images';
  
  try {
    // Extract file path from public URL
    // URL format: https://.../storage/v1/object/public/prompt-images/{userId}/{uuid}.ext
    const urlParts = imageUrl.split('/prompt-images/');
    if (urlParts.length < 2) {
      return { error: 'Invalid image URL format' };
    }
    
    const filePath = urlParts[1];
    
    
    const { data, error } = await supabase.storage
      .from(PROMPT_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('❌ Failed to delete prompt image:', error);
      return { error: getErrorMessage(error) };
    }

    // remove() does NOT error when RLS hides the object from us — it just
    // reports that it removed nothing. Silent no-op, so check what came back.
    if (!data || data.length === 0) {
      console.error('❌ Image not removed:', filePath, '— no DELETE policy on the bucket?');
      return { error: 'Image was not removed. Check the prompt-images DELETE policy.' };
    }

    return { error: null };
  } catch (error) {
    console.error('❌ Delete prompt image error:', error);
    return { error: getErrorMessage(error, 'Delete failed') };
  }
}
