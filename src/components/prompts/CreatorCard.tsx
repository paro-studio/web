import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";

interface CreatorCardProps {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  promptCount: number;
  followerCount: number;
  verified?: boolean;
}

export function CreatorCard({
  id,
  username,
  displayName,
  avatarUrl,
  promptCount,
  followerCount,
  verified = false,
}: CreatorCardProps) {
  return (
    <Link
      to={`/profile/${id}`}
      className="flex items-center gap-4 p-4 bg-card rounded-sm hover-lift transition-all duration-medium"
    >
      <Avatar className="h-14 w-14">
        <AvatarImage src={avatarUrl || ""} alt={displayName || username} />
        <AvatarFallback className="bg-secondary text-secondary-foreground font-serif text-lg">
          {(displayName || username).charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <h4 className="font-serif text-lg truncate flex items-center gap-1.5">
          <span className="truncate">{displayName || username}</span>
          {verified && <VerifiedBadge />}
        </h4>
        <p className="text-sm text-muted-foreground">@{username}</p>
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span>{promptCount} prompts</span>
          <span>{followerCount.toLocaleString()} followers</span>
        </div>
      </div>
    </Link>
  );
}
