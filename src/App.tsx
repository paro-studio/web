import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";

// The feed is what most visits land on, so it ships in the main bundle. Paying
// an extra round trip to fetch it as a chunk would slow down the common case.
import Index from "./pages/Index";

// Everything else is split out. Importing all of these eagerly put the whole
// app in one 907kB bundle, so opening the feed also downloaded Upload,
// Settings, Profile and every other page before it could render.
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const CommunityGuidelines = lazy(() => import("./pages/CommunityGuidelines"));
const ParoOriginals = lazy(() => import("./pages/ParoOriginals"));
const PromptDetail = lazy(() => import("./pages/PromptDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Upload = lazy(() => import("./pages/Upload"));
const Saved = lazy(() => import("./pages/Saved"));
const Liked = lazy(() => import("./pages/Liked"));
const TopCreators = lazy(() => import("./pages/TopCreators"));
const Settings = lazy(() => import("./pages/Settings"));
const EarnWithParo = lazy(() => import("./pages/EarnWithParo"));
const Feedback = lazy(() => import("./pages/Feedback"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // React Query defaults staleTime to 0, which marks every result stale the
      // moment it arrives. The cache filled up but was never allowed to serve
      // anything, so going back to the feed refetched it in full every time.
      staleTime: 60_000,
      // Keep unused data around long enough that normal back and forth between
      // pages hits the cache instead of the network.
      gcTime: 5 * 60_000,
      // Also on by default. Switching to another tab and back triggered a full
      // refetch, which is not worth it for a prompt gallery.
      refetchOnWindowFocus: false,
    },
  },
});

// Shown only while a route chunk downloads, which is brief. Each page renders
// its own skeleton once it is loaded, so this stays deliberately plain.
const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Complete Profile - accessible to authenticated users with incomplete profiles */}
                <Route path="/complete-profile" element={<CompleteProfile />} />

                {/* Public Route - home page accessible to everyone */}
                <Route path="/" element={<Index />} />
                <Route path="/guidelines" element={<CommunityGuidelines />} />
                <Route path="/community-guidelines" element={<CommunityGuidelines />} />

                {/* Protected Routes - require authentication and username */}
                <Route path="/originals" element={<ProtectedRoute><ParoOriginals /></ProtectedRoute>} />
                <Route path="/prompt/:id" element={<ProtectedRoute><PromptDetail /></ProtectedRoute>} />
                <Route path="/profile/:id" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
                <Route path="/saved" element={<ProtectedRoute><Saved /></ProtectedRoute>} />
                <Route path="/liked" element={<ProtectedRoute><Liked /></ProtectedRoute>} />
                <Route path="/top-creators" element={<ProtectedRoute><TopCreators /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/earn" element={<ProtectedRoute><EarnWithParo /></ProtectedRoute>} />
                <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                {/* Not protected: a wrong URL should show 404, not bounce the
                    visitor to "/" or into the profile-completion flow. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
