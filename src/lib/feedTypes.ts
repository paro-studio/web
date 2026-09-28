// Feed item type definitions for mixed-content architecture
// Supports images now, advertisements in future

export type FeedItemType = "image" | "advertisement";

export interface ImageFeedItem {
  type: "image";
  data: {
    id: string;
    title: string;
    image_url: string;
    tool_used: string;
    view_count: number;
    copy_count: number;
    like_count: number;
    created_at: string;
    creator: {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      verified: boolean;
    };
    tags: string[];
    is_liked: boolean;
    is_saved: boolean;
    accuracy_rating?: number;
    rating_count?: number;
  };
}

export interface AdvertisementFeedItem {
  type: "advertisement";
  data: {
    id: string;
    // Future ad properties will be added here
    // e.g., advertiser, creative_url, click_url, etc.
  };
}

export type FeedItem = ImageFeedItem | AdvertisementFeedItem;

/**
 * Utility to inject advertisements into a content stream
 * Can be used when ads are ready to be displayed
 * 
 * @param items - Array of image feed items
 * @param adInterval - Insert ad after every N items (default: 8)
 * @param getAd - Function to generate ad items
 * @returns Mixed array with ads injected
 */
export function injectAdvertisements(
  items: ImageFeedItem[],
  adInterval: number = 8,
  getAd?: (index: number) => AdvertisementFeedItem
): FeedItem[] {
  if (!getAd) {
    // No ad provider configured, return items as-is
    return items;
  }

  const result: FeedItem[] = [];
  let adIndex = 0;

  items.forEach((item, index) => {
    result.push(item);

    // Insert ad after every adInterval items
    if ((index + 1) % adInterval === 0 && index < items.length - 1) {
      result.push(getAd(adIndex));
      adIndex++;
    }
  });

  return result;
}

/**
 * Convert enriched prompt data from usePrompts to ImageFeedItem format
 * Transforms camelCase (from usePrompts) to snake_case (for FeedItem)
 */
export function toImageFeedItem(prompt: {
  id: string;
  title: string;
  imageUrl: string;    // camelCase from usePrompts
  toolUsed: string;    // camelCase from usePrompts
  viewCount: number;
  copyCount: number;
  createdAt: string;
  tags: string[];
  creator: {
    id: string;
    username: string;
    displayName: string;  // camelCase from usePrompts
    avatarUrl: string | null;
    verified: boolean;
  };
  likeCount: number;
  isLiked: boolean;
  isSaved: boolean;
  accuracyRating?: number;
  ratingCount?: number;
}): ImageFeedItem {
  return {
    type: "image",
    data: {
      id: prompt.id,
      title: prompt.title,
      image_url: prompt.imageUrl,              // Transform to snake_case
      tool_used: prompt.toolUsed,              // Transform to snake_case
      view_count: prompt.viewCount,
      copy_count: prompt.copyCount,
      like_count: prompt.likeCount,
      created_at: prompt.createdAt,
      creator: {
        id: prompt.creator.id,
        username: prompt.creator.username,
        display_name: prompt.creator.displayName,  // Transform to snake_case
        avatar_url: prompt.creator.avatarUrl,
        verified: prompt.creator.verified,
      },
      tags: prompt.tags,
      is_liked: prompt.isLiked,
      is_saved: prompt.isSaved,
      accuracy_rating: prompt.accuracyRating,
      rating_count: prompt.ratingCount,
    },
  };
}

