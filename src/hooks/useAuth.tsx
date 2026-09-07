import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase/client';
import * as supabaseAuth from '@/services/supabase/auth';
import { getProfile } from '@/services/supabase/profiles';
import { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

// User type compatible with both Supabase and mock
interface User {
  id: string;
  email?: string;
}

/**
 * Auth Context
 * 
 * - user: Derived from session.user (synchronous after init)
 * - session: Supabase session (synchronous after init)
 * - profile: User profile data (ASYNC, can be null even when authenticated)
 * - loading: True during auth initialization and state changes
 * - needsProfileCompletion: True if user is authenticated but has no username
 */
interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  needsProfileCompletion: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // `authLoading` covers session restore. Profile readiness is DERIVED rather
  // than stored: we record which user's fetch has finished, so the pending
  // state is true from the very first render that has a user.
  //
  // A `profileLoading` boolean cannot do this. It only flips to true inside an
  // effect, which runs after the render commits — leaving one render where the
  // user is known, loading reads false, and profile is still null. That render
  // made needsProfileCompletion true and bounced signed-in users to
  // /complete-profile, which then sent them to "/".
  const [authLoading, setAuthLoading] = useState(true);
  const [profileFetchedFor, setProfileFetchedFor] = useState<string | null>(null);
  const { toast } = useToast();

  const profilePending = !!user && profileFetchedFor !== user.id;
  const loading = authLoading || profilePending;

  const fetchProfile = async (userId: string) => {
    try {
      // First, ensure profile exists in database (creates if doesn't exist)
      const currentUser = await supabaseAuth.getCurrentUser();
      
      if (currentUser) {
        const { profile: supabaseProfile, error } = await supabaseAuth.ensureProfile(currentUser);
        

        if (error) {
          console.error("❌ fetchProfile: Error ensuring profile:", error);
          return null;
        }

        if (supabaseProfile) {
          // Convert Supabase profile to UserProfile format
          const userProfile = {
            id: supabaseProfile.id,
            username: supabaseProfile.username,
            display_name: supabaseProfile.full_name || supabaseProfile.username || null,
            avatar_url: supabaseProfile.avatar_url,
            cover_url: supabaseProfile.cover_url,
            bio: supabaseProfile.bio,
            verified: supabaseProfile.verified ?? false,
          };
          return userProfile;
        }
      }

      // Fallback: try to fetch existing profile directly
      const supabaseProfile = await getProfile(userId);
      if (supabaseProfile) {
        return {
          id: supabaseProfile.id,
          username: supabaseProfile.username,
          display_name: supabaseProfile.full_name || supabaseProfile.username || null,
          avatar_url: supabaseProfile.avatar_url,
          cover_url: supabaseProfile.cover_url,
          bio: supabaseProfile.bio,
          verified: supabaseProfile.verified ?? false,
        };
      }

      console.error('❌ fetchProfile: No profile found - returning null');
      return null;
    } catch (error) {
      console.error("❌ fetchProfile: Exception caught:", error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    /**
     * This callback MUST stay synchronous.
     *
     * supabase-js holds an internal lock while it dispatches auth events.
     * Awaiting anything here — especially another `supabase.auth.*` call —
     * tries to re-acquire that lock from inside the lock and deadlocks. The
     * callback then never finishes, `setAuthLoading(false)` never runs, and
     * the app hangs on its loading state after every refresh.
     *
     * So: derive everything from the `nextSession` argument only, and do the
     * profile fetch in the separate effect below, outside the lock.
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // INITIAL_SESSION is deliberately ignored: it can arrive with a null
      // session while a stored-but-expired token is still being refreshed.
      // Acting on that null signs the user out on every page refresh, which
      // bounces them off whatever protected route they were on. getSession()
      // below is the authoritative read of the starting state.
      if (event === 'INITIAL_SESSION') return;

      setSession(nextSession);
      setUser(
        nextSession?.user
          ? { id: nextSession.user.id, email: nextSession.user.email }
          : null
      );

      if (!nextSession?.user) {
        setProfile(null);
      }

      setAuthLoading(false);
    });

    // Subscribe first, then read — so nothing that happens mid-read is missed.
    let cancelled = false;

    supabase.auth.getSession()
      .then(({ data: { session: initialSession } }) => {
        if (cancelled) return;

        setSession(initialSession);
        setUser(
          initialSession?.user
            ? { id: initialSession.user.id, email: initialSession.user.email }
            : null
        );
      })
      .catch((error) => {
        console.error('Failed to restore session:', error);
      })
      .finally(() => {
        // Always clears, even on failure — otherwise the app loads forever.
        if (!cancelled) setAuthLoading(false);
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Load the profile whenever the signed-in user changes. Runs outside the
  // auth callback, so it is safe to call Supabase here.
  useEffect(() => {
    const userId = user?.id;

    if (!userId) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    fetchProfile(userId)
      .then((profileData) => {
        if (!cancelled) setProfile(profileData);
      })
      .finally(() => {
        // Marks this user's fetch as settled, success or not. Until this runs,
        // profilePending stays true and consumers keep waiting.
        if (!cancelled) setProfileFetchedFor(userId);
      });

    return () => {
      cancelled = true;
    };
    // Keyed on the id only: a token refresh hands us a new session object for
    // the same user, and that should not refetch the profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabaseAuth.signInWithGoogle();
      
      if (error) {
        toast({
          title: "Sign in failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      // OAuth redirect will happen, session will be set by onAuthStateChange
      return { error: null };
    } catch (error) {
      const err = error as Error;
      toast({
        title: "Sign in failed",
        description: err.message,
        variant: "destructive",
      });
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string) => {
    // For now, redirect to Google OAuth
    toast({
      title: "Please use Google Sign In",
      description: "Email/password signup coming soon!",
    });
    return { error: new Error("Not implemented") };
  };

  const signIn = async (email: string, password: string) => {
    // For now, redirect to Google OAuth
    toast({
      title: "Please use Google Sign In",
      description: "Email/password login coming soon!",
    });
    return { error: new Error("Not implemented") };
  };

  const signOut = async () => {
    // Always clear local state, even if Supabase signOut fails
    // This prevents the UI from getting stuck in a logged-in state
    try {
      await supabaseAuth.signOut();
    } catch (error) {
      console.error("Error signing out from Supabase:", error);
      // Continue anyway - we still want to clear local state
    }
    
    // Clear state regardless of API result
    setUser(null);
    setSession(null);
    setProfile(null);
    
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        // The `!loading` guard is load-bearing: without it there is a window
        // during startup where the user is set but the profile has not arrived
        // yet, and ProtectedRoute bounces a perfectly valid account to
        // /complete-profile.
        needsProfileCompletion: !!user && !loading && (!profile || !profile.username),
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
