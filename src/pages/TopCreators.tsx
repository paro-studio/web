
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CreatorCard } from "@/components/prompts/CreatorCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopCreators } from "@/hooks/usePrompts";

export default function TopCreators() {
  // Fetch top creators using hook
  const { data: topCreators, isLoading } = useTopCreators(20);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-14 sm:pt-16 lg:pt-20">
        <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-6 sm:mb-8">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-gold" />
              <h1 className="font-serif text-2xl sm:text-3xl">Top Creators</h1>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {[...Array(9)].map((_, i) => (
                  <Skeleton key={i} className="h-20 sm:h-24 rounded-xl" />
                ))}
              </div>
            ) : !topCreators || topCreators.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">No creators yet</p>
                <Link to="/" className="text-gold hover:underline text-sm sm:text-base">
                  Explore prompts
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {topCreators.map((creator) => (
                  <CreatorCard
                    key={creator.username}
                    id={creator.id}
                    username={creator.username}
                    displayName={creator.displayName}
                    avatarUrl={creator.avatarUrl}
                    promptCount={creator.promptCount}
                    followerCount={creator.followerCount}
                    verified={creator.verified}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}