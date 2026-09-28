import { PageSkeleton } from "@/components/PageSkeleton";
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { setPendingRoute } from '@/lib/pendingRoute';
import { Navbar } from '@/components/layout/Navbar';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Guards routes that require authentication and profile completion
 * 
 * Logic:
 * 1. If loading → show loading state
 * 2. If not authenticated → redirect to home
 * 3. If needs profile completion AND not on /complete-profile → redirect to /complete-profile
 * 4. Otherwise → render children
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, needsProfileCompletion } = useAuth();
  const location = useLocation();

  // Show loading state while auth initializes
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 container mx-auto px-4 text-center py-16">
          <PageSkeleton />
        </main>
      </div>
    );
  }

  // Redirect to home if not authenticated. Carry where they were headed, so
  // the page can be restored instead of dumping them on the home feed. Router
  // state covers the in-app hop; the stored copy also survives the Google
  // sign-in redirect, which re-enters the app at "/" with no state at all.
  if (!user) {
    setPendingRoute(location.pathname + location.search);
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Redirect to profile completion if needed
  // CRITICAL: Check location.pathname to prevent redirect loop
  if (needsProfileCompletion && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace state={{ from: location }} />;
  }

  // All checks passed - render protected content
  return <>{children}</>;
}
