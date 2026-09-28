import { QueryError } from "@/components/QueryError";
import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Sparkles, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { peekPendingRoute, clearPendingRoute } from "@/lib/pendingRoute";
import { STANDARD_TAGS } from "@/lib/standardTags";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FeedCard } from "@/components/feed";
import { TagFilter } from "@/components/prompts/TagFilter";
import { usePrompts } from "@/hooks/usePrompts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FeedItem, toImageFeedItem, injectAdvertisements } from "@/lib/feedTypes";
import { AuthModal } from "@/components/auth/AuthModal";

type SortOption = "trending" | "newest" | "most_copied";
const SORT_OPTIONS: SortOption[] = ["trending", "newest", "most_copied"];

export default function Index() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Search and sort live in the URL alongside tags. As component state they
  // reset whenever the feed remounted, so opening a prompt and going back
  // put a Newest or searched feed back to Trending, and the restored scroll
  // position pointed at different prompts.
  const searchQuery = searchParams.get("q") ?? "";
  const sortParam = searchParams.get("sort");
  const sortBy: SortOption = SORT_OPTIONS.includes(sortParam as SortOption)
    ? (sortParam as SortOption)
    : "trending";
  const selectedTags = useMemo(
    () => [...new Set(searchParams.getAll("tag"))],
    [searchParams]
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Someone opened a shared link while signed out and got bounced here. Ask
  // them to sign in, then send them on to the page they actually wanted.
  useEffect(() => {
    if (authLoading) return;

    const pending = peekPendingRoute();
    if (!pending) return;

    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    // Clear before navigating so a route that bounces again can't loop.
    clearPendingRoute();
    navigate(pending, { replace: true });
  }, [authLoading, user, navigate]);

  const { data: prompts, isLoading: promptsLoading, isError, isFetching, refetch } = usePrompts({
    selectedTags,
    searchQuery,
    sortBy,
  });

  // Always use fixed predefined tags - never changes based on user uploads
  const displayTags = [...STANDARD_TAGS];

  const displayPrompts = useMemo(() => prompts ?? [], [prompts]);

  const handleTagToggle = (tag: string) => {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("tag");

    nextTags.forEach((selectedTag) => {
      nextParams.append("tag", selectedTag);
    });

    setSearchParams(nextParams, { replace: true });
  };

  const handleClearTags = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("tag");
    setSearchParams(nextParams, { replace: true });
  };

  const setSearchQuery = (query: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (query) nextParams.set("q", query);
    else nextParams.delete("q");
    setSearchParams(nextParams, { replace: true });
  };

  const setSortBy = (sort: SortOption) => {
    const nextParams = new URLSearchParams(searchParams);
    // Trending is the default, so it keeps the URL clean.
    if (sort === "trending") nextParams.delete("sort");
    else nextParams.set("sort", sort);
    setSearchParams(nextParams, { replace: true });
  };

  // Convert prompts to FeedItem format and prepare for future ad injection
  const feedItems: FeedItem[] = useMemo(() => {
    const imageItems = displayPrompts.map(toImageFeedItem);

    // Ad injection ready - currently disabled (no ad provider)
    // When ads are ready, pass an ad generator function:
    // return injectAdvertisements(imageItems, 8, (index) => ({ type: "advertisement", data: { id: `ad-${index}` } }));

    return injectAdvertisements(imageItems, 8);
  }, [displayPrompts]);

  // Render feed items using FeedCard
  const renderFeed = () => {
    return feedItems.map((item, index) => (
      <FeedCard
        key={item.type === "image" ? item.data.id : item.data.id}
        item={item}
        onLoginRequired={() => setAuthModalOpen(true)}
        // Enough to cover the first row on desktop and the first screen on
        // mobile. One of these is the largest contentful paint, and lazy
        // loading it was costing seconds. Everything below still lazy loads.
        priority={index < 4}
      />
    ));
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      <Navbar
        onSearch={setSearchQuery}
        searchQuery={searchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        showFilters={true}
      />

      <main className="flex-1 pt-14 sm:pt-16 lg:pt-20">
        {/* Mobile: PARO Originals (replaces Browse by tags) */}
        <section className="md:hidden px-4 py-4 sm:py-6">
          <Link
            to="/originals"
            className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-gradient-to-r from-[hsl(var(--gold))]/10 to-transparent border border-[hsl(var(--gold))]/20 hover:border-[hsl(var(--gold))]/40 transition-all"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <Sparkles className="h-4 sm:h-5 w-4 sm:w-5 text-[hsl(var(--gold))]" />
              <span className="font-serif text-base sm:text-lg">PARO Originals</span>
            </div>
            <span className="text-xs sm:text-sm text-muted-foreground">Coming Soon</span>
          </Link>
        </section>

        {/* Tablet & Desktop: Tag Filter Section */}
        <section className="hidden md:block px-4 lg:px-6 xl:px-8 py-4 lg:py-6 xl:py-8">
          <div className="max-w-[1920px] mx-auto">
            <div className="flex items-center justify-between mb-4 lg:mb-6">
              <h2 className="font-serif text-lg lg:text-xl text-muted-foreground">Browse by tags</h2>
              {/* Sort buttons - hidden on mobile, shown in hamburger menu */}
              <div className="hidden lg:flex gap-1 xl:gap-2">
                {(["trending", "newest", "most_copied"] as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => setSortBy(option)}
                    className={`px-2 xl:px-3 py-1 text-sm transition-colors rounded-sm ${sortBy === option
                      ? "text-foreground bg-secondary"
                      : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {option === "most_copied" ? "Most copied" : option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <TagFilter
              tags={displayTags}
              selectedTags={selectedTags}
              onTagToggle={handleTagToggle}
              onClearAll={handleClearTags}
            />
          </div>
        </section>

        {/* Main Prompt Feed */}
        <section className="px-4 sm:px-5 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8 border-t border-border">
          <div className="max-w-[1920px] mx-auto">
            <h2 className="font-serif text-xl sm:text-2xl mb-4 sm:mb-6">
              {sortBy === "trending" && "Trending Prompts"}
              {sortBy === "newest" && "Latest Prompts"}
              {sortBy === "most_copied" && "Most Copied Prompts"}
            </h2>

            {isError && <QueryError resource="prompts" onRetry={() => { void refetch(); }} retrying={isFetching} />}
            {promptsLoading ? (
              <div className="masonry-grid">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="masonry-item">
                    <Skeleton className="aspect-[3/4] rounded-xl" />
                    <Skeleton className="h-5 sm:h-6 mt-2 sm:mt-3 w-3/4" />
                    <Skeleton className="h-3 sm:h-4 mt-1.5 sm:mt-2 w-1/2" />
                  </div>
                ))}
              </div>
            ) : isError && !prompts ? null : displayPrompts.length === 0 ? (
              searchQuery.trim() || selectedTags.length > 0 ? (
                <div className="text-center py-12 sm:py-16 max-w-md mx-auto">
                  <p className="font-serif text-lg sm:text-xl text-muted-foreground">
                    No prompts found
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                    Try adjusting your search or filters
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // One update: two back to back would each start from
                      // the same old params, and the second would undo the first.
                      const nextParams = new URLSearchParams(searchParams);
                      nextParams.delete("q");
                      nextParams.delete("tag");
                      setSearchParams(nextParams, { replace: true });
                    }}
                    className="mt-4"
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12 sm:py-16 max-w-md mx-auto">
                  <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
                    <Sparkles className="h-6 w-6 text-gold" />
                  </div>
                  <h3 className="font-serif text-xl sm:text-2xl mb-2">
                    No prompts yet
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Be the first to share your creative prompt and inspire the community.
                  </p>
                  <Button asChild size="default" className="gap-2">
                    <Link to="/upload">
                      <Plus className="h-4 w-4" />
                      Post a prompt
                    </Link>
                  </Button>
                </div>
              )
            ) : (
              <div className="masonry-grid">
                {renderFeed()}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultMode="login"
      />
    </div>
  );
}