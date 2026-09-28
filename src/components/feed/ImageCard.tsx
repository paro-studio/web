import { ImageFeedItem } from "@/lib/feedTypes";
import { PromptCard } from "@/components/prompts/PromptCard";

interface ImageCardProps {
  item: ImageFeedItem;
  onLikeChange?: () => void;
  onSaveChange?: () => void;
  onLoginRequired?: () => void;
  onDelete?: () => void;
  /** Forwarded to PromptCard for above-the-fold cards. */
  priority?: boolean;
}

/**
 * ImageCard wrapper for rendering image content in the feed.
 * Delegates to PromptCard for actual rendering.
 */
export function ImageCard({ item, onLikeChange, onSaveChange, onLoginRequired, onDelete, priority }: ImageCardProps) {
  const { data } = item;

  return (
    <PromptCard
      id={data.id}
      title={data.title}
      imageUrl={data.image_url}
      toolUsed={data.tool_used}
      viewCount={data.view_count}
      copyCount={data.copy_count}
      likeCount={data.like_count}
      accuracyRating={data.accuracy_rating}
      ratingCount={data.rating_count}
      creator={{
        id: data.creator.id,
        username: data.creator.username,
        displayName: data.creator.display_name || data.creator.username,
        avatarUrl: data.creator.avatar_url,
        verified: data.creator.verified,
      }}
      tags={data.tags}
      isLiked={data.is_liked}
      isSaved={data.is_saved}
      onLikeChange={onLikeChange}
      onSaveChange={onSaveChange}
      onLoginRequired={onLoginRequired}
      onDelete={onDelete}
      priority={priority}
    />
  );
}
