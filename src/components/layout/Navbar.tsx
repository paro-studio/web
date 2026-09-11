import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, Sparkles, TrendingUp, Copy, Users, HelpCircle, Plus, Heart, Bookmark, DollarSign, MessageSquare, FileText, Github } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import logo from "@/assets/logo.webp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortOption = "trending" | "newest" | "most_copied";

interface NavbarProps {
  onSearch?: (query: string) => void;
  searchQuery?: string;
  sortBy?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  showFilters?: boolean;
}

export function Navbar({ onSearch, searchQuery = "", sortBy, onSortChange, showFilters = false }: NavbarProps) {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { user, profile, signOut } = useAuth();

  const sortOptions: { value: SortOption; label: string; icon: typeof TrendingUp }[] = [
    { value: "trending", label: "Trending", icon: TrendingUp },
    { value: "most_copied", label: "Most Copied", icon: Copy },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(localSearch);
    setMobileSearchOpen(false);
  };

  const openLogin = () => {
    setAuthMode("login");
    setAuthModalOpen(true);
  };

  const openSignup = () => {
    setAuthMode("signup");
    setAuthModalOpen(true);
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border safe-area-inset">
        <div className="container mx-auto px-4 sm:px-5 lg:px-6 xl:px-8">
          {/* Main Header Row - Responsive height */}
          <div className="flex items-center justify-between h-14 sm:h-16 lg:h-20">
            {/* Logo - Fluid sizing */}
            <Link to="/" className="flex items-center flex-shrink-0">
              <img
                src={logo}
                alt="Paro Logo"
                className="h-10 sm:h-12 lg:h-14 w-auto object-contain"
              />
              <span className="font-serif text-xl sm:text-2xl lg:text-3xl tracking-tight">
                PARO
              </span>
            </Link>

            {/* Tablet Only - PARO Originals between logo and search */}
            <div className="hidden md:flex lg:hidden items-center">
              <Link
                to="/originals"
                className="group relative inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-r from-gold/20 to-gold/10 hover:from-gold/30 hover:to-gold/20 transition-all duration-300"
              >
                <Sparkles className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-gold" />
                <span className="text-xs tracking-editorial uppercase text-foreground dark:text-gold font-medium whitespace-nowrap">
                  PARO Originals
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className=" hidden lg:flex items-center gap-4 xl:gap-8">
              <Link
                to="/originals"
                className="group relative inline-flex items-center gap-2 px-3 xl:px-4 py-2 rounded-full bg-gradient-to-r from-gold/20 to-gold/10 hover:from-gold/30 hover:to-gold/20 transition-all duration-300"
              >
                <Sparkles className="h-4 w-4 text-gold" />
                <span className="text-sm tracking-editorial uppercase text-foreground dark:text-gold font-medium whitespace-nowrap">
                  PARO Originals
                </span>
              </Link>

              {/* Search - Flexible width */}
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search prompts..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-48 xl:w-64 pl-10 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-ring"
                />
              </form>

              {/* Create Button - Desktop */}
              {user ? (
                <Link
                  to="/upload"
                  className="flex items-center gap-1.5 px-3 xl:px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create</span>
                </Link>
              ) : (
                <button
                  onClick={openLogin}
                  className="flex items-center gap-1.5 px-3 xl:px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create</span>
                </button>
              )}
            </div>

            {/* Theme Toggle & Auth - Desktop */}
            <div className="hidden lg:flex items-center gap-2 xl:gap-3">
              <ThemeToggle />
              <a
                href="https://github.com/paro-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 w-9 rounded-full bg-secondary/50 hover:bg-secondary transition-colors inline-flex items-center justify-center text-foreground"
                title="GitHub Repository"
                aria-label="GitHub Repository"
              >
                <Github className="h-4 w-4" />
              </a>
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 xl:h-10 xl:w-10 rounded-full p-0">
                      <Avatar className="h-9 w-9 xl:h-10 xl:w-10">
                        <AvatarImage src={profile?.avatar_url || ""} alt={profile?.display_name || ""} />
                        <AvatarFallback className="bg-secondary text-secondary-foreground font-medium">
                          {profile?.display_name?.charAt(0) || user.email?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {profile?.id && (
                      <DropdownMenuItem asChild>
                        <Link to={`/profile/${profile.id}`}>Profile</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link to="/upload">Upload Prompt</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/saved" className="flex items-center gap-2">
                        <Bookmark className="h-4 w-4" />
                        Saved
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/liked" className="flex items-center gap-2">
                        <Heart className="h-4 w-4" />
                        Liked
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/top-creators" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Top Creators
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/feedback" className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Feedback
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/guidelines" className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Community Guidelines
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href="https://github.com/paro-studio"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        <Github className="h-4 w-4" />
                        GitHub
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {/* Earn With PARO */}
                    <DropdownMenuItem asChild>
                      <Link to="/earn" className="group flex items-center gap-2 text-gold">
                        <DollarSign className="h-4 w-4 transition-colors group-hover:text-black group-focus:text-black" />
                        <span className="transition-colors group-hover:text-black group-focus:text-black">Earn With PARO</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="text-destructive">
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={openLogin}
                    className="text-sm tracking-wide"
                  >
                    Log in
                  </Button>
                  <Button
                    onClick={openSignup}
                    className="text-sm tracking-wide"
                  >
                    Sign up
                  </Button>
                </>
              )}
            </div>

            {/* Mobile/Tablet Right Section - Search Icon + Create + Profile Avatar */}
            <div className="flex lg:hidden items-center gap-1.5 sm:gap-2">
              {/* Search Icon - Mobile */}
              <button
                onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                className="p-2 hover:bg-secondary rounded-full transition-colors touch-target flex items-center justify-center"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Create Button - Mobile/Tablet */}
              {user ? (
                <Link
                  to="/upload"
                  className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
                  <span>Create</span>
                </Link>
              ) : (
                <button
                  onClick={openLogin}
                  className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
                  <span>Create</span>
                </button>
              )}

              {/* Profile Avatar with Dropdown - Mobile (replaces hamburger) */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0">
                      <Avatar className="h-8 w-8 sm:h-9 sm:w-9 ring-2 ring-border">
                        <AvatarImage src={profile?.avatar_url || ""} alt={profile?.display_name || ""} />
                        <AvatarFallback className="bg-secondary text-secondary-foreground font-medium text-xs sm:text-sm">
                          {profile?.display_name?.charAt(0) || user.email?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-[80vh] overflow-y-auto">
                    {/* Sort Options */}
                    {showFilters && onSortChange && (
                      <>
                        <div className="px-2 py-1.5">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sort By</p>
                        </div>
                        {sortOptions.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => onSortChange(option.value)}
                            className={sortBy === option.value ? "bg-secondary" : ""}
                          >
                            <option.icon className="h-4 w-4 mr-2" />
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </>
                    )}

                    {/* PARO Originals */}
                    <DropdownMenuItem asChild>
                      <Link to="/originals" className="group flex items-center gap-2 text-gold">
                        <Sparkles className="h-4 w-4 transition-colors group-hover:text-black group-focus:text-black" />
                        <span className="text-foreground dark:text-gold transition-colors group-hover:text-black group-focus:text-black">PARO Originals</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Profile Links */}
                    {profile?.id && (
                      <DropdownMenuItem asChild>
                        <Link to={`/profile/${profile.id}`}>Profile</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link to="/saved" className="flex items-center gap-2">
                        <Bookmark className="h-4 w-4" />
                        Saved
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/liked" className="flex items-center gap-2">
                        <Heart className="h-4 w-4" />
                        Liked
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/feedback" className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Feedback
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/guidelines" className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Community Guidelines
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Earn With PARO */}
                    <DropdownMenuItem asChild>
                      <Link to="/earn" className="group flex items-center gap-2 text-gold">
                        <DollarSign className="h-4 w-4 transition-colors group-hover:text-black group-focus:text-black" />
                        <span className="transition-colors group-hover:text-black group-focus:text-black">Earn With PARO</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-sm">Theme</span>
                      <ThemeToggle />
                    </div>
                    <DropdownMenuSeparator />

                    {/* Support */}
                    <DropdownMenuItem asChild>
                      <a href="mailto:support@parostudios.in" className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        Support
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Logout */}
                    <DropdownMenuItem onClick={signOut} className="text-destructive">
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <a
                    href="https://github.com/paro-studio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-secondary/50 hover:bg-secondary transition-colors inline-flex items-center justify-center text-foreground"
                    title="GitHub Repository"
                    aria-label="GitHub Repository"
                  >
                    <Github className="h-4 w-4" />
                  </a>
                  <Button
                    variant="ghost"
                    onClick={openLogin}
                    className="text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3 rounded-full"
                  >
                    Log in
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Mobile Expandable Search Bar */}
          {mobileSearchOpen && (
            <div className="lg:hidden pb-3 animate-slide-down">
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search prompts..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full pl-10 pr-10 bg-secondary/50 border-0"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  aria-label="Close search"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </form>
            </div>
          )}

        </div>
      </nav>

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultMode={authMode}
      />
    </>
  );
}